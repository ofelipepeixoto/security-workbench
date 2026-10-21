"""Importação offline de uma projeção limitada do Evidence estático do REA.

Este módulo não inicia REA, resolve URLs ou executa o artefato. O JSON é uma
declaração externa: hashes identificam conteúdo, não autenticam o produtor.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import stat
from pathlib import Path

from .core import fingerprint

MAX_REPORT_BYTES = 1024 * 1024
MAX_DEPTH = 32
MAX_VALUES = 25000
MAX_STRING = 16384
MAX_GRAPH_NODES = 1000
MAX_OBSERVATIONS = 2000
MAX_CANDIDATES = 100
SOURCE_COMMIT = "3e7c6302233ecbcb9b92e43ee5a60337738961bd"
SHA256 = re.compile(r"^[a-f0-9]{64}$")
STRUCTURAL_KINDS = {
    "endpoint", "storage", "worker", "service-worker", "context-bridge-api",
    "ipc-handler", "browser-window",
}
STATIC_AUTHORITIES = {"ast-static-analysis", "static-relationship-inference"}


def _invalid() -> ValueError:
    # Never include an input value, absolute path or parser diagnostic.
    return ValueError("Evidence REA inválido ou fora dos limites de importação.")


def _read_evidence(path: Path) -> bytes:
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    if not nofollow:
        # Do not silently follow Windows reparse points or emulate a race-free
        # primitive with lstat()+open(). In-memory parsing remains independent.
        raise _invalid()
    descriptor = os.open(path, os.O_RDONLY | nofollow | getattr(os, "O_NONBLOCK", 0))
    with os.fdopen(descriptor, "rb") as stream:
        metadata = os.fstat(stream.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_REPORT_BYTES:
            raise _invalid()
        data = stream.read(MAX_REPORT_BYTES + 1)
    if len(data) > MAX_REPORT_BYTES:
        raise _invalid()
    return data


def read_evidence(path: Path) -> bytes:
    """Read one bounded regular file without reflecting its path on failure."""
    try:
        return _read_evidence(path)
    except (OSError, ValueError):
        raise _invalid() from None


def _pairs(pairs: list) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise _invalid()
        result[key] = value
    return result


def _json(data: bytes) -> dict:
    if not isinstance(data, bytes) or not data or len(data) > MAX_REPORT_BYTES:
        raise _invalid()
    try:
        text = data.decode("utf-8", errors="strict")
        # Bound nesting before the JSON decoder allocates nested collections.
        depth, quoted, escaped = 0, False, False
        for char in text:
            if quoted:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    quoted = False
            elif char == '"':
                quoted = True
            elif char in "[{":
                depth += 1
                if depth > MAX_DEPTH:
                    raise _invalid()
            elif char in "]}":
                depth -= 1
        value = json.loads(text, object_pairs_hook=_pairs, parse_constant=lambda _: (_ for _ in ()).throw(_invalid()))
        pending, visited = [value], 0
        while pending:
            item = pending.pop()
            visited += 1
            if visited > MAX_VALUES:
                raise _invalid()
            if isinstance(item, str) and (len(item) > MAX_STRING or any(0xD800 <= ord(char) <= 0xDFFF for char in item)):
                raise _invalid()
            if isinstance(item, float) and not math.isfinite(item):
                raise _invalid()
            if isinstance(item, dict):
                if any(len(key) > 100 or any(0xD800 <= ord(char) <= 0xDFFF for char in key) for key in item):
                    raise _invalid()
                pending.extend(item.values())
            elif isinstance(item, list):
                pending.extend(item)
        return _object(value)
    except (ValueError, UnicodeError, RecursionError, OverflowError):
        raise _invalid() from None


def _object(value: object) -> dict:
    if type(value) is not dict:
        raise _invalid()
    return value


def _count(value: object, maximum: int = 9007199254740991) -> int:
    if type(value) is not int or not 0 <= value <= maximum:
        raise _invalid()
    return value


def _digest(value: object, prefix: str = "") -> str:
    if not isinstance(value, str) or not value.startswith(prefix) or not SHA256.fullmatch(value[len(prefix):]):
        raise _invalid()
    return value


def _path(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_./-]{1,240}", value):
        raise _invalid()
    if any(part in {"", ".", ".."} or part.startswith(".env") for part in value.split("/")):
        raise _invalid()
    if Path(value).suffix.lower() not in {".js", ".mjs", ".cjs", ".jsx"}:
        raise _invalid()
    return value


def _coverage(value: object) -> dict:
    value = _object(value)
    status = value.get("status")
    truncated, omitted = value.get("truncated"), value.get("omitted_count")
    if status not in {"complete", "partial", "unknown", "unavailable"} or type(truncated) is not bool:
        raise _invalid()
    if omitted is not None:
        _count(omitted)
    if status == "complete" and (truncated or omitted != 0):
        raise _invalid()
    if status in {"unknown", "unavailable"} and (truncated or omitted is not None):
        raise _invalid()
    if truncated and (status != "partial" or omitted == 0):
        raise _invalid()
    limits = value.get("limits")
    if not isinstance(limits, list) or len(limits) > 32 or (truncated and not limits):
        raise _invalid()
    for limit in limits:
        limit = _object(limit)
        if not isinstance(limit.get("name"), str) or not 1 <= len(limit["name"]) <= 100:
            raise _invalid()
        _count(limit.get("value"))
        if limit.get("unit") not in {"items", "bytes", "milliseconds", "depth", "characters", "instructions", "other"}:
            raise _invalid()
    # Arbitrary limit names, raw limitations and source strings are not retained.
    return {"status": status, "truncated": truncated, "omitted_count": omitted, "declared_limits_count": len(limits)}


def _parse_rea_evidence(data: bytes) -> dict:
    """Validate a bounded native Evidence subset and return safe Workbench data.

    Native graph/semantic digests and execution/isolation are NOT verified by
    this importer. Runtime observations and arbitrary source values are omitted.
    """
    evidence = _json(data)
    if evidence.get("operation") != "analyze_javascript_application" or evidence.get("predicate_type") != "rea.javascript-application-analysis":
        raise _invalid()
    provider = _object(evidence.get("provider"))
    if provider.get("id") != "rea-javascript-application" or provider.get("version") != "1":
        raise _invalid()
    if evidence.get("authority") != "shipped-artifact" or evidence.get("confidence") != "derived":
        raise _invalid()
    evidence_id = _digest(evidence.get("evidence_id"), "ev_")
    result = _object(evidence.get("normalized_result"))
    root_digest = _digest(result.get("root_artifact_sha256"))
    subject = _object(evidence.get("subject"))
    if _object(subject.get("digest")).get("sha256") != root_digest or subject.get("format") != result.get("format") or result.get("format") not in {"directory", "asar"}:
        raise _invalid()
    statistics = _object(result.get("statistics"))
    files = _count(statistics.get("relevant_files"), 5000)
    parsed = _count(statistics.get("parsed_javascript_files"), files)
    failures = _count(statistics.get("parse_failures"), files)
    byte_count = _count(statistics.get("text_bytes_read"), 25 * 1024 * 1024)
    _count(statistics.get("findings"), 1000000)
    graph = _object(result.get("graph"))
    if graph.get("schema") != "JavaScriptApplicationGraph":
        raise _invalid()
    coverage = _coverage(graph.get("coverage"))
    nodes = graph.get("nodes")
    if not isinstance(nodes, list) or not 1 <= len(nodes) <= MAX_GRAPH_NODES:
        raise _invalid()
    findings, seen, node_ids = [], set(), set()
    observed, omitted = 0, 0
    for node in nodes:
        node = _object(node)
        node_id = _digest(node.get("node_id"), "jag_node_")
        if node_id in node_ids:
            raise _invalid()
        node_ids.add(node_id)
        observations = node.get("observations")
        if not isinstance(observations, list) or not observations:
            raise _invalid()
        observed += len(observations)
        if observed > MAX_OBSERVATIONS:
            raise _invalid()
        for observation in observations:
            observation = _object(observation)
            kind = node.get("kind")
            if not isinstance(kind, str):
                raise _invalid()
            if kind not in STRUCTURAL_KINDS:
                omitted += 1
                continue
            fact = _object(observation.get("evidence"))
            if not isinstance(fact.get("authority"), str) or not isinstance(fact.get("state"), str):
                raise _invalid()
            if fact.get("authority") not in STATIC_AUTHORITIES or fact.get("state") not in {"observed", "inferred"}:
                omitted += 1
                continue
            observation_id = _digest(observation.get("observation_id"), "jag_observation_")
            artifact, location = _object(fact.get("artifact")), _object(fact.get("location"))
            if artifact.get("available") is not True or location.get("available") is not True:
                omitted += 1
                continue
            artifact_digest = _digest(artifact.get("sha256"))
            if artifact.get("artifact_id") != f"art_{artifact_digest}":
                raise _invalid()
            place = _object(location.get("value"))
            if place.get("kind") != "source-range":
                omitted += 1
                continue
            path = _path(place.get("source"))
            start, end = _object(place.get("start")), _object(place.get("end"))
            line, last = _count(start.get("line"), 10000000), _count(end.get("line"), 10000000)
            column, last_column = _count(start.get("column"), 10000000), _count(end.get("column"), 10000000)
            if line < 1 or last < line or (last == line and last_column < column):
                raise _invalid()
            token = fingerprint(f"rea-structural-{kind}", path, observation_id)
            if token in seen:
                continue
            seen.add(token)
            if len(findings) >= MAX_CANDIDATES:
                omitted += 1
                continue
            findings.append({
                "fingerprint": token, "kind": f"rea-structural-{kind}", "path": path,
                "line": line, "status": "candidate", "confidence": "low",
                "evidence": f"Observação estrutural REA importada: {kind} em {path}:{line}; SHA-256 declarado do artefato {artifact_digest}. Valores de código omitidos.",
                "impact": "Superfície estrutural para revisão; presença estática não demonstra falha, exploração ou comportamento em execução.",
                "recommendation": "Conferir a origem e o contexto no artefato autorizado; somente a revisão humana pode confirmar um achado.",
            })
    roots = graph.get("root_node_ids")
    if not isinstance(roots, list) or not 1 <= len(roots) <= 32 or any(root not in node_ids for root in roots):
        raise _invalid()
    return {
        "snapshot_digest": root_digest, "files_read": parsed, "bytes_read": byte_count,
        "partial": True, "dependencies": [], "findings": findings,
        "omissions": [
            "REA importado: execução, isolamento, origem e vínculo com o commit não foram comprovados pelo Workbench.",
            "Cobertura e hashes do artefato são declarados no JSON; assinaturas e digests internos do REA não foram autenticados.",
            f"Projeção limitada: {omitted} observações não importadas; {failures} falhas de parse declaradas. Não avalia CVEs nem executa o alvo.",
        ],
        "provenance": {
            "schema": "security-workbench.rea-import/v1", "report_sha256": hashlib.sha256(data).hexdigest(),
            "evidence_id_declared": evidence_id, "root_artifact_sha256_declared": root_digest,
            "contract_source_commit": SOURCE_COMMIT, "contract_source_package_version": "6.4.0",
            "provider_contract_version": "1", "coverage_declared": coverage,
            "relevant_files_declared": files, "observations_seen": observed, "observations_omitted": omitted,
            "execution_verified": False, "network_isolation_verified": False, "artifact_bytes_verified": False,
        },
    }


def parse_rea_evidence(data: bytes) -> dict:
    """Import only the supported static projection; reject malformed types safely."""
    try:
        return _parse_rea_evidence(data)
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError, RecursionError):
        raise _invalid() from None
