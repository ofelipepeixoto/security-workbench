#!/usr/bin/env python3
"""Local synthetic SQLite backup/restore; no network or Cloudflare client.

The emitted SQL is review material for the dedicated restore D1 only. Execute
its statements in one D1 batch after checking the selected database and any
existing tables against this script's schema. Never bind that D1 to product.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sqlite3

VERSION = "qa.synthetic-restore/v1"
ROWS = (
    ("record-a1", "synthetic-A", "fixture-a", "candidate"),
    ("record-a2", "synthetic-A", "fixture-a", "false_positive"),
    ("record-b1", "synthetic-B", "fixture-b", "confirmed"),
    ("record-b2", "synthetic-B", "fixture-b", "accepted_risk"),
)


def table_names(run_id):
    if not isinstance(run_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", run_id):
        raise ValueError("invalid_synthetic_run_id")
    suffix = hashlib.sha256(run_id.encode()).hexdigest()[:16]
    return (f"qa_restore_synthetic_{suffix}_records", f"qa_restore_synthetic_{suffix}_guard")


def sql_statements(run_id):
    records, guard = table_names(run_id)
    statements = [
        f"CREATE TABLE IF NOT EXISTS {records} (id TEXT PRIMARY KEY, owner TEXT NOT NULL, repo TEXT NOT NULL, decision TEXT NOT NULL)",
        f"CREATE TABLE IF NOT EXISTS {guard} (id INTEGER PRIMARY KEY CHECK(id=1), version TEXT NOT NULL, assertions_valid INTEGER NOT NULL CHECK(assertions_valid=1))",
        f"INSERT INTO {guard} (id,version,assertions_valid) SELECT 1,'{VERSION}',1 WHERE NOT EXISTS (SELECT 1 FROM {guard} WHERE id=1)",
    ]
    for row in ROWS:
        values = ",".join("'" + value + "'" for value in row)
        statements.append(f"INSERT INTO {records} (id,owner,repo,decision) SELECT {values} WHERE NOT EXISTS (SELECT 1 FROM {records} WHERE id='{row[0]}')")
    checks = [f"(SELECT count(*) FROM {records})=4", f"(SELECT count(*) FROM {guard})=1", f"(SELECT version FROM {guard} WHERE id=1)='{VERSION}'"]
    checks.extend(f"EXISTS(SELECT 1 FROM {records} WHERE id='{row[0]}' AND owner='{row[1]}' AND repo='{row[2]}' AND decision='{row[3]}')" for row in ROWS)
    statements.append(f"UPDATE {guard} SET assertions_valid=CASE WHEN {' AND '.join(checks)} THEN 1 ELSE 0 END WHERE id=1")
    return statements


def schema_contract(run_id):
    names = table_names(run_id)
    expected = dict(zip(names, sql_statements(run_id)[:2]))
    normalize = lambda sql: " ".join(sql.replace("IF NOT EXISTS ", "").split()).lower()
    query = "SELECT name,sql FROM sqlite_schema WHERE name IN (" + ",".join("'" + name + "'" for name in names) + ") ORDER BY name"
    normalized = {name: normalize(sql) for name, sql in expected.items()}
    return query, normalized


def apply_fixture(db, run_id):
    """One transaction: a mismatch aborts instead of replacing existing data."""
    query, expected = schema_contract(run_id)
    for name, schema in db.execute(query):
        if " ".join(schema.split()).lower() != expected[name]:
            raise ValueError("synthetic_schema_mismatch")
    if db.in_transaction:
        raise ValueError("synthetic_transaction_already_open")
    db.execute("BEGIN")
    try:
        for statement in sql_statements(run_id):
            db.execute(statement)
        db.commit()
    except Exception:
        db.rollback()
        raise


def digest(db, run_id):
    records, guard = table_names(run_id)
    value = [list(row) for row in db.execute(f"SELECT id,owner,repo,decision FROM {records} ORDER BY id")]
    value += [list(row) for row in db.execute(f"SELECT id,version,assertions_valid FROM {guard} ORDER BY id")]
    return hashlib.sha256(json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()


def read_record(db, run_id, owner, record_id):
    if owner not in {"synthetic-A", "synthetic-B"}:
        raise ValueError("invalid_synthetic_owner")
    records, _ = table_names(run_id)
    return db.execute(f"SELECT id,owner,repo,decision FROM {records} WHERE owner=? AND id=?", (owner, record_id)).fetchone()


def verify_restore(source, restored, run_id):
    if source.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or restored.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise ValueError("synthetic_integrity_failed")
    if digest(source, run_id) != digest(restored, run_id):
        raise ValueError("synthetic_restore_digest_mismatch")
    if read_record(restored, run_id, "synthetic-B", "record-a1") is not None:
        raise ValueError("synthetic_owner_filter_failed")
    if read_record(restored, run_id, "synthetic-A", "record-a1") is None:
        raise ValueError("synthetic_expected_record_missing")
    return digest(restored, run_id)


def rehearse(directory, run_id):
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    table_names(run_id)
    paths = [directory / f"{name}.sqlite" for name in ("source", "backup", "restored")]
    sql_path = directory / "restore-synthetic-review.sql"
    # Never replace a prior run's evidence, even when a preceding run failed.
    if any(path.exists() or path.is_symlink() for path in paths + [sql_path]):
        raise ValueError("synthetic_evidence_destination_occupied")
    sql = "-- Restore D1 ONLY. Synthetic tables only. Use one atomic D1 batch.\n" + "\n--> statement-breakpoint\n".join(sql_statements(run_id)) + ";\n"
    with sql_path.open("x", encoding="utf-8") as output:
        output.write(sql)
    connections = []
    try:
        for path in paths:
            # Exclusive reservation prevents SQLite from opening an existing DB.
            with path.open("xb"):
                pass
            connections.append(sqlite3.connect(path))
        source, backup, restored = connections
        apply_fixture(source, run_id)
        before = digest(source, run_id)
        apply_fixture(source, run_id)
        if digest(source, run_id) != before:
            raise ValueError("synthetic_idempotence_failed")
        source.backup(backup)
        backup.backup(restored)
        checked = verify_restore(source, restored, run_id)
        return {"status": "local_synthetic_passed", "hosted_d1": False, "network_used": False,
                "rows": 4, "tables": 2, "digest_sha256": checked, "sql_sha256": hashlib.sha256(sql.encode()).hexdigest(),
                "owner_filter_negative_passed": True, "idempotent": True,
                "schema_preflight": schema_contract(run_id)[0], "expected_schema": schema_contract(run_id)[1],
                "files": [str(path) for path in paths], "review_sql": str(sql_path)}
    finally:
        for connection in connections:
            connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()
    print(json.dumps(rehearse(args.directory, args.run_id), sort_keys=True))
