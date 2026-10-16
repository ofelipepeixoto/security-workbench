"""Original offline control plan; no SQL parser, network client or executor."""
from __future__ import annotations

import hashlib
import json

from .changes import create_context, get_context

PROFILE = "radar-supabase-controls/v1"
UPSTREAM = "https://github.com/dmanske/auditoria-seguranca-supabase/tree/5542c72a933a4c9ebfccb07f5c48f591d1cbd387"
# Original summaries and test designs, not copied SQL or production policy mutations.
CONTROLS = (
    ("grants-rls", "Grants e RLS", "anon, usuário A, usuário B, administrador", "SELECT/INSERT/UPDATE/DELETE por recurso; testar troca de proprietário e composição de policies."),
    ("tenant-isolation", "Isolamento por organização", "membro A, membro B, removido", "IDs cruzados, ausência de associação e associação revogada com dados fictícios."),
    ("rpc-acl", "RPC e SECURITY DEFINER", "anon, usuário sem permissão, autorizado", "Revisar EXECUTE, identidade nula, search_path e recursos acessados antes de testar."),
    ("storage", "Storage", "anon, membro, outra organização", "Listar, baixar, enviar e excluir por bucket/caminho autorizado em fixture descartável."),
    ("edge-auth", "Edge Functions e efeitos", "sem token, token inválido, autorizado", "Verificar identidade e autorização; mockar pagamento, mensagens e todos os efeitos externos."),
    ("keys", "Chaves e logs", "visitante, operador", "Chave publishable não é login; verificar ausência de chave secreta no cliente e logs sem valores."),
    ("sessions", "Revogação e links", "sessão ativa, revogada, link expirado", "Testar consumidor, expiração e session_id quando exigido; logout não invalida instantaneamente todo JWT."),
    ("views", "Views e permissões", "visitante, membro, administrador", "Conferir security_invoker, grants e RLS das tabelas subjacentes por perfil."),
)
CATALOG_HASH = hashlib.sha256(json.dumps(CONTROLS, ensure_ascii=True, separators=(",", ":")).encode()).hexdigest()
TASK = f"{PROFILE}; catalog_sha256={CATALOG_HASH}; planejamento offline por perfil; sem autorização de execução"


def render_plan(context: dict) -> dict:
    document = context["document"]
    if document["task"] != TASK:
        raise ValueError("Contexto não pertence à versão deste catálogo Supabase.")
    return {
        "schema_version": 1, "profile": PROFILE, "catalog_sha256": CATALOG_HASH,
        "source_reference": UPSTREAM, "context_id": context["id"], "context_sha256": context["sha256"],
        "base": document["base"], "selected_files": document["files"],
        "authorization_to_execute": False, "overall_status": "not_validated",
        "limitations": ["Planejamento, sem inferir vulnerabilidade ou proteção do SQL.",
                        "Evidências reais e testes de RLS por produto permanecem pendentes.",
                        "Identidade local declarada não equivale a identidade verificada no GitHub."],
        "controls": [{"id": cid, "title": title, "roles": roles, "test_design": test,
                      "status": "not_validated", "observed_evidence": []}
                     for cid, title, roles, test in CONTROLS],
    }


def create_plan(db, run_id: str, paths: list[str]) -> dict:
    return render_plan(create_context(db, run_id, paths, TASK))


def recover_plan(db, context_id: str) -> dict:
    return render_plan(get_context(db, context_id))
