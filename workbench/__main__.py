"""CLI local e interface restrita ao loopback."""

from __future__ import annotations

import argparse
import json
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
    context = sub.add_parser("context-create", help="Fixar contexto limitado para estudo")
    context.add_argument("--run", required=True)
    context.add_argument("--path", action="append", required=True)
    context.add_argument("--task", required=True)
    context_show = sub.add_parser("context-show", help="Consultar manifesto persistido")
    context_show.add_argument("--context", required=True)
    proposal = sub.add_parser("proposal-create", help="Gerar diff para revisão, sem aplicar")
    proposal.add_argument("--context", required=True)
    proposal.add_argument("--snapshot", type=Path, required=True)
    proposal.add_argument("--spec", type=Path, required=True)
    proposal_show = sub.add_parser("proposal-show", help="Consultar proposta local, incluindo diff")
    proposal_show.add_argument("--proposal", required=True)
    proposal_review = sub.add_parser("proposal-review", help="Registrar revisão de estudo, sem execução")
    proposal_review.add_argument("--proposal", required=True)
    proposal_review.add_argument("--current-run", required=True)
    proposal_review.add_argument("--expected-hash", required=True)
    proposal_review.add_argument("--reviewer", required=True)
    proposal_review.add_argument("--decision", choices=["accepted_for_study", "rejected"], required=True)
    sub.add_parser("study-list", help="Recuperar IDs dos 100 registros mais recentes de cada tipo")
    supabase = sub.add_parser("supabase-plan", help="Planejar controles Supabase offline, sem executar SQL")
    supabase.add_argument("--run", required=True)
    supabase.add_argument("--path", action="append", required=True)
    recovered = sub.add_parser("supabase-plan-show", help="Recuperar plano Supabase pelo contexto persistido")
    recovered.add_argument("--context", required=True)
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
            elif args.action in {"supabase-plan", "supabase-plan-show"}:
                from .supabase import create_plan, recover_plan
                result = create_plan(db, args.run, args.path) if args.action == "supabase-plan" else recover_plan(db, args.context)
                print(json.dumps(result, ensure_ascii=True, indent=2))
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
            elif args.action in {"context-create", "context-show", "proposal-create", "proposal-show", "proposal-review", "study-list"}:
                from .changes import create_context, create_proposal, get_context, get_proposal, load_spec, review_proposal
                if args.action == "context-create":
                    record = create_context(db, args.run, args.path, args.task)
                    result = {"id": record["id"], "sha256": record["sha256"]}
                elif args.action == "context-show":
                    result = get_context(db, args.context)
                elif args.action == "proposal-create":
                    record = create_proposal(db, args.context, args.snapshot, load_spec(args.spec))
                    result = {"id": record["id"], "sha256": record["sha256"], "external_effects": False}
                elif args.action == "proposal-show":
                    result = get_proposal(db, args.proposal)
                elif args.action == "proposal-review":
                    record = review_proposal(db, args.proposal, args.current_run, args.expected_hash, args.reviewer, args.decision)
                    result = record["review"]
                else:
                    result = {"contexts": [], "proposals": []}
                    for table, key, getter in [("study_contexts", "contexts", get_context), ("study_proposals", "proposals", get_proposal)]:
                        for row in db.execute(f"SELECT id FROM {table} ORDER BY rowid DESC LIMIT 100"):
                            record = getter(db, row["id"])
                            result[key].append({"id": record["id"], "sha256": record["sha256"], "repo": record["document"]["base"]["repo"]})
                print(json.dumps(result, ensure_ascii=True, indent=2))
    except (ValueError, PermissionError, OSError) as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

