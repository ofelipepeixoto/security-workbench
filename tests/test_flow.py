import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from workbench.__main__ import main, render_report
from workbench.core import inspect_snapshot
from workbench.store import authorize, compare, connect, get_run, review, require_scope, save_run


class SnapshotFlowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.snapshot = self.base / "repo"
        self.snapshot.mkdir()
        (self.snapshot / "config.py").write_text(
            'api_key = "demo-only-value-for-test"\n', encoding="utf-8"
        )
        (self.snapshot / "requirements.txt").write_text("example-lib==1.2.3\n", encoding="utf-8")
        (self.snapshot / "package.json").write_text(json.dumps({"dependencies": {"another-lib": "4.5.6"}}), encoding="utf-8")
        workflow = self.snapshot / ".github" / "workflows"
        workflow.mkdir(parents=True)
        (workflow / "ci.yml").write_text("permissions: write-all\n", encoding="utf-8")
        (self.snapshot / "never-import.py").write_text(
            f"from pathlib import Path\nPath({str(self.base / 'executed')!r}).write_text('BAD')\n",
            encoding="utf-8",
        )

    def test_authorized_run_review_report_and_comparison(self):
        db = connect(self.base / "private.sqlite3")
        self.addCleanup(db.close)
        with self.assertRaises(PermissionError):
            require_scope(db, "ofelipepeixoto/rea")
        authorize(db, "ofelipepeixoto/rea")

        first = inspect_snapshot(self.snapshot, declared_partial=True)
        self.assertFalse((self.base / "executed").exists())
        self.assertEqual(first["files_read"], 5)
        self.assertTrue(first["partial"])
        self.assertEqual(len(first["findings"]), 2)
        self.assertEqual(len(first["dependencies"]), 2)
        first_id = save_run(db, "ofelipepeixoto/rea", "test-revision", first)
        recorded = get_run(db, first_id)
        report = render_report(recorded)
        self.assertIn("[REDACTED]", report)
        self.assertNotIn("demo-only-value-for-test", report)
        self.assertTrue(all(item["status"] == "candidate" for item in recorded["findings"]))
        secret = next(item for item in recorded["findings"] if item["kind"] == "possible-secret")
        review(db, first_id, secret["fingerprint"], "false_positive")
        self.assertEqual(next(item for item in get_run(db, first_id)["findings"] if item["kind"] == "possible-secret")["status"], "false_positive")

        (self.snapshot / "config.py").write_text("api_key = load_from_environment()\n", encoding="utf-8")
        second_id = save_run(db, "ofelipepeixoto/rea", "test-revision-2", inspect_snapshot(self.snapshot))
        diff = compare(db, first_id, second_id)
        self.assertIn(secret["fingerprint"], diff["no_longer_detected"])
        self.assertEqual(len(diff["still_detected"]), 1)
        self.assertTrue(diff["partial"])

    def test_symlink_and_oversize_are_not_read(self):
        outside = self.base / "outside.py"
        outside.write_text('password = "outside-secret-value"\n', encoding="utf-8")
        (self.snapshot / "link.py").symlink_to(outside)
        (self.snapshot / "linked-dir").symlink_to(self.base, target_is_directory=True)
        (self.base / "repo-alias").symlink_to(self.snapshot, target_is_directory=True)
        (self.snapshot / "too-big.py").write_bytes(b"z" * (1024 * 1024 + 1))
        result = inspect_snapshot(self.snapshot)
        self.assertEqual(len(result["findings"]), 2)
        self.assertTrue(result["partial"])
        self.assertIn("too-big.py", " ".join(result["omissions"]))
        with self.assertRaises(ValueError):
            inspect_snapshot(self.snapshot / "link.py")
        with self.assertRaises(ValueError):
            inspect_snapshot(self.base / "repo-alias")

    def test_cli_refuses_scan_without_scope(self):
        output, errors = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            status = main(["--state", str(self.base / "state.sqlite3"), "scan", "--repo", "ofelipepeixoto/rea", "--snapshot", str(self.snapshot), "--revision", "fixture"])
        self.assertEqual(status, 2)
        self.assertIn("não cadastrado", errors.getvalue())
        self.assertEqual(output.getvalue(), "")

    def test_compare_other_repository_is_rejected(self):
        db = connect(self.base / "private.sqlite3")
        self.addCleanup(db.close)
        authorize(db, "ofelipepeixoto/rea")
        authorize(db, "ofelipepeixoto/security-workbench")
        result = inspect_snapshot(self.snapshot)
        a = save_run(db, "ofelipepeixoto/rea", "a", result)
        b = save_run(db, "ofelipepeixoto/security-workbench", "b", result)
        with self.assertRaises(ValueError):
            compare(db, a, b)


if __name__ == "__main__":
    unittest.main()
