"""Original, local-only study of pinned context and reviewable changes. No executor."""

from __future__ import annotations

import difflib
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from .core import _read_regular_file
from .store import get_run, require_scope, scoped_repository_id

MAX_SELECTED = 10
MAX_TEXT_BYTES = 64 * 1024
MAX_CONTEXT_BYTES = 256 * 1024
MAX_SPEC_BYTES = 1024 * 1024
MAX_DIFF_BYTES = 512 * 1024
POLICY = "local-context-review/v1"


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _hash(value: object) -> str:
    return hashlib.sha256(_json(value).encode()).hexdigest()


def _label(value: object, name: str, limit: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f"{name} ausente ou acima do limite.")
    return value.strip()


def _path(value: object) -> str:
    if (not isinstance(value, str) or len(value) > 240 or
            not re.fullmatch(r"[A-Za-z0-9_./-]+", value) or
            value.startswith("/") or PurePosixPath(value).as_posix() != value or
            any(p in {".", ".."} for p in value.split("/"))):
        raise ValueError("Caminho relativo não canônico ou não suportado.")
    return value


def _base(run: dict) -> dict:
    if not re.fullmatch(r"[0-9a-fA-F]{40}", run["revision"]):
        raise ValueError("O estudo exige SHA completo; em cópia local continua sendo declarado.")
    manifest = run.get("manifest")
    if not isinstance(manifest, list) or not manifest:
        raise ValueError("Análise sem manifesto; faça uma nova análise.")
    digest, total, seen = hashlib.sha256(), 0, set()
    for item in manifest:
        path = _path(item["path"])
        if (path in seen or type(item["bytes"]) is not int or item["bytes"] < 0 or
                not re.fullmatch(r"[0-9a-f]{64}", item["sha256"])):
            raise ValueError("Manifesto inválido.")
        seen.add(path)
        total += item["bytes"]
        digest.update(path.encode() + b"\0")
        digest.update(bytes.fromhex(item["sha256"]))
    if (digest.hexdigest() != run["digest"] or total != run["bytes_read"] or
            len(manifest) != run["files_read"]):
        raise ValueError("Manifesto divergente da análise.")
    return {"repo": run["repo"], "repository_id": run["repository_id"], "revision": run["revision"].lower(),
            "snapshot_digest": run["digest"], "source": run["source"],
            "verified_revision": bool(run["verified_revision"]),
            "partial": bool(run["partial"]), "omissions": run["omissions"],
            "manifest_sha256": _hash(manifest)}


def _current(db, run_id: str) -> dict:
    run = get_run(db, run_id)
    require_scope(db, run["repo"])
    if run["source"] == "github" and scoped_repository_id(db, run["repo"]) != run["repository_id"]:
        raise ValueError("Identidade da análise divergente do escopo.")
    latest = db.execute("SELECT id FROM runs WHERE repo = ? ORDER BY rowid DESC LIMIT 1", (run["repo"],)).fetchone()
    if latest["id"] != run_id:
        raise ValueError("Use a análise mais recente deste repositório.")
    return run


def _load(db, table: str, record_id: str) -> dict:
    # table is chosen exclusively by the two wrappers below.
    row = db.execute(f"SELECT * FROM {table} WHERE id = ?", (record_id,)).fetchone()
    if row is None:
        raise ValueError("Registro do estudo não encontrado.")
    body = json.loads(row["body"])
    if _hash(body) != row["digest"]:
        raise ValueError("Integridade do registro divergente.")
    require_scope(db, body["base"]["repo"])
    result = {"id": row["id"], "sha256": row["digest"], "document": body}
    if table == "study_proposals":
        result["review"] = json.loads(row["review"]) if row["review"] else None
    return result


def get_context(db, context_id: str) -> dict:
    return _load(db, "study_contexts", context_id)


def get_proposal(db, proposal_id: str) -> dict:
    return _load(db, "study_proposals", proposal_id)


def create_context(db, run_id: str, paths: list[str], task: str) -> dict:
    run = _current(db, run_id)
    base = _base(run)
    if (not isinstance(paths, list) or not 1 <= len(paths) <= MAX_SELECTED or
            len(set(paths)) != len(paths)):
        raise ValueError("Selecione de 1 a 10 caminhos distintos.")
    by_path = {item["path"]: item for item in run["manifest"]}
    selected = []
    for path in sorted(_path(p) for p in paths):
        if path not in by_path:
            raise ValueError("Arquivo não está no manifesto da análise.")
        selected.append(by_path[path])
    if (any(f["bytes"] > MAX_TEXT_BYTES for f in selected) or
            sum(f["bytes"] for f in selected) > MAX_CONTEXT_BYTES):
        raise ValueError("Contexto excede 64 KiB por arquivo ou 256 KiB no total.")
    body = {"schema": "context/v1", "policy": POLICY, "base": base,
            "source_run_id": run_id, "task": _label(task, "Tarefa", 2000),
            "files": selected, "coverage": "selected-supported-files",
            "unselected_files": len(by_path) - len(selected),
            "limits": {"max_files": MAX_SELECTED, "max_file_bytes": MAX_TEXT_BYTES,
                       "max_total_bytes": MAX_CONTEXT_BYTES},
            "external_effects": False}
    record_id = uuid.uuid4().hex
    with db:
        db.execute("INSERT INTO study_contexts VALUES (?, ?, ?, ?)", (record_id, run_id, _json(body), _hash(body)))
    return get_context(db, record_id)


