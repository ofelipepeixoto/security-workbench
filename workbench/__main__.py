"""CLI local, sem serviço de rede."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .core import inspect_snapshot
from .store import authorize, compare, connect, get_run, review, require_scope, save_run


def render_report(run: dict) -> str:
    coverage = "PARCIAL" if run["partial"] else "Limitada aos arquivos suportados"
    lines = [
        f"# Security Workbench — {run['repo']}", "",
        f"Análise: `{run['id']}` · revisão declarada: `{run['revision']}`",
        f"Digest da cópia lida: `{run['digest']}`",
        f"Cobertura: **{coverage}** · {run['files_read']} arquivos / {run['bytes_read']} bytes", "",
        "A revisão declarada não foi confrontada com o GitHub. Ausência de achados não comprova segurança.", "",
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
    allowed.add_argument("--confirm-owned", action="store_true", required=True)
    scan = sub.add_parser("scan", help="Inspecionar uma cópia local")
    scan.add_argument("--repo", required=True)
    scan.add_argument("--snapshot", required=True, type=Path)
    scan.add_argument("--revision", required=True)
    scan.add_argument("--partial", action="store_true", help="Marcar cópia como subconjunto do repositório")
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
        with connect(args.state) as db:
            if args.action == "authorize":
                print(f"Escopo cadastrado: {authorize(db, args.repo)}")
            elif args.action == "scan":
                repo = require_scope(db, args.repo)
                result = inspect_snapshot(args.snapshot, declared_partial=args.partial)
                run_id = save_run(db, repo, args.revision, result)
                print(f"Análise {run_id}: {result['files_read']} arquivos, {len(result['findings'])} candidatos; parcial={result['partial']}")
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
