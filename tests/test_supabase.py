import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from workbench.__main__ import main
from workbench.changes import create_context
from workbench.core import inspect_snapshot
from workbench.store import authorize, connect, save_run
from workbench.supabase import create_plan, recover_plan


class SupabasePlanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.snapshot = self.root / 'fixture'
        self.snapshot.mkdir()
        self.sql = 'select 1; -- PRIVATE_FIXTURE_DO_NOT_EMIT\n'
        (self.snapshot / 'migration.sql').write_text(self.sql)
        self.state = self.root / 'state.sqlite3'
        self.db = connect(self.state)
        self.addCleanup(lambda: self.db.close())
        authorize(self.db, 'fixture/supabase')
        self.run = self.scan()

    def scan(self):
        return save_run(self.db, 'fixture/supabase', 'a' * 40, inspect_snapshot(self.snapshot))

    def test_matrix_has_no_invented_results_or_content(self):
        with patch('socket.create_connection', side_effect=AssertionError('Network forbidden')):
            plan = create_plan(self.db, self.run, ['migration.sql'])
        self.assertEqual(len(plan['controls']), 8)
        self.assertFalse(plan['authorization_to_execute'])
        self.assertFalse(plan['base']['verified_revision'])
        self.assertTrue(all(c['status'] == 'not_validated' and c['observed_evidence'] == [] for c in plan['controls']))
        self.assertNotIn(self.sql.strip(), json.dumps(plan))
        self.assertEqual((self.snapshot / 'migration.sql').read_text(), self.sql)

    def test_recovery_after_reopening_database(self):
        plan = create_plan(self.db, self.run, ['migration.sql'])
        self.db.close()
        self.db = connect(self.state)
        self.assertEqual(recover_plan(self.db, plan['context_id']), plan)

    def test_rejects_stale_run(self):
        self.scan()
        with self.assertRaisesRegex(ValueError, 'recente'):
            create_plan(self.db, self.run, ['migration.sql'])

    def test_requires_selected_manifest_path(self):
        with self.assertRaises(ValueError):
            create_plan(self.db, self.run, ['unknown.sql'])
        with self.assertRaises(ValueError):
            create_plan(self.db, self.run, ['../outside.sql'])

    def test_rejects_unrelated_context(self):
        c = create_context(self.db, self.run, ['migration.sql'], 'Outra tarefa')
        with self.assertRaisesRegex(ValueError, 'catálogo'):
            recover_plan(self.db, c['id'])

    def test_cli_create_and_recover(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            status = main(['--state', str(self.state), 'supabase-plan', '--run', self.run, '--path', 'migration.sql'])
        self.assertEqual(status, 0)
        plan = json.loads(out.getvalue())
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            status = main(['--state', str(self.state), 'supabase-plan-show', '--context', plan['context_id']])
        self.assertEqual(status, 0)
        self.assertEqual(json.loads(out.getvalue()), plan)