def load_spec(path: Path) -> dict:
    data = _read_regular_file(path.parent.resolve(strict=True), Path(path.name))
    if len(data) > MAX_SPEC_BYTES:
        raise ValueError("Proposta JSON acima de 1 MiB.")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Chave JSON duplicada.")
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique)


def _text(data: bytes) -> str:
    if len(data) > MAX_TEXT_BYTES or b"\0" in data:
        raise ValueError("Arquivo binário ou acima de 64 KiB.")
    text = data.decode("utf-8", errors="strict")
    if len(text.splitlines()) > 2000:
        raise ValueError("Arquivo acima de 2000 linhas para comparação local.")
    return text


def create_proposal(db, context_id: str, snapshot: Path, spec: dict) -> dict:
    context = get_context(db, context_id)
    doc = context["document"]
    if _base(_current(db, doc["source_run_id"])) != doc["base"]:
        raise ValueError("Base do contexto alterada.")
    if not isinstance(spec, dict) or set(spec) != {"changes"}:
        raise ValueError("Proposta exige somente o campo changes.")
    changes = spec["changes"]
    if not isinstance(changes, list) or not 1 <= len(changes) <= MAX_SELECTED:
        raise ValueError("Proposta exige de 1 a 10 alterações.")
    if snapshot.is_symlink() or not snapshot.is_dir():
        raise ValueError("A cópia precisa ser diretório real.")
    root = snapshot.resolve(strict=True)
    originals = {}
    # Verify every selected context file, including those not being edited.
    for item in doc["files"]:
        data = _read_regular_file(root, Path(item["path"]))
        if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
            raise ValueError("Contexto obsoleto: arquivo selecionado alterado.")
        originals[item["path"]] = (_text(data), item["sha256"])
    seen, result, total_after, total_diff = set(), [], 0, 0
    for item in changes:
        if not isinstance(item, dict) or set(item) != {"path", "before_sha256", "after"}:
            raise ValueError("Alteração exige path, before_sha256 e after.")
        path = _path(item["path"])
        if path in seen or path not in originals or not isinstance(item["after"], str):
            raise ValueError("Caminho duplicado/fora do contexto ou conteúdo inválido.")
        seen.add(path)
        before, before_hash = originals[path]
        if item["before_sha256"] != before_hash:
            raise ValueError("Hash da base da alteração divergente.")
        after_bytes = item["after"].encode("utf-8")
        after = _text(after_bytes)
        if before == after:
            raise ValueError("A proposta não modifica o arquivo.")
        total_after += len(after_bytes)
        if total_after > MAX_CONTEXT_BYTES:
            raise ValueError("Proposta excede 256 KiB de conteúdo.")
        # Display-only diff; exact content hashes also distinguish final newlines.
        diff = "\n".join(difflib.unified_diff(before.splitlines(), after.splitlines(),
                    fromfile="base/" + path, tofile="proposta/" + path, lineterm="")) + "\n"
        total_diff += len(diff.encode())
        if total_diff > MAX_DIFF_BYTES:
            raise ValueError("Diff excede 512 KiB.")
        result.append({"path": path, "before_sha256": before_hash,
                       "after_sha256": hashlib.sha256(after_bytes).hexdigest(),
                       "after_bytes": len(after_bytes), "diff": diff,
                       "before_final_newline": before.endswith("\n"),
                       "after_final_newline": after.endswith("\n"),
                       "before_crlf_count": before.count("\r\n"),
                       "after_crlf_count": after.count("\r\n"),
                       "before_cr_count": before.count("\r"),
                       "after_cr_count": after.count("\r")})
    body = {"schema": "proposal/v1", "policy": POLICY, "base": doc["base"],
            "context_id": context_id, "context_sha256": context["sha256"],
            "changes": sorted(result, key=lambda item: item["path"]),
            "external_effects": False, "purpose": "review-only"}
    record_id = uuid.uuid4().hex
    with db:
        db.execute("INSERT INTO study_proposals VALUES (?, ?, ?, ?, NULL)",
                   (record_id, context_id, _json(body), _hash(body)))
    return get_proposal(db, record_id)


def review_proposal(db, proposal_id: str, current_run_id: str, expected_hash: str,
                    reviewer: str, decision: str) -> dict:
    if decision not in {"accepted_for_study", "rejected"}:
        raise ValueError("Decisão inválida.")
    # Serialize the freshness check and one-time review with other SQLite writers.
    db.execute("BEGIN IMMEDIATE")
    try:
        proposal = get_proposal(db, proposal_id)
        context = get_context(db, proposal["document"]["context_id"])
        if proposal["sha256"] != expected_hash or context["sha256"] != proposal["document"]["context_sha256"]:
            raise ValueError("Hash da proposta/contexto divergente.")
        run = _current(db, current_run_id)
        if run["id"] == context["document"]["source_run_id"]:
            raise ValueError("Faça nova análise da base antes da revisão.")
        if _base(run) != proposal["document"]["base"]:
            raise ValueError("Base alterada: gere novo contexto e proposta.")
        receipt = {"schema": "study-review/v1", "decision": decision,
                   "proposal_sha256": expected_hash, "checked_run_id": current_run_id,
                   "reviewer_declared": _label(reviewer, "Revisor", 100),
                   "reviewed_at": datetime.now(timezone.utc).isoformat(),
                   "authorization_to_execute": False}
        cursor = db.execute("UPDATE study_proposals SET review = ? WHERE id = ? AND review IS NULL",
                            (_json(receipt), proposal_id))
        if cursor.rowcount != 1:
            raise ValueError("Proposta já revisada; crie nova proposta para outra decisão.")
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_proposal(db, proposal_id)
