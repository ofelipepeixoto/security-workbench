"""Inspeção estática limitada de uma cópia local autorizada."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from pathlib import Path

SKIP_DIRS = {".git", ".data", ".venv", "venv", "node_modules", "dist", "build", "__pycache__"}
SKIP_NAMES = {".env", ".env.local", ".env.production"}
TEXT_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".yml", ".yaml", ".txt", ".toml", ".ini", ".cfg"}
MAX_FILES = 5000
MAX_TOTAL_BYTES = 25 * 1024 * 1024
MAX_FILE_BYTES = 1024 * 1024
ASSIGNMENT = re.compile(r"(?i)\b(api[_-]?key|access[_-]?token|secret|password|private[_-]?key)\b\s*[:=]\s*['\"]([^'\"\r\n]{8,})['\"]")
PLACEHOLDER = re.compile(r"(?i)^(?:\$\{|<|your[_-]|changeme|example|placeholder|dummy|test[_-])")
# Retain ordinary versions, ranges and tags. Source specifications can embed
# credentials in userinfo, queries or fragments, so omit the whole value.
SAFE_DEPENDENCY_VERSION = re.compile(
    r"(?:[A-Za-z0-9][A-Za-z0-9._+-]*|[0-9vVxX*^~<>=][0-9A-Za-z.*+^~<>=| -]*)"
)


def fingerprint(kind: str, path: str, detail: str) -> str:
    return hashlib.sha256(f"{kind}\0{path}\0{detail}".encode()).hexdigest()[:20]


def _finding(kind: str, path: str, line: int, detail: str, evidence: str, impact: str, recommendation: str, confidence: str) -> dict:
    return {
        "fingerprint": fingerprint(kind, path, detail),
        "kind": kind,
        "path": path,
        "line": line,
        "status": "candidate",
        "confidence": confidence,
        "evidence": evidence,
        "impact": impact,
        "recommendation": recommendation,
    }


def _inspect_text(path: str, text: str) -> tuple[list[dict], list[dict]]:
    findings: list[dict] = []
    dependencies: list[dict] = []
    for number, line in enumerate(text.splitlines(), 1):
        match = ASSIGNMENT.search(line)
        if match and not PLACEHOLDER.match(match.group(2).strip()):
            key = match.group(1).lower()
            findings.append(_finding(
                "possible-secret", path, number, key,
                f"Atribuição a {key} com valor [REDACTED] em {path}:{number}.",
                "Uma credencial real exposta pode permitir acesso indevido; a validade não foi verificada.",
                "Revisar o valor fora do relatório; se for real, revogá-lo e removê-lo do histórico com procedimento controlado.",
                "low" if "/test" in f"/{path}" or "fixture" in path else "medium",
            ))
        if path.startswith(".github/workflows/") and re.search(r"^\s*permissions\s*:\s*write-all\s*(?:#.*)?$", line):
            findings.append(_finding(
                "broad-workflow-permissions", path, number, "write-all",
                f"Declaração permissions: write-all em {path}:{number}.",
                "Um workflow comprometido pode obter permissões amplas, conforme seu gatilho e contexto.",
                "Revisar o gatilho e conceder apenas permissões específicas necessárias.",
                "high",
            ))
    if path == "requirements.txt":
        for line in text.splitlines():
            match = re.fullmatch(r"\s*([A-Za-z0-9_.-]+)==([A-Za-z0-9_.!+~-]+)\s*", line)
            if match:
                dependencies.append({"name": match.group(1), "version": match.group(2), "source": path})
    if path == "package.json":
        try:
            package = json.loads(text)
            for group in ("dependencies", "devDependencies"):
                values = package.get(group, {})
                if isinstance(values, dict):
                    for name, version in values.items():
                        if isinstance(name, str) and isinstance(version, str):
                            safe_version = version if SAFE_DEPENDENCY_VERSION.fullmatch(version) else "[REDACTED]"
                            dependencies.append({"name": name, "version": safe_version, "source": f"{path}:{group}"})
        except (json.JSONDecodeError, AttributeError):
            pass
    return findings, dependencies


def _read_regular_file(root: Path, relative: Path) -> bytes:
    """Open each path component without following a link, including during races."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    directory = os.open(root, flags | getattr(os, "O_DIRECTORY", 0))
    try:
        for component in relative.parts[:-1]:
            next_directory = os.open(component, flags | getattr(os, "O_DIRECTORY", 0), dir_fd=directory)
            os.close(directory)
            directory = next_directory
        descriptor = os.open(relative.name, flags | getattr(os, "O_NONBLOCK", 0), dir_fd=directory)
        with os.fdopen(descriptor, "rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise ValueError("Tipo de arquivo não regular")
            return stream.read(MAX_FILE_BYTES + 1)
    finally:
        os.close(directory)


def inspect_snapshot(snapshot: Path, *, declared_partial: bool = False) -> dict:
    """Read text files without following symlinks or executing target content."""
    if snapshot.is_symlink() or not snapshot.is_dir():
        raise ValueError("A cópia precisa ser um diretório real, sem link simbólico.")
    root = snapshot.resolve(strict=True)
    findings: list[dict] = []
    dependencies: list[dict] = []
    omissions: list[str] = []
    digest = hashlib.sha256()
    files_read = 0
    total_bytes = 0
    stop = False
    for current, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not (Path(current) / d).is_symlink())
        for name in sorted(files):
            path = Path(current) / name
            if path.is_symlink() or name in SKIP_NAMES or name.startswith(".env"):
                continue
            relative = path.relative_to(root).as_posix()
            if path.suffix.lower() not in TEXT_EXTENSIONS and name not in {"requirements.txt", "Dockerfile"}:
                continue
            try:
                metadata = path.lstat()
                if not stat.S_ISREG(metadata.st_mode):
                    omissions.append(f"{relative}: tipo de arquivo não regular")
                    continue
                size = metadata.st_size
                if size > MAX_FILE_BYTES:
                    omissions.append(f"{relative}: acima de 1 MiB")
                    continue
                if files_read >= MAX_FILES or total_bytes + size > MAX_TOTAL_BYTES:
                    omissions.append("limite global de 5000 arquivos ou 25 MiB atingido")
                    stop = True
                    break
                data = _read_regular_file(root, Path(relative))
                if len(data) > MAX_FILE_BYTES or b"\0" in data:
                    omissions.append(f"{relative}: arquivo grande ou binário")
                    continue
            except (OSError, ValueError):
                omissions.append(f"{relative}: leitura indisponível")
                continue
            files_read += 1
            total_bytes += len(data)
            digest.update(relative.encode("utf-8", errors="replace") + b"\0")
            digest.update(hashlib.sha256(data).digest())
            items, packages = _inspect_text(relative, data.decode("utf-8", errors="replace"))
            findings.extend(items)
            dependencies.extend(packages)
        if stop:
            break
    return {
        "snapshot_digest": digest.hexdigest(),
        "files_read": files_read,
        "bytes_read": total_bytes,
        "partial": bool(declared_partial or omissions),
        "omissions": omissions[:50],
        "findings": findings,
        "dependencies": dependencies,
    }
