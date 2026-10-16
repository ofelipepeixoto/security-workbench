"""Estado local de autorização, execuções, revisão e histórico."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import stat
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
DECISIONS = {"candidate", "confirmed", "false_positive", "accepted_risk"}


def normalize_repo(repo: str) -> str:
    if not REPO.fullmatch(repo) or ".." in repo or repo.startswith("."):
        raise ValueError("Informe owner/repository, sem URL ou caminho local.")
    return repo.lower()


def connect(state: Path) -> sqlite3.Connection:
    state.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(state, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise ValueError("O banco local precisa ser arquivo regular.")
        os.fchmod(descriptor, 0o600)
    finally:
        os.close(descriptor)
    connection = sqlite3.connect(state)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA trusted_schema = OFF")
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS scope (
            repo TEXT PRIMARY KEY, authorized_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY, repo TEXT NOT NULL REFERENCES scope(repo),
            revision TEXT NOT NULL, digest TEXT NOT NULL,
            created_at TEXT NOT NULL, partial INTEGER NOT NULL,
            files_read INTEGER NOT NULL, bytes_read INTEGER NOT NULL,
            omissions TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS findings (
            run_id TEXT NOT NULL REFERENCES runs(id), fingerprint TEXT NOT NULL,
            kind TEXT NOT NULL, path TEXT NOT NULL, line INTEGER NOT NULL,
            status TEXT NOT NULL, confidence TEXT NOT NULL,
            evidence TEXT NOT NULL, impact TEXT NOT NULL, recommendation TEXT NOT NULL,
            PRIMARY KEY(run_id, fingerprint)
        );
        CREATE TABLE IF NOT EXISTS dependencies (
            run_id TEXT NOT NULL REFERENCES runs(id), name TEXT NOT NULL,
            version TEXT NOT NULL, source TEXT NOT NULL
        );
    """)
    columns = {row[1] for row in connection.execute("PRAGMA table_info(runs)")}
    if "source" not in columns:
        connection.execute("ALTER TABLE runs ADD COLUMN source TEXT NOT NULL DEFAULT 'local'")
    if "verified_revision" not in columns:
        connection.execute("ALTER TABLE runs ADD COLUMN verified_revision INTEGER NOT NULL DEFAULT 0")
    return connection


def authorize(db: sqlite3.Connection, repo: str) -> str:
    repo = normalize_repo(repo)
    with db:
        db.execute("INSERT OR IGNORE INTO scope VALUES (?, ?)", (repo, datetime.now(timezone.utc).isoformat()))
    return repo


def require_scope(db: sqlite3.Connection, repo: str) -> str:
    repo = normalize_repo(repo)
    if db.execute("SELECT 1 FROM scope WHERE repo = ?", (repo,)).fetchone() is None:
        raise PermissionError(f"Repositório não cadastrado no escopo: {repo}")
    return repo


def save_run(db: sqlite3.Connection, repo: str, revision: str, result: dict, *, source: str = "local", verified_revision: bool = False) -> str:
    repo = require_scope(db, repo)
    if source not in {"local", "github"} or (verified_revision and source != "github"):
        raise ValueError("Origem ou verificação inválida.")
    run_id = uuid.uuid4().hex[:16]
    with db:
        db.execute("INSERT INTO runs (id, repo, revision, digest, created_at, partial, files_read, bytes_read, omissions, source, verified_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
            run_id, repo, revision, result["snapshot_digest"],
            datetime.now(timezone.utc).isoformat(), int(result["partial"]),
            result["files_read"], result["bytes_read"], json.dumps(result["omissions"]), source, int(verified_revision),
        ))
        for item in result["findings"]:
            db.execute("INSERT OR IGNORE INTO findings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                run_id, item["fingerprint"], item["kind"], item["path"], item["line"],
                item["status"], item["confidence"], item["evidence"],
                item["impact"], item["recommendation"],
            ))
        for item in result["dependencies"]:
            db.execute("INSERT INTO dependencies VALUES (?, ?, ?, ?)", (
                run_id, item["name"], item["version"], item["source"],
            ))
    return run_id


def get_run(db: sqlite3.Connection, run_id: str) -> dict:
    row = db.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    if row is None:
        raise ValueError("Análise não encontrada.")
    result = dict(row)
    result["omissions"] = json.loads(result["omissions"])
    result["findings"] = [dict(x) for x in db.execute(
        "SELECT * FROM findings WHERE run_id = ? ORDER BY path, line", (run_id,)
    )]
    result["dependencies"] = [dict(x) for x in db.execute(
        "SELECT name, version, source FROM dependencies WHERE run_id = ? ORDER BY name", (run_id,)
    )]
    return result


def review(db: sqlite3.Connection, run_id: str, fingerprint: str, decision: str) -> None:
    if decision not in DECISIONS:
        raise ValueError("Decisão inválida.")
    with db:
        cursor = db.execute(
            "UPDATE findings SET status = ? WHERE run_id = ? AND fingerprint = ?",
            (decision, run_id, fingerprint),
        )
        if cursor.rowcount != 1:
            raise ValueError("Achado não encontrado nesta análise.")


def compare(db: sqlite3.Connection, before: str, after: str) -> dict:
    left, right = get_run(db, before), get_run(db, after)
    if left["repo"] != right["repo"]:
        raise ValueError("Compare apenas análises do mesmo repositório.")
    older = {item["fingerprint"] for item in left["findings"]}
    newer = {item["fingerprint"] for item in right["findings"]}
    return {"repo": left["repo"], "new": sorted(newer - older), "no_longer_detected": sorted(older - newer), "still_detected": sorted(older & newer), "partial": bool(left["partial"] or right["partial"])}
