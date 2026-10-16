"""Interface HTML local com senha temporária; não deve ser exposta por proxy."""

from __future__ import annotations

import base64
import binascii
import hmac
import html
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from .github import inspect_github
from .store import authorize, connect, get_run, require_scope, review, save_run


def h(value: object) -> str:
    return html.escape(str(value), quote=True)


def create_server(state: Path, port: int = 8765, *, scanner=inspect_github):
    if not 0 <= port <= 65535:
        raise ValueError("Porta inválida.")
    password = secrets.token_urlsafe(24)
    csrf = secrets.token_urlsafe(24)
    scan_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format, *args):
            pass

        def _send(self, status, body, content_type="text/html; charset=utf-8", *, extra=None):
            data = body.encode("utf-8")
            self.close_connection = True
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'")
            for key, value in (extra or {}).items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(data)

        def _auth(self):
            if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}":
                self._send(403, "Host inválido.", "text/plain; charset=utf-8")
                return False
            value = self.headers.get("Authorization", "")
            try:
                kind, encoded = value.split(" ", 1)
                raw = base64.b64decode(encoded, validate=True).decode("utf-8")
            except (ValueError, UnicodeError, binascii.Error):
                raw = ""
                kind = ""
            if kind.lower() != "basic" or not hmac.compare_digest(raw, "operator:" + password):
                self._send(401, "Autenticação necessária.", "text/plain; charset=utf-8", extra={"WWW-Authenticate": 'Basic realm="Security Workbench"'})
                return False
            return True

        def _page(self, title, content, status=200):
            css = "body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.5;background:#f7f9fc;color:#182334}main{background:white;padding:1.5rem;border-radius:12px}input,select,button{font:inherit;padding:.55rem;margin:.25rem}input[type=text]{width:min(95%,35rem)}button{background:#1245a1;color:white;border:0;border-radius:5px}section{border-top:1px solid #ddd;margin-top:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#445}a{color:#1245a1}"
            self._send(status, f"<!doctype html><html lang='pt-BR'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>{h(title)} · Security Workbench</title><style>{css}</style><main><nav><a href='/'>Início</a></nav><h1>{h(title)}</h1>{content}</main></html>")

        def do_GET(self):
            if not self._auth():
                return
            path = urlsplit(self.path).path
            try:
                with connect(state) as db:
                    if path == "/":
                        scopes = [row[0] for row in db.execute("SELECT repo FROM scope ORDER BY repo")]
                        runs = list(db.execute("SELECT id, repo, revision, partial, files_read FROM runs ORDER BY created_at DESC LIMIT 30"))
                        options = "".join(f"<option value='{h(repo)}'>{h(repo)}</option>" for repo in scopes)
                        history = "".join(f"<li><a href='/run/{h(row['id'])}'>{h(row['repo'])} · {h(row['id'])}</a> · {h(row['files_read'])} arquivos · {'parcial' if row['partial'] else 'limitada'}</li>" for row in runs)
                        token = h(csrf)
                        content = f"<p>Uso pessoal no próprio computador. A análise lê arquivos do GitHub sem executá-los. Informe o SHA completo do commit.</p><section><h2>1. Cadastrar autorização</h2><form method='post' action='/authorize'><input type='hidden' name='csrf' value='{token}'><label>Repositório seu (owner/repo)<br><input name='repo' type='text' required></label><br><label><input type='checkbox' name='owned' value='yes' required>Confirmo que tenho autorização para analisar este repositório.</label><br><button>Cadastrar</button></form></section><section><h2>2. Analisar commit</h2><form method='post' action='/scan'><input type='hidden' name='csrf' value='{token}'><label>Escopo <select name='repo' required>{options}</select></label><br><label>SHA do commit (40 caracteres)<br><input name='revision' type='text' minlength='40' maxlength='40' required></label><br><button>Iniciar análise</button></form><small>Para repositórios privados, configure GITHUB_TOKEN no ambiente antes de iniciar o servidor. Não cole tokens nesta página.</small></section><section><h2>Histórico</h2><ul>{history or '<li>Nenhuma análise.</li>'}</ul></section>"
                        self._page("Security Workbench", content)
                    elif path.startswith("/run/"):
                        run_id = path.removeprefix("/run/")
                        run = get_run(db, run_id)
                        findings = "".join(f"<section><h3>{h(item['kind'])} · {h(item['path'])}:{h(item['line'])}</h3><p>{h(item['evidence'])}</p><p>Impacto possível: {h(item['impact'])}</p><p>Confiança: {h(item['confidence'])} · Estado: {h(item['status'])}</p><p>Recomendação: {h(item['recommendation'])}</p><form method='post' action='/review'><input type='hidden' name='csrf' value='{h(csrf)}'><input type='hidden' name='run' value='{h(run_id)}'><input type='hidden' name='finding' value='{h(item['fingerprint'])}'><select name='decision'><option value='candidate'>Candidato</option><option value='confirmed'>Confirmado após revisão</option><option value='false_positive'>Falso positivo</option><option value='accepted_risk'>Risco aceito</option></select><button>Salvar revisão</button></form></section>" for item in run["findings"])
                        omissions = "".join(f"<li>{h(item)}</li>" for item in run["omissions"])
                        content = f"<p>Repositório: {h(run['repo'])} · Commit: <code>{h(run['revision'])}</code></p><p>Origem: {h(run['source'])} · verificado: {'sim' if run['verified_revision'] else 'não'} · cobertura parcial: {'sim' if run['partial'] else 'não'} · {h(run['files_read'])} arquivos</p><p><a href='/report/{h(run_id)}.md'>Baixar relatório Markdown</a></p><h2>Achados candidatos e revisão</h2>{findings or '<p>Nenhum candidato nos arquivos lidos.</p>'}<h2>Limitações</h2><ul>{omissions or '<li>Regras e tipos de arquivo limitados; ausência de achados não comprova segurança.</li>'}</ul>"
                        self._page("Análise", content)
                    elif path.startswith("/report/") and path.endswith(".md"):
                        from .__main__ import render_report
                        run_id = path.removeprefix("/report/").removesuffix(".md")
                        self._send(200, render_report(get_run(db, run_id)), "text/markdown; charset=utf-8", extra={"Content-Disposition": 'attachment; filename="security-workbench-report.md"'})
                    else:
                        self._page("Não encontrado", "<p>Página não encontrada.</p>", 404)
            except ValueError as exc:
                self._page("Erro", f"<p>{h(exc)}</p>", 400)

        def do_POST(self):
            if not self._auth():
                return
            origin = self.headers.get("Origin")
            host = f"127.0.0.1:{self.server.server_port}"
            length = self.headers.get("Content-Length", "")
            if origin not in {None, f"http://{host}"} or self.headers.get("Content-Type", "").split(";", 1)[0].lower() != "application/x-www-form-urlencoded" or not length.isdecimal() or not 0 < int(length) <= 8192:
                self._page("Requisição recusada", "<p>Origem ou formato inválido.</p>", 403)
                return
            form = parse_qs(self.rfile.read(int(length)).decode("utf-8", errors="replace"), keep_blank_values=True)
            one = lambda key: form.get(key, [""])[0]
            if len(form) > 8 or not hmac.compare_digest(one("csrf"), csrf):
                self._page("Requisição recusada", "<p>Token do formulário inválido.</p>", 403)
                return
            try:
                path = urlsplit(self.path).path
                with connect(state) as db:
                    if path == "/authorize":
                        if one("owned") != "yes":
                            raise ValueError("Confirme a autorização.")
                        repo = authorize(db, one("repo"))
                        message = f"Escopo cadastrado: {repo}"
                    elif path == "/scan":
                        repo = require_scope(db, one("repo"))
                        if not scan_lock.acquire(blocking=False):
                            raise ValueError("Já há uma análise em andamento.")
                        try:
                            revision, result = scanner(repo, one("revision"))
                            run_id = save_run(db, repo, revision, result, source="github", verified_revision=True)
                        finally:
                            scan_lock.release()
                        message = f"Análise {run_id} concluída: {result['files_read']} arquivos, {len(result['findings'])} candidatos."
                    elif path == "/review":
                        review(db, one("run"), one("finding"), one("decision"))
                        message = "Revisão registrada."
                    else:
                        self._page("Não encontrado", "<p>Ação não encontrada.</p>", 404)
                        return
                self._page("Concluído", f"<p>{h(message)}</p><p><a href='/'>Voltar ao início</a></p>")
            except (ValueError, PermissionError, OSError) as exc:
                self._page("Erro", f"<p>{h(exc)}</p>", 400)

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    return server, password


def serve(state: Path, port: int = 8765):
    server, password = create_server(state, port)
    print(f"Abra http://127.0.0.1:{server.server_port}/ no próprio computador.")
    print("Usuário: operator")
    print(f"Senha temporária (válida apenas nesta execução): {password}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
