import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from workbench.__main__ import main
from workbench.changes import (create_context, create_proposal, get_context,
                              get_proposal, load_spec, review_proposal)
from workbench.core import inspect_snapshot
from workbench.store import authorize, connect, get_run, save_run
from workbench.github import inspect_github
from test_github_web import COMMIT, DATA, REPO as GH_REPO, responses


REPO = "fixture/study"
REVISION = "a" * 40


class ChangeStudyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.snapshot = self.root / "snapshot"
        self.snapshot.mkdir()
        self.original = b"VALUE = 1\n"
        (self.snapshot / "app.py").write_bytes(self.original)
        (self.snapshot / "other.py").write_text("OTHER = 0\n")
        self.state = self.root / "state.sqlite3"
        self.db = connect(self.state)
        self.addCleanup(lambda: self.db.close())
        authorize(self.db, REPO)
        self.run = self.scan()
        self.context = create_context(self.db, self.run, ["app.py"], "Revisar valor fictício")

    def scan(self, repo=REPO, revision=REVISION):
        return save_run(self.db, repo, revision, inspect_snapshot(self.snapshot))

    def spec(self, after="VALUE = 2\n"):
        return {"changes": [{"path": "app.py", "before_sha256": hashlib.sha256(self.original).hexdigest(), "after": after}]}

    def propose(self):
        return create_proposal(self.db, self.context["id"], self.snapshot, self.spec())

    def review(self, proposal, current_run, decision="accepted_for_study", expected=None):
        return review_proposal(self.db, proposal["id"], current_run,
                               expected or proposal["sha256"], "fixture reviewer", decision)

    def test_review_and_recovery_preserve_files_and_receipt(self):
        proposal = self.propose()
        self.assertIn("-VALUE = 1", proposal["document"]["changes"][0]["diff"])
        self.assertIn("+VALUE = 2", proposal["document"]["changes"][0]["diff"])
        self.assertFalse(self.context["document"]["base"]["verified_revision"])
        self.assertEqual(self.context["document"]["unselected_files"], 1)
        reviewed = self.review(proposal, self.scan())
        self.assertFalse(reviewed["review"]["authorization_to_execute"])
        self.db.close()
        self.db = connect(self.state)
        self.assertEqual(get_proposal(self.db, proposal["id"]), reviewed)
        self.assertEqual((self.snapshot / "app.py").read_bytes(), self.original)
        with self.assertRaisesRegex(ValueError, "já revisada"):
            self.review(proposal, self.scan())

    def test_review_requires_new_analysis_and_expected_hash(self):
        proposal = self.propose()
        with self.assertRaisesRegex(ValueError, "nova análise"):
            self.review(proposal, self.run)
        current = self.scan()
        with self.assertRaisesRegex(ValueError, "Hash"):
            self.review(proposal, current, expected="0" * 64)
        self.assertIsNone(get_proposal(self.db, proposal["id"])["review"])
        self.assertEqual(self.review(proposal, current, "rejected")["review"]["decision"], "rejected")

    def test_changed_unselected_file_invalidates_review(self):
        proposal = self.propose()
        (self.snapshot / "other.py").write_text("OTHER = 99\n")
        current = self.scan()
        with self.assertRaisesRegex(ValueError, "Base alterada"):
            self.review(proposal, current)
        with self.assertRaisesRegex(ValueError, "mais recente"):
            self.review(proposal, self.run)
        self.assertIsNone(get_proposal(self.db, proposal["id"])["review"])

    def test_changed_revision_or_repository_cannot_reuse_review(self):
        proposal = self.propose()
        for repo, revision in [(REPO, "b" * 40), ("fixture/another", REVISION)]:
            with self.subTest(repo=repo, revision=revision):
                authorize(self.db, repo)
                current = self.scan(repo, revision)
                with self.assertRaisesRegex(ValueError, "Base alterada"):
                    self.review(proposal, current)

    def test_selected_file_changed_before_proposal_is_rejected(self):
        (self.snapshot / "app.py").write_text("VALUE = 10\n")
        with self.assertRaisesRegex(ValueError, "obsoleto"):
            self.propose()
        self.assertEqual(self.db.execute("SELECT count(*) FROM study_proposals").fetchone()[0], 0)

    def test_unchanged_proposal_and_newline_only_change(self):
        with self.assertRaisesRegex(ValueError, "não modifica"):
            create_proposal(self.db, self.context["id"], self.snapshot, self.spec(self.original.decode()))
        proposal = create_proposal(self.db, self.context["id"], self.snapshot, self.spec("VALUE = 1"))
        change = proposal["document"]["changes"][0]
        self.assertNotEqual(change["before_sha256"], change["after_sha256"])
        self.assertTrue(change["before_final_newline"])
        self.assertFalse(change["after_final_newline"])

    def test_only_selected_existing_canonical_paths_are_accepted(self):
        for path in ["other.py", "new.py", "../app.py", "/app.py", "a/../app.py", "./app.py"]:
            with self.subTest(path=path):
                spec = self.spec()
                spec["changes"][0]["path"] = path
                with self.assertRaises(ValueError):
                    create_proposal(self.db, self.context["id"], self.snapshot, spec)
        spec = self.spec()
        spec["changes"].append(dict(spec["changes"][0]))
        with self.assertRaises(ValueError):
            create_proposal(self.db, self.context["id"], self.snapshot, spec)

    def test_line_ending_change_is_explicit_even_without_visible_diff(self):
        proposal = create_proposal(self.db, self.context["id"], self.snapshot, self.spec("VALUE = 1\r\n"))
        change = proposal["document"]["changes"][0]
        self.assertEqual(change["before_crlf_count"], 0)
        self.assertEqual(change["after_crlf_count"], 1)
        self.assertNotEqual(change["before_sha256"], change["after_sha256"])

    def test_symlink_is_not_used_for_context_read(self):
        file = self.snapshot / "app.py"
        file.unlink()
        outside = self.root / "fixture.py"
        outside.write_bytes(self.original)
        file.symlink_to(outside)
        with self.assertRaises((ValueError, OSError)):
            self.propose()
        self.assertEqual(outside.read_bytes(), self.original)

    def test_context_and_proposal_limits_and_schema(self):
        for paths in [[], ["app.py", "app.py"], [f"file{i}.py" for i in range(11)], ["absent.py"]]:
            with self.subTest(paths=paths), self.assertRaises(ValueError):
                create_context(self.db, self.run, paths, "task")
        for after in ["x" * (64 * 1024 + 1), "\0", "x\n" * 2001]:
            with self.subTest(length=len(after)), self.assertRaises(ValueError):
                create_proposal(self.db, self.context["id"], self.snapshot, self.spec(after))
        for spec in [{"changes": []}, {"changes": [], "execute": True}, self.spec() | {"command": "ignored"}]:
            with self.subTest(spec_keys=list(spec)), self.assertRaises(ValueError):
                create_proposal(self.db, self.context["id"], self.snapshot, spec)

    def test_legacy_analysis_requires_rescan_and_manifest_has_no_source(self):
        result = inspect_snapshot(self.snapshot)
        self.assertNotIn("VALUE = 1", json.dumps(result["manifest"]))
        result.pop("manifest")
        legacy = save_run(self.db, REPO, REVISION, result)
        self.assertIsNone(get_run(self.db, legacy)["manifest"])
        with self.assertRaisesRegex(ValueError, "nova análise"):
            create_context(self.db, legacy, ["app.py"], "task")

    def test_manifest_corruption_and_record_corruption_fail_closed(self):
        with self.db:
            self.db.execute("UPDATE study_contexts SET body = replace(body, 'Revisar', 'Modificar') WHERE id = ?", (self.context["id"],))
        with self.assertRaisesRegex(ValueError, "Integridade"):
            get_context(self.db, self.context["id"])
        with self.db:
            self.db.execute("UPDATE runs SET digest = ? WHERE id = ?", ("0" * 64, self.run))
        with self.assertRaisesRegex(ValueError, "divergente"):
            create_context(self.db, self.run, ["app.py"], "task")

    def test_spec_file_rejects_duplicate_keys_and_oversize(self):
        path = self.root / "proposal.json"
        path.write_text('{"changes":[],"changes":[]}')
        with self.assertRaisesRegex(ValueError, "duplicada"):
            load_spec(path)
        path.write_bytes(b"x" * (1024 * 1024 + 1))
        with self.assertRaisesRegex(ValueError, "1 MiB"):
            load_spec(path)

    def test_github_manifest_keeps_verification_and_omissions(self):
        revision, result = inspect_github(GH_REPO, COMMIT, repository_id=123, request_json=responses().__getitem__)
        authorize(self.db, GH_REPO, 123)
        run = save_run(self.db, GH_REPO, revision, result, source="github", verified_revision=True)
        context = create_context(self.db, run, ["config.py"], "task")
        self.assertEqual(context["document"]["files"][0]["sha256"], hashlib.sha256(DATA).hexdigest())
        self.assertTrue(context["document"]["base"]["verified_revision"])
        self.assertEqual(context["document"]["base"]["repository_id"], 123)
        self.assertTrue(context["document"]["base"]["partial"])
        self.assertIn("não regular", str(context["document"]["base"]["omissions"]))
        self.assertNotIn(DATA.decode().strip(), json.dumps(context))

    def test_cli_create_show_review_and_recover(self):
        def cli(*args):
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                status = main(["--state", str(self.state), *args])
            self.assertEqual(status, 0, err.getvalue())
            return json.loads(out.getvalue())
        context = cli("context-create", "--run", self.run, "--path", "app.py", "--task", "fixture")
        specfile = self.root / "proposal.json"
        specfile.write_text(json.dumps(self.spec()))
        proposal = cli("proposal-create", "--context", context["id"], "--snapshot", str(self.snapshot), "--spec", str(specfile))
        self.assertNotIn("diff", proposal)
        self.assertIn("changes", cli("proposal-show", "--proposal", proposal["id"])["document"])
        current = self.scan()
        receipt = cli("proposal-review", "--proposal", proposal["id"], "--current-run", current,
                      "--expected-hash", proposal["sha256"], "--reviewer", "fixture", "--decision", "accepted_for_study")
        self.assertFalse(receipt["authorization_to_execute"])
        recovered = cli("study-list")
        self.assertEqual(recovered["proposals"][0]["id"], proposal["id"])
        self.assertEqual((self.snapshot / "app.py").read_bytes(), self.original)


if __name__ == "__main__":
    unittest.main()
