"""CLI local e interface restrita ao loopback."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from .core import inspect_snapshot
from .github import inspect_github
from .store import authorize, compare, connect, get_run, review, require_scope, save_run, scoped_repository_id


def render_report(run: dict) -> str:
    coverage = "PARCIAL" if run["partial"] else "Limitada aos arquivos suportados"
    verified = bool(run.get("verified_revision")) and type(run.get("repository_id")) is int and run["repository_id"] > 0
    lines = [
        f"# Security Workbench — {run['repo']}", "",
        f"Análise: `{run['id']}` · revisão {'verificada' if verified else 'declarada'}: `{run['revision']}`",
        f"Repository ID: {run.get('repository_id') or 'não verificado'}",
        f"Origem: {run.get('source', 'local')} · digest dos arquivos lidos: `{run['digest']}`",
        f"Cobertura: **{coverage}** · {run['files_read']} arquivos / {run['bytes_read']} bytes", "",
        ("Identidade, commit e hashes dos arquivos lidos foram conferidos via API do GitHub. " if verified else
         "A revisão declarada não foi confrontada com o GitHub. ") + "Ausência de achados não comprova segurança.", "",
        "## Achados", "",
    ]
    if not run["findings"]:
        lines.append("Nenhum candidato nos arquivos lidos.")
    for item in run["findings"]:
        lines.extend([
            f"### {item['kind']} · `{item['fingerprint']}`", "",
            f"Local: `{item['path']}:{item['line']}` · estado: **{item['status']}** · confiança: {item['confidence']}", "",
            f"Evidência: {item['evidence']}", "",
            f"Impacto possível: {item['impact']}", "",
            f"Recomendação: {item['recommendation']}", "",
        ])
    lines.extend(["## Inventário de dependências (sem análise de CVEs)", ""])
    lines.extend(f"- `{item['name']}` `{item['version']}` ({item['source']})" for item in run["dependencies"])
    if not run["dependencies"]:
        lines.append("Nenhuma dependência reconhecida nos manifestos suportados.")
    if run["omissions"]:
        lines.extend(["", "## Limitações de leitura", ""])
        lines.extend(f"- {item}" for item in run["omissions"])
    if run.get("source") == "rea-import":
        provenance = run.get("provenance", {})
        lines.extend([
            "", "## Proveniência REA importada", "",
            "Contagens e digest do artefato são declarações do JSON importado. Não comprovam execução isolada, autenticidade do produtor ou vínculo com o commit.",
            f"SHA-256 observado do relatório importado: `{provenance.get('report_sha256', '')}`.",
            "Observações estruturais permanecem candidatos; valores de código, URLs e caminhos absolutos do produtor foram omitidos.",
        ])
    return "\n".join(lines) + "\n"


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description="Security Workbench — análise local autorizada")
    command.add_argument("--state", type=Path, default=Path(".data/workbench.sqlite3"), help="Banco local (fora do Git)")
    sub = command.add_subparsers(dest="action", required=True)
    allowed = sub.add_parser("authorize", help="Registrar declaração de autorização")
    allowed.add_argument("--repo", required=True)
    allowed.add_argument("--repository-id", type=int, help="ID GitHub revisado explicitamente; obrigatório para aquisição GitHub")
    allowed.add_argument("--confirm-owned", action="store_true", required=True)
    scan = sub.add_parser("scan", help="Inspecionar uma cópia local")
    scan.add_argument("--repo", required=True)
    scan.add_argument("--snapshot", required=True, type=Path)
    scan.add_argument("--revision", required=True)
    scan.add_argument("--partial", action="store_true", help="Marcar cópia como subconjunto do repositório")
    github = sub.add_parser("scan-github", help="Ler GitHub em modo somente leitura")
    github.add_argument("--repo", required=True)
    github.add_argument("--revision", required=True, help="SHA completo do commit (40 hexadecimais)")
    rea = sub.add_parser("import-rea", help="Importar Evidence estático REA local, sem executar o alvo")
    rea.add_argument("--repo", required=True)
    rea.add_argument("--revision", required=True, help="Commit declarado de 40 hexadecimais, não verificado pela importação")
    rea.add_argument("--evidence", type=Path, required=True, help="JSON Evidence do analyze-javascript-application --json")
    serve = sub.add_parser("serve", help="Interface privada em 127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    sub.add_parser("runs", help="Listar análises")
    report = sub.add_parser("report", help="Exibir relatório Markdown")
    report.add_argument("--run", required=True)
    decision = sub.add_parser("review", help="Registrar decisão humana")
    decision.add_argument("--run", required=True)
    decision.add_argument("--finding", required=True)
    decision.add_argument("--decision", choices=["candidate", "confirmed", "false_positive", "accepted_risk"], required=True)
    diff = sub.add_parser("compare", help="Comparar impressões digitais entre análises")
    diff.add_argument("--before", required=True)
    diff.add_argument("--after", required=True)
    return command


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.action == "serve":
            from .web import serve
            serve(args.state, args.port)
            return 0
        with connect(args.state) as db:
            if args.action == "authorize":
                print(f"Escopo cadastrado: {authorize(db, args.repo, args.repository_id)}")
            elif args.action == "scan":
                repo = require_scope(db, args.repo)
                result = inspect_snapshot(args.snapshot, declared_partial=args.partial)
                run_id = save_run(db, repo, args.revision, result)
                print(f"Análise {run_id}: {result['files_read']} arquivos, {len(result['findings'])} candidatos; parcial={result['partial']}")
            elif args.action == "scan-github":
                repo = require_scope(db, args.repo)
                revision, result = inspect_github(repo, args.revision, repository_id=scoped_repository_id(db, repo))
                run_id = save_run(db, repo, revision, result, source="github", verified_revision=True)
                print(f"Análise {run_id}: {result['files_read']} arquivos, {len(result['findings'])} candidatos; parcial={result['partial']}")
            elif args.action == "import-rea":
                from .rea import parse_rea_evidence, read_evidence
                repo = require_scope(db, args.repo)
                repository_id = scoped_repository_id(db, repo)
                if not re.fullmatch(r"[a-fA-F0-9]{40}", args.revision):
                    raise ValueError("A revisão declarada precisa ser SHA completo de 40 hexadecimais.")
                result = parse_rea_evidence(read_evidence(args.evidence))
                result["repository_id"] = repository_id
                run_id = save_run(db, repo, args.revision.lower(), result, source="rea-import")
                print(f"Importação {run_id}: {len(result['findings'])} candidatos estruturais; cobertura parcial; execução REA não comprovada pelo Workbench.")
            elif args.action == "runs":
                for row in db.execute("SELECT id, repo, revision, created_at, partial FROM runs ORDER BY created_at DESC"):
                    print(" | ".join(map(str, row)))
            elif args.action == "report":
                print(render_report(get_run(db, args.run)), end="")
            elif args.action == "review":
                review(db, args.run, args.finding, args.decision)
                print("Revisão registrada.")
            elif args.action == "compare":
                print(json.dumps(compare(db, args.before, args.after), ensure_ascii=False, indent=2))
    except (ValueError, PermissionError, OSError) as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

