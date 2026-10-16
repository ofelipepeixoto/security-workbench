"""Aquisição GitHub somente leitura, com identidade e conteúdo verificados."""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import PurePosixPath

from .core import (MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, SKIP_DIRS,
                   SKIP_NAMES, TEXT_EXTENSIONS, _inspect_text)
from .store import normalize_repo

SHA = re.compile(r"^[0-9a-fA-F]{40}$")
MAX_RESPONSE = 8 * 1024 * 1024


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ValueError("Redirecionamento da API recusado.")


def _request_json(path: str) -> dict:
    if not path.startswith("/repos/") or "?" in path and not path.endswith("?recursive=1"):
        raise ValueError("Caminho de API inválido.")
    token = os.environ.get("GITHUB_TOKEN", "")
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "security-workbench-local"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request("https://api.github.com" + path, headers=headers, method="GET")
    try:
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=20) as response:
            if response.status != 200:
                raise ValueError("Resposta inesperada do GitHub.")
            data = response.read(MAX_RESPONSE + 1)
            if len(data) > MAX_RESPONSE:
                raise ValueError("Resposta do GitHub excede o limite.")
            value = json.loads(data)
    except urllib.error.HTTPError as exc:
        raise ValueError(f"GitHub retornou HTTP {exc.code}; confira acesso e limite da API.") from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ValueError(f"Falha ao consultar GitHub: {type(exc).__name__}.") from None
    if not isinstance(value, dict):
        raise ValueError("Resposta inválida da API.")
    return value


def _sha(value: object) -> str:
    if not isinstance(value, str) or not SHA.fullmatch(value):
        raise ValueError("SHA Git inválido na resposta.")
    return value.lower()


def _eligible(path: str) -> bool:
    parts = PurePosixPath(path).parts
    if not parts or PurePosixPath(path).as_posix() != path or any(part in {"", ".", ".."} for part in parts) or path.startswith("/") or "\\" in path:
        return False
    if any(part in SKIP_DIRS for part in parts[:-1]) or parts[-1] in SKIP_NAMES or parts[-1].startswith(".env"):
        return False
    return PurePosixPath(path).suffix.lower() in TEXT_EXTENSIONS or parts[-1] in {"requirements.txt", "Dockerfile"}


def inspect_github(repo: str, revision: str, *, request_json=None) -> tuple[str, dict]:
    """Require a full commit SHA; verify repo identity, commit tree and every consumed blob."""
    repo = normalize_repo(repo)
    revision = _sha(revision)
    fetch = request_json or _request_json
    prefix = f"/repos/{repo}"
    metadata = fetch(prefix)
    if normalize_repo(metadata.get("full_name", "")) != repo or not isinstance(metadata.get("id"), int):
        raise ValueError("Identidade do repositório divergente.")
    commit = fetch(f"{prefix}/git/commits/{revision}")
    if _sha(commit.get("sha")) != revision:
        raise ValueError("Commit divergente do solicitado.")
    tree_sha = _sha((commit.get("tree") or {}).get("sha"))
    listing = fetch(f"{prefix}/git/trees/{tree_sha}?recursive=1")
    if _sha(listing.get("sha")) != tree_sha or not isinstance(listing.get("tree"), list):
        raise ValueError("Árvore divergente ou inválida.")
    omissions: list[str] = []
    if listing.get("truncated") is True:
        omissions.append("Árvore GitHub truncada; cobertura parcial.")
    elif listing.get("truncated") is not False:
        raise ValueError("Cobertura da árvore desconhecida.")
    findings: list[dict] = []
    dependencies: list[dict] = []
    digest = hashlib.sha256()
    files_read = total_bytes = 0
    seen: set[str] = set()
    for item in sorted(listing["tree"], key=lambda value: str(value.get("path", ""))):
        path = item.get("path")
        if not isinstance(path, str) or not _eligible(path):
            continue
        if path in seen:
            raise ValueError("Caminho duplicado na árvore.")
        seen.add(path)
        if item.get("type") != "blob" or item.get("mode") not in {"100644", "100755"}:
            omissions.append(f"{path}: tipo não regular")
            continue
        size = item.get("size")
        if not isinstance(size, int) or size < 0 or size > MAX_FILE_BYTES:
            omissions.append(f"{path}: tamanho ausente ou acima de 1 MiB")
            continue
        if files_read >= MAX_FILES or total_bytes + size > MAX_TOTAL_BYTES:
            omissions.append("limite global de 5000 arquivos ou 25 MiB atingido")
            break
        blob_sha = _sha(item.get("sha"))
        blob = fetch(f"{prefix}/git/blobs/{blob_sha}")
        if _sha(blob.get("sha")) != blob_sha or blob.get("encoding") != "base64" or blob.get("size") != size:
            raise ValueError(f"Blob divergente: {path}")
        try:
            data = base64.b64decode(blob["content"], validate=False)
        except (KeyError, TypeError, ValueError, binascii.Error):
            raise ValueError(f"Blob inválido: {path}") from None
        if len(data) != size or len(data) > MAX_FILE_BYTES or hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest() != blob_sha:
            raise ValueError(f"Conteúdo ou hash divergente: {path}")
        if b"\0" in data:
            omissions.append(f"{path}: binário")
            continue
        files_read += 1
        total_bytes += len(data)
        digest.update(path.encode("utf-8", errors="replace") + b"\0")
        digest.update(hashlib.sha256(data).digest())
        found, packages = _inspect_text(path, data.decode("utf-8", errors="replace"))
        findings.extend(found)
        dependencies.extend(packages)
    return revision, {
        "snapshot_digest": digest.hexdigest(), "files_read": files_read,
        "bytes_read": total_bytes, "partial": bool(omissions),
        "omissions": omissions[:50], "findings": findings, "dependencies": dependencies,
    }
