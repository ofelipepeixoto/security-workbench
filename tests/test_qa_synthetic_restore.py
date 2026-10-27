import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("qa_restore", Path(__file__).parents[1] / "scripts" / "qa-synthetic-restore.py")
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class SyntheticRestoreTest(unittest.TestCase):
    def test_real_backup_restore_and_repeat_preserve_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            result = qa.rehearse(directory, "synthetic-test")
            self.assertEqual(result["status"], "local_synthetic_passed")
            self.assertTrue(result["owner_filter_negative_passed"])
            self.assertFalse(result["hosted_d1"])
            self.assertEqual(len(result["files"]), 3)
            with self.assertRaisesRegex(ValueError, "occupied"):
                qa.rehearse(directory, "synthetic-test")
            self.assertTrue(all(Path(file).is_file() for file in result["files"]))

    def test_restore_tampering_and_existing_inconsistent_rows_stop(self):
        source, restored = sqlite3.connect(":memory:"), sqlite3.connect(":memory:")
        self.addCleanup(source.close)
        self.addCleanup(restored.close)
        qa.apply_fixture(source, "synthetic-tamper")
        source.backup(restored)
        records, _ = qa.table_names("synthetic-tamper")
        restored.execute(f"UPDATE {records} SET decision='candidate' WHERE id='record-b2'")
        restored.commit()
        with self.assertRaisesRegex(ValueError, "digest_mismatch"):
            qa.verify_restore(source, restored, "synthetic-tamper")
        before = qa.digest(restored, "synthetic-tamper")
        with self.assertRaises(sqlite3.IntegrityError):
            qa.apply_fixture(restored, "synthetic-tamper")
        self.assertEqual(qa.digest(restored, "synthetic-tamper"), before)
        unsafe = sqlite3.connect(":memory:")
        self.addCleanup(unsafe.close)
        _, guard = qa.table_names("synthetic-tamper")
        unsafe.execute(f"CREATE TABLE {guard} (id INTEGER PRIMARY KEY, version TEXT, assertions_valid INTEGER)")
        with self.assertRaisesRegex(ValueError, "schema_mismatch"):
            qa.apply_fixture(unsafe, "synthetic-tamper")
        self.assertEqual(unsafe.execute("SELECT count(*) FROM sqlite_schema WHERE name=?", (records,)).fetchone()[0], 0)

    def test_sql_is_bounded_namespaced_and_does_not_touch_product_or_destruct(self):
        statements = qa.sql_statements("synthetic-contract")
        sql = "\n".join(statements)
        self.assertEqual(len(statements), 8)
        self.assertLess(len(sql.encode()), 6000)
        for prohibited in ["DROP", "DELETE", "TRUNCATE", "REPLACE", "workbench_", "http", "171351708", "322086368"]:
            self.assertNotIn(prohibited, sql)
        self.assertIn("qa_restore_synthetic_", sql)
        self.assertNotEqual(qa.table_names("one"), qa.table_names("two"))
        with self.assertRaises(ValueError):
            qa.table_names("bad; SQL")


if __name__ == "__main__":
    unittest.main()
