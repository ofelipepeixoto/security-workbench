"""Smoke real de PR interno para o próprio repositório privado, sem registrar conteúdo."""

from __future__ import annotations

import base64
import http.client
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
from contextlib import closing
from pathlib import Path
from urllib.parse import urlencode

from workbench.github import _request_json
from workbench.store import connect, get_run
from workbench.web import create_server

# Identidade observada pelo conector autorizado; não é inferida da API sob teste.
TARGET_REPO = "ofelipepeixoto/security-workbench"
TARGET_ID = 1419403320
# Versão já enviada e revisada do PR #2. O alvo é lido como dados, nunca importado.
TARGET_COMMIT = "c8489f1a9fa73aafa8ecbb010281488815128801"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def cli(state: Path, *arguments: str) -> str:
    completed = subprocess.run(
        [sys.executable, "-m", "workbench", "--state", str(state), *arguments],
        capture_output=True, text=True, timeout=150,
    )
    # Não reproduzir stdout/stderr: relatórios completos ficam apenas na memória.
    require(completed.returncode == 0, f"CLI {arguments[0]} falhou (código {completed.returncode}).")
    return completed.stdout


def run() -> dict:
    require(os.environ.get("GITHUB_ACTIONS") == "true", "Smoke reservado ao GitHub Actions.")
    require(os.environ.get("GITHUB_REPOSITORY") == TARGET_REPO, "Repositório do workflow fora do escopo fixado.")
    require(os.environ.get("GITHUB_REPOSITORY_ID") == str(TARGET_ID), "ID do workflow divergente.")
    require(bool(os.environ.get("GITHUB_TOKEN")), "Credencial temporária do job não disponível.")
    metadata = _request_json(f"/repos/{TARGET_REPO}")
    require(metadata.get("private") is True, "O alvo do smoke deve continuar privado.")
    require(metadata.get("id") == TARGET_ID and metadata.get("full_name") == TARGET_REPO, "Identidade de preflight divergente.")
    with tempfile.TemporaryDirectory(prefix="workbench-smoke-") as temporary:
        state = Path(temporary) / "workbench.sqlite3"
        cli(state, "authorize", "--repo", TARGET_REPO, "--repository-id", str(TARGET_ID), "--confirm-owned")
        cli(state, "scan-github", "--repo", TARGET_REPO, "--revision", TARGET_COMMIT)
        with closing(connect(state)) as db:
            rows = db.execute("SELECT id FROM runs").fetchall()
            require(len(rows) == 1, "CLI não persistiu exatamente uma execução.")
            first = get_run(db, rows[0][0])
        require(first["repository_id"] == TARGET_ID and first["revision"] == TARGET_COMMIT, "Evidência CLI divergente.")
        require(first["source"] == "github" and first["verified_revision"] == 1, "Origem CLI não verificada.")
        require(first["files_read"] > 0 and first["bytes_read"] > 0, "Aquisição CLI vazia.")
        report = cli(state, "report", "--run", first["id"])
        require("revisão verificada" in report and str(TARGET_ID) in report, "Relatório CLI sem identidade verificada.")

        # HTTP real em loopback, usando o scanner padrão: sem mock ou replay de API.
        server, password = create_server(state, 0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        host = f"127.0.0.1:{server.server_port}"
        credentials = base64.b64encode(f"operator:{password}".encode()).decode()

        def request(method: str, path: str, values: dict | None = None, *, authenticated=True, origin=None):
            headers = {"Host": host}
            if authenticated:
                headers["Authorization"] = "Basic " + credentials
            body = None
            if values is not None:
                body = urlencode(values)
                headers["Content-Type"] = "application/x-www-form-urlencoded"
                headers["Origin"] = origin or f"http://{host}"
            with closing(http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=150)) as client:
                client.request(method, path, body, headers)
                response = client.getresponse()
                return response.status, response.read().decode("utf-8")

        try:
            require(request("GET", "/", authenticated=False)[0] == 401, "Interface aceitou acesso sem senha.")
            status, page = request("GET", "/")
            require(status == 200 and first["id"] in page, "Histórico CLI ausente na interface.")
            token = re.search(r"name='csrf' value='([^']+)'", page)
            require(token is not None, "Formulário sem token CSRF.")
            form = {"csrf": token.group(1), "repo": TARGET_REPO, "repository_id": str(TARGET_ID), "owned": "yes"}
            require(request("POST", "/authorize", form, origin="http://invalid.test")[0] == 403, "Interface aceitou origem divergente.")
            require(request("POST", "/authorize", form)[0] == 200, "Cadastro HTTP falhou.")
            status, page = request("POST", "/scan", {"csrf": token.group(1), "repo": TARGET_REPO, "revision": TARGET_COMMIT})
            require(status == 200, "Aquisição GitHub pela interface falhou.")
            match = re.search(r"Análise ([0-9a-f]{16})", page)
            require(match is not None, "Interface não retornou uma análise.")
            second_id = match.group(1)
            require(request("GET", f"/run/{second_id}")[0] == 200, "Página da análise falhou.")
            status, downloaded = request("GET", f"/report/{second_id}.md")
            require(status == 200 and "revisão verificada" in downloaded, "Download do relatório falhou.")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

        with closing(connect(state)) as db:
            second = get_run(db, second_id)
        require(second["id"] != first["id"], "Interface não criou nova execução.")
        require(second["repository_id"] == TARGET_ID and second["revision"] == TARGET_COMMIT, "Evidência HTTP divergente.")
        require(second["source"] == "github" and second["verified_revision"] == 1, "Origem HTTP não verificada.")
        require(second["digest"] == first["digest"] and second["files_read"] == first["files_read"], "Mesmo commit produziu cópias divergentes.")
        comparison = json.loads(cli(state, "compare", "--before", first["id"], "--after", second["id"]))
        require(not comparison["new"] and not comparison["no_longer_detected"], "Comparação do mesmo commit divergente.")
        # Só metadados e contagens. Sem fonte, tokens, banco ou relatório completo.
        return {
            "status": "passed", "transport": "direct_https_api", "repository": TARGET_REPO,
            "repository_id": TARGET_ID, "target_commit": TARGET_COMMIT, "private": True,
            "executions": 2, "flows": ["cli", "loopback_http"],
            "files_analyzed_per_run": first["files_read"], "bytes_analyzed_per_run": first["bytes_read"],
            "snapshot_digest": first["digest"], "candidates_per_run": len(first["findings"]),
            "dependencies_per_run": len(first["dependencies"]), "partial": bool(first["partial"]),
            "coverage": "supported_formats_only", "same_commit_comparison": "passed",
        }


if __name__ == "__main__":
    try:
        print(json.dumps(run(), ensure_ascii=False, sort_keys=True))
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(f"Smoke falhou: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
