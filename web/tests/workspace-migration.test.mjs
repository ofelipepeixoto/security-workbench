import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../drizzle/0002_workspace_relations.sql', import.meta.url), 'utf8');
const tables = ['workbench_projects', 'workbench_runs', 'workbench_reviews', 'workbench_github_sessions', 'workbench_oauth_flows'];
function legacy(t, owner = 'existing-site-owner') {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of ['0000_careful_shriek.sql', '0001_strong_swarm.sql']) db.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  const project = db.prepare('INSERT INTO workbench_projects VALUES (?, ?, ?, ?, ?)');
  project.run('project-a', owner, 'fixture/shared', 17, '2026-10-21T12:00:00Z');
  project.run('project-b', 'legacy-b', 'fixture/shared', 17, '2026-10-21T12:00:01Z');
  const run = db.prepare('INSERT INTO workbench_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  run.run('run-a', owner, 'project-a', 'fixture/shared', 17, 'request-a', 'a'.repeat(40), 'a'.repeat(40), 'complete', JSON.stringify({source: 'rea-import', partial: true, findings: [], provenance: {observations_seen: 4, observations_omitted: 4}}), null, '2026-10-21T12:00:02Z', '2026-10-21T12:00:02Z');
  run.run('run-b', 'legacy-b', 'project-b', 'fixture/shared', 17, 'request-a', null, null, 'failed', null, 'github_rate_limited', '2026-10-21T12:00:03Z', '2026-10-21T12:00:03Z');
  db.prepare('INSERT INTO workbench_reviews VALUES (?, ?, ?, ?, ?, ?)').run('review-a', owner, 'run-a', 'synthetic-candidate', 'false_positive', '2026-10-21T12:00:04Z');
  db.prepare('INSERT INTO workbench_github_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('inert-session-hash', 'inert-csrf-hash', '101', owner, 'fixture-owner', 'inert-config-hash', 2000000000, 1900000000);
  db.prepare('INSERT INTO workbench_oauth_flows VALUES (?, ?, ?, ?, ?, ?)').run('inert-state-hash', 'inert-browser-hash', 'inert-verifier', 'inert-config-hash', 2000000000, 1900000000);
  return db;
}
const snapshot = db => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
function apply(db) {
  db.exec('BEGIN');
  try {db.exec(migration); db.exec('COMMIT');}
  catch (error) {db.exec('ROLLBACK'); throw error;}
}

test('workspace migration preserves legacy rows, owner identity and authentication without filling new claims', t => {
  const db = legacy(t), before = snapshot(db);
  apply(db);
  assert.deepEqual(snapshot(db), before);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE '__new_%' OR name = '__workbench_workspace_guard'").get().n, 0);
  const runKeys = db.prepare('PRAGMA foreign_key_list(workbench_runs)').all();
  assert.deepEqual(runKeys.map(row => [row.from, row.to, row.table]), [['owner_id', 'owner_id', 'workbench_projects'], ['project_id', 'id', 'workbench_projects']]);
  const reviewKeys = db.prepare('PRAGMA foreign_key_list(workbench_reviews)').all();
  assert.deepEqual(reviewKeys.map(row => [row.from, row.to, row.table]), [['owner_id', 'owner_id', 'workbench_runs'], ['run_id', 'id', 'workbench_runs']]);
  const saved = JSON.parse(db.prepare("SELECT result_json FROM workbench_runs WHERE id = 'run-a'").get().result_json);
  assert.equal(saved.provenance.observations_imported, undefined);
  assert.equal(saved.provenance.observations_omitted_by_reason, undefined);
});

test('composite relations reject cross-owner inserts, updates and parent changes while preserving unique request constraints', t => {
  const db = legacy(t);
  apply(db);
  const insertRun = db.prepare('INSERT INTO workbench_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  assert.throws(() => insertRun.run('cross-run', 'legacy-b', 'project-a', 'fixture/shared', 17, 'cross-request', null, null, 'running', null, null, 'now', 'now'), /FOREIGN KEY/);
  assert.throws(() => db.prepare("UPDATE workbench_runs SET owner_id = 'legacy-b', request_id = 'cross-owner-update' WHERE id = 'run-a'").run(), /FOREIGN KEY/);
  assert.throws(() => db.prepare("UPDATE workbench_projects SET owner_id = 'legacy-b' WHERE id = 'project-a'").run(), /FOREIGN KEY|UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO workbench_reviews VALUES ('cross-review', 'legacy-b', 'run-a', 'synthetic', 'confirmed', 'now')").run(), /FOREIGN KEY/);
  assert.throws(() => db.prepare("UPDATE workbench_reviews SET owner_id = 'legacy-b' WHERE id = 'review-a'").run(), /FOREIGN KEY/);
  assert.throws(() => insertRun.run('duplicate-request', 'legacy-b', 'project-b', 'fixture/shared', 17, 'request-a', null, null, 'running', null, null, 'now', 'now'), /UNIQUE/);
  db.prepare("INSERT INTO workbench_projects VALUES ('member-project', 'github:202', 'fixture/member', 18, 'now')").run();
  insertRun.run('member-run', 'github:202', 'member-project', 'fixture/member', 18, 'member-request', null, null, 'running', null, null, 'now', 'now');
  assert.throws(() => insertRun.run('duplicate-running', 'github:202', 'member-project', 'fixture/member', 18, 'member-request-2', null, null, 'running', null, null, 'now', 'now'), /UNIQUE/);
  assert.throws(() => db.prepare("DELETE FROM workbench_projects WHERE id = 'member-project'").run(), /FOREIGN KEY/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('inconsistent legacy ownership aborts and rolls back instead of silently reassigning or deleting history', t => {
  for (const mismatch of ['run', 'review']) {
    const db = legacy(t);
    if (mismatch === 'run') db.prepare("UPDATE workbench_runs SET owner_id = 'legacy-b', request_id = 'legacy-inconsistent' WHERE id = 'run-a'").run();
    else db.prepare("UPDATE workbench_reviews SET owner_id = 'legacy-b' WHERE id = 'review-a'").run();
    const before = snapshot(db);
    assert.throws(() => apply(db), /FOREIGN KEY/);
    assert.deepEqual(snapshot(db), before);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'workbench_project_owner_id' OR name LIKE '__new_%' OR name = '__workbench_workspace_guard'").get().n, 0);
  }
});

test('an occupied new principal namespace blocks migration without assigning legacy data to the first pilot login', t => {
  const db = legacy(t, 'github:202'), before = snapshot(db);
  assert.throws(() => apply(db), /CHECK/);
  assert.deepEqual(snapshot(db), before);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = '__workbench_workspace_guard'").get().n, 0);
});
