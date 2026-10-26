"""Synthetic findings only: identities must not merge separate reviews."""
import unittest
import tempfile
from pathlib import Path

from workbench.core import _inspect_text, fingerprint
from workbench.store import authorize, connect, get_run, review, save_run


class FindingIdentityTests(unittest.TestCase):
    def test_repeated_workflow_occurrences_keep_individual_identities(self):
        findings, _ = _inspect_text(
            ".github/workflows/ci.yml",
            "permissions: write-all\njobs:\n  example:\n    permissions: write-all\n",
        )
        self.assertEqual([f["line"] for f in findings], [1, 4])
        self.assertEqual(findings[0]["fingerprint"], "5043a039b349ac5a3e2f")
        self.assertEqual(findings[1]["fingerprint"], fingerprint(
            "broad-workflow-permissions", ".github/workflows/ci.yml", "write-all\0occurrence:2"))
        self.assertEqual(len({f["fingerprint"] for f in findings}), 2)

    def test_secret_values_are_not_part_of_occurrence_identities(self):
        first, _ = _inspect_text("main.py", "password='synthetic-only-one'\npassword='synthetic-only-two'\n")
        changed, _ = _inspect_text("main.py", "# line shift\npassword='different-inert-one'\npassword='different-inert-two'\n")
        self.assertEqual([f["fingerprint"] for f in first], [f["fingerprint"] for f in changed])
        self.assertEqual(len({f["fingerprint"] for f in first}), 2)

    def test_repeated_candidates_persist_and_review_independently(self):
        findings, _ = _inspect_text("main.py", "password='synthetic-only-one'\npassword='synthetic-only-two'\n")
        with tempfile.TemporaryDirectory() as directory:
            with connect(Path(directory) / "synthetic.sqlite3") as db:
                authorize(db, "fixture-owner/fixture-repo")
                run_id = save_run(db, "fixture-owner/fixture-repo", "synthetic-revision", {
                    "snapshot_digest": "a" * 64, "partial": False, "files_read": 1,
                    "bytes_read": 80, "omissions": [], "findings": findings, "dependencies": [],
                })
                self.assertEqual(len(get_run(db, run_id)["findings"]), 2)
                review(db, run_id, findings[1]["fingerprint"], "false_positive")
                self.assertEqual([f["status"] for f in get_run(db, run_id)["findings"]], ["candidate", "false_positive"])

    def test_legacy_ambiguous_input_is_rejected_before_storage(self):
        findings, _ = _inspect_text("main.py", "password='synthetic-only-one'\npassword='synthetic-only-two'\n")
        findings[1]["fingerprint"] = findings[0]["fingerprint"]
        with tempfile.TemporaryDirectory() as directory:
            with connect(Path(directory) / "synthetic.sqlite3") as db:
                authorize(db, "fixture-owner/fixture-repo")
                with self.assertRaisesRegex(ValueError, "Identidades de revisão repetidas"):
                    save_run(db, "fixture-owner/fixture-repo", "synthetic-revision", {
                        "snapshot_digest": "a" * 64, "partial": False, "files_read": 1,
                        "bytes_read": 80, "omissions": [], "findings": findings, "dependencies": [],
                    })
                self.assertEqual(db.execute("SELECT count(*) FROM runs").fetchone()[0], 0)
                self.assertEqual(db.execute("SELECT count(*) FROM findings").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
