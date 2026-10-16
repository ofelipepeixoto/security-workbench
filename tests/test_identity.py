"""Identity regressions use simulated API replies; no network access."""
import contextlib
import io
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from test_github_web import REPO, COMMIT, responses
from workbench.__main__ import main, render_report
from workbench.github import inspect_github
from workbench.store import authorize, connect, get_run, save_run, scoped_repository_id


class IdentityTest(unittest.TestCase):
    def test_api_and_expected_ids_fail_closed(self):
        for value in (None, True, False, -1, 0, '123', 456):
            with self.subTest(value=value):
                entries = responses()
                entries[f'/repos/{REPO}']['id'] = value
                calls = []
                def fetch(path):
                    calls.append(path)
                    return entries[path]
                with self.assertRaises(ValueError):
                    inspect_github(REPO, COMMIT, repository_id=123, request_json=fetch)
                self.assertEqual(calls, [f'/repos/{REPO}'])
        entries = responses()
        del entries[f'/repos/{REPO}']['id']
        with self.assertRaises(ValueError):
            inspect_github(REPO, COMMIT, repository_id=123, request_json=entries.__getitem__)
        for value in (None, True, -1, 0):
            with self.assertRaises(ValueError):
                inspect_github(REPO, COMMIT, repository_id=value, request_json=lambda _: self.fail('network before validation'))

    def test_scope_evidence_and_explicit_legacy_review(self):
        with tempfile.TemporaryDirectory() as tmp, connect(Path(tmp)/'state.db') as db:
            authorize(db, REPO)
            with self.assertRaises(ValueError):
                scoped_repository_id(db, REPO)
            authorize(db, REPO, 123)
            self.assertEqual(scoped_repository_id(db, REPO), 123)
            for bad in (True, -1, 0, 456):
                with self.assertRaises(ValueError):
                    authorize(db, REPO, bad)
            _, result = inspect_github(REPO, COMMIT, repository_id=123, request_json=responses().__getitem__)
            run_id = save_run(db, REPO, COMMIT, result, source='github', verified_revision=True)
            self.assertEqual(get_run(db, run_id)['repository_id'], 123)
            self.assertIn('Repository ID: 123', render_report(get_run(db, run_id)))
            for bad in (None, True, -1, 456):
                with self.assertRaises(ValueError):
                    save_run(db, REPO, COMMIT, {**result, 'repository_id': bad}, source='github', verified_revision=True)
            self.assertEqual(db.execute('SELECT count(*) FROM runs').fetchone()[0], 1)

    def test_stage2_migration_preserves_evidence_without_promoting_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'old.db'
            with sqlite3.connect(path) as db:
                db.executescript('''CREATE TABLE scope (repo TEXT PRIMARY KEY, authorized_at TEXT NOT NULL);
                CREATE TABLE runs (id TEXT PRIMARY KEY, repo TEXT, revision TEXT, digest TEXT, created_at TEXT, partial INTEGER, files_read INTEGER, bytes_read INTEGER, omissions TEXT, source TEXT, verified_revision INTEGER);''')
                db.execute('INSERT INTO scope VALUES (?, ?)', (REPO, 'old-date'))
                db.execute("INSERT INTO runs VALUES ('old', ?, ?, 'digest', 'date', 1, 2, 3, '[\"omission\"]', 'github', 1)", (REPO, COMMIT))
            for _ in range(2):
                with connect(path) as db:
                    run = get_run(db, 'old')
                    self.assertIsNone(run['repository_id'])
                    self.assertEqual(run['verified_revision'], 0)
                    self.assertEqual((run['digest'], run['omissions'], run['files_read'], run['source']), ('digest', ['omission'], 2, 'github'))
                    authorize(db, REPO, 123)
                    self.assertEqual(get_run(db, 'old')['verified_revision'], 0)
                    self.assertIn('revisão declarada', render_report(get_run(db, 'old')))

    def test_cli_identity_is_passed_and_same_name_replacement_rejected(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            common = ['--state', str(Path(tmp)/'cli.db')]
            self.assertEqual(main(common+['authorize', '--repo', REPO, '--confirm-owned']), 0)
            scan = common+['scan-github', '--repo', REPO, '--revision', COMMIT]
            with patch('workbench.github._request_json') as fetch:
                self.assertEqual(main(scan), 2)
                fetch.assert_not_called()
            self.assertEqual(main(common+['authorize', '--repo', REPO, '--confirm-owned', '--repository-id', '123']), 0)
            entries = responses()
            with patch('workbench.github._request_json', side_effect=entries.__getitem__):
                self.assertEqual(main(scan), 0)
                entries[f'/repos/{REPO}']['id'] = 456
                self.assertEqual(main(scan), 2)
