"""Source specifications must not carry credentials into state or reports."""

import json
import tempfile
import unittest
from pathlib import Path

from workbench.__main__ import render_report
from workbench.core import inspect_snapshot
from workbench.store import authorize, connect, get_run, save_run


class DependencyPrivacyTest(unittest.TestCase):
    def test_source_specifications_are_redacted_before_persistence(self):
        specifications = [
            "git+https://fixture-user:fixture-password@github.com/owner/repo.git?token=fixture-query#fixture-fragment",
            "https://example.invalid/archive.tgz?access_token=fixture-query#fixture-fragment",
            "git+ssh://fixture-user:fixture-password@example.invalid/owner/repo.git",
            "git@example.invalid:owner/repo.git#fixture-fragment",
            "github:owner/repo#fixture-fragment",
            "owner/repo#fixture-fragment",
            "file:../fixture-private-path",
            "npm:fixture-package@https://example.invalid/?token=fixture-query",
            "^1.0.0\n\n![fixture](https://example.invalid/?token=fixture-query)",
        ]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            snapshot = root / "snapshot"
            snapshot.mkdir()
            (snapshot / "package.json").write_text(json.dumps({
                "dependencies": {f"fixture-{i}": value for i, value in enumerate(specifications)},
                "devDependencies": {"fixture-dev": specifications[0]},
            }), encoding="utf-8")
            result = inspect_snapshot(snapshot)
            self.assertEqual(len(result["dependencies"]), len(specifications) + 1)
            self.assertTrue(all(item["version"] == "[REDACTED]" for item in result["dependencies"]))
            state = root / "state.sqlite3"
            with connect(state) as db:
                authorize(db, "owner/repo")
                run_id = save_run(db, "owner/repo", "fixture-revision", result)
                run = get_run(db, run_id)
                report = render_report(run)
                stored = json.dumps(run)
            for secret in ("fixture-password", "fixture-query", "fixture-fragment", "fixture-private-path"):
                self.assertNotIn(secret, stored)
                self.assertNotIn(secret, report)
                self.assertNotIn(secret.encode(), state.read_bytes())

    def test_ordinary_versions_ranges_tags_and_names_are_preserved(self):
        versions = ["1.2.3", "1.2.3-beta.1+build.7", "^1.2.0", "~2.4", ">=1.0.0 <2.0.0",
                    "1.2 - 1.4", "^1.0.0 || ^2.0.0", "1.x", "*", "v1.2.3", "latest", "next", "canary-tag"]
        manifest = {"@fixture/package" if i == 0 else f"fixture-{i}": value for i, value in enumerate(versions)}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "package.json").write_text(json.dumps({"dependencies": manifest}), encoding="utf-8")
            result = inspect_snapshot(root)
        self.assertEqual({item["name"]: item["version"] for item in result["dependencies"]}, manifest)
