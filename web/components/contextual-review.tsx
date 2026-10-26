"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createContextualReviewRequestScope, loadContextualReview } from "../lib/contextual-review-request.mjs";

export type ContextualReviewData = {
  schema: "security-workbench.contextual-review/v1"; method: "model-contextual";
  state: "disabled" | "not_started" | "pending" | "ready" | "insufficient_context" | "unknown" | "unavailable" | "deleted";
  generation?: "automatic"; policy_version?: string; revision?: string | null; review_id?: string; model?: string; generated_at?: string; expires_at?: string;
  items?: { finding_id: string; decision_status: string; hypothesis: string; counterpoint: string; limitations: string[]; recommendations: string[]; proposed_tests: string[]; citations: { finding_id: string; excerpt_id: string; revision: string }[] }[];
  limitations?: string[];
  context_manifest?: { excerpt_id: string; path: string; start_line: number; end_line: number; revision: string; finding_ids: string[]; source_projection: string; blob_sha?: string }[];
  metrics?: { duration_ms?: number; input_tokens?: number; output_tokens?: number; input_bytes?: number; output_bytes?: number; reserved_micro_usd?: number; settled_micro_usd?: number };
};
export type ContextualReviewEnvelope = { contextual_review: ContextualReviewData; generation_allowed: boolean };
type Transport = (input: { method: "GET" | "POST"; signal: AbortSignal }) => Promise<ContextualReviewEnvelope>;

const states = {
  disabled: "IA contextual desligada neste ambiente",
  not_started: "Geração automática aguardando início autorizado",
  pending: "Revisão contextual em processamento",
  ready: "Orientação contextual disponível",
  insufficient_context: "Contexto insuficiente para orientação específica",
  unknown: "Resultado da chamada ainda não confirmado",
  unavailable: "Revisão contextual indisponível",
  deleted: "Conteúdo da revisão contextual excluído ou expirado",
};
const decisions: Record<string, string> = { candidate: "Candidato", confirmed: "Confirmado por revisão humana", false_positive: "Falso positivo", accepted_risk: "Risco aceito" };
function displayTime(value?: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC" : "Não informado";
}

export function ContextualReview({ review, loading = false, error = "", onRefresh }: { review?: ContextualReviewData | null; loading?: boolean; error?: string; onRefresh?: () => void }) {
  const headingId = useId();
  const state = review?.state || "unavailable";
  const ready = state === "ready";
  return <section className="panel automatic-guidance contextual-review" aria-labelledby={headingId}>
    <div className="section-heading"><div><h2 id={headingId}>Revisão contextual com IA</h2><p>Camada separada do scanner e da orientação por regras.</p></div><span className="badge">{ready ? "Por modelo" : "Estado próprio"}</span></div>
    <div className="automatic-guidance-body">
      <p role="status">{loading ? "Conferindo estado autorizado da revisão contextual…" : states[state] || states.unavailable}</p>
      {error && <div className="notice error" role="alert">Não foi possível confirmar o estado da revisão contextual. Nenhuma repetição automática de geração será feita. Consulte novamente o estado antes de outra tentativa.</div>}
      {state === "disabled" && !loading && <p>O padrão é orçamento zero e chamadas bloqueadas. A integração só pode gerar orientação depois da aprovação específica do projeto, modelo, dados e orçamento. Esta tela não configura credenciais nem ativa chamadas pagas.</p>}
      {state === "pending" && <p>O servidor já registrou a tentativa. Abrir esta análise novamente permite consultar o estado sem solicitar uma segunda geração.</p>}
      {state === "not_started" && <p>Quando a configuração e o contexto forem autorizados pelo servidor, a orientação será gerada automaticamente, sem aprovação humana de cada geração.</p>}
      {state === "unknown" && <p>A chamada pode ter consumido o orçamento reservado. Não será repetida automaticamente nem tratada como falha sem custo. A reserva permanece sujeita à reconciliação protegida.</p>}
      {state === "insufficient_context" && <p>Não há evidência suficiente para uma recomendação específica. O sistema não inventa arquivos, localizações ou vulnerabilidades para preencher essa lacuna.</p>}
      {state === "unavailable" && <p>Falha ou bloqueio da revisão contextual não significa ausência de problemas no repositório. As evidências e decisões existentes continuam separadas deste estado.</p>}
      {state === "deleted" && <p>O texto gerado não está disponível. A exclusão ou expiração não confirma exclusão de registros financeiros nem altera as decisões humanas.</p>}
      {onRefresh && !loading && (error || ["pending", "unknown", "unavailable"].includes(state)) && <button className="button secondary" type="button" onClick={onRefresh}>Atualizar estado sem solicitar nova geração</button>}
      <p>A IA propõe hipóteses e verificações. Não confirma vulnerabilidades, muda decisões registradas, executa o repositório ou aplica/publica correções.</p>
      {review && state !== "disabled" && <dl className="automatic-guidance-meta">
        <div><dt>Commit de referência</dt><dd><code>{review.revision || "Não informado"}</code></dd></div>
        <div><dt>Modelo</dt><dd><code>{review.model || "Não informado"}</code></dd></div>
        <div><dt>Política contextual</dt><dd><code>{review.policy_version || "Não informada"}</code></dd></div>
        {review.generated_at && <div><dt>Geração</dt><dd>{displayTime(review.generated_at)}</dd></div>}
        {review.expires_at && <div><dt>Disponibilidade do texto no Workbench</dt><dd>Até {displayTime(review.expires_at)}</dd></div>}
      </dl>}
      {ready && review?.items?.length === 0 && <p>Nenhuma orientação específica disponível neste resultado. Isso não comprova segurança nem substitui revisão das evidências.</p>}
      {ready && review?.items && review.items.length > 0 && <div className="contextual-review-items">{review.items.map((item, index) => <section className="automatic-guidance-item" key={item.finding_id + ":" + index}>
        <h3>Orientação do candidato <code>{item.finding_id}</code></h3>
        <p>Decisão humana preservada: <strong>{decisions[item.decision_status] || "Não reconhecida · conferir registro"}</strong></p>
        <p><strong>Hipótese:</strong> {item.hypothesis}</p><p><strong>Contraponto ou possível falso positivo:</strong> {item.counterpoint}</p>
        <div><strong>Referências do contexto autorizado</strong>{item.citations.length ? <ul>{item.citations.map((citation, citationIndex) => {
          const location = review.context_manifest?.find(entry => entry.excerpt_id === citation.excerpt_id && entry.revision === citation.revision && entry.revision === review.revision && entry.finding_ids.includes(citation.finding_id) && Number.isSafeInteger(entry.start_line) && entry.start_line > 0 && Number.isSafeInteger(entry.end_line) && entry.end_line >= entry.start_line);
          return <li key={citationIndex}><code>{citation.finding_id}</code> · trecho <code>{citation.excerpt_id}</code> · commit <code>{citation.revision}</code>{location ? <><span className="automatic-guidance-expected">Localização: <code>{location.path}</code> · linhas {location.start_line}–{location.end_line}</span>{location.blob_sha && <span className="automatic-guidance-expected">Blob de referência: <code>{location.blob_sha}</code></span>}</> : <span className="automatic-guidance-expected">Localização não disponível neste registro; confira a evidência antes de uma proposta.</span>}</li>;
        })}</ul> : <p>Não há citação verificável; nenhuma alteração específica deve ser inferida deste texto.</p>}</div>
        {/^[a-f0-9]{20}$/.test(item.finding_id) && <a className="automatic-guidance-link" href={"#" + item.finding_id}>Conferir evidência do candidato</a>}
        {item.recommendations.length > 0 && <div><strong>Recomendações propostas</strong><ul>{item.recommendations.map((value, i) => <li key={i}>{value}</li>)}</ul></div>}
        {item.proposed_tests.length > 0 && <div><strong>Testes propostos · não executados pelo modelo</strong><ul>{item.proposed_tests.map((value, i) => <li key={i}>{value}</li>)}</ul></div>}
        {item.limitations.length > 0 && <div><strong>Limitações</strong><ul>{item.limitations.map((value, i) => <li key={i}>{value}</li>)}</ul></div>}
      </section>)}</div>}
      {review?.limitations && review.limitations.length > 0 && <div className="automatic-guidance-limits"><strong>Limites desta revisão</strong><ul>{review.limitations.map((value, index) => <li key={index}>{value}</li>)}</ul></div>}
      <p>Somente o contexto mínimo autorizado do commit pode ser enviado. Código e instruções do repositório são tratados como dados não confiáveis. O provedor tem política própria de retenção; o prazo acima limita a disponibilidade do texto no Workbench e não comprova exclusão física imediata. A remoção segue o procedimento aprovado, sem apagar evidências ou registros financeiros por esta tela.</p>
    </div>
  </section>;
}

export function ContextualReviewController({ runId, revision, transport, sessionUnavailable, captureAccess, onUnauthorized }: { runId: string; revision?: string | null; transport: Transport; sessionUnavailable: boolean; captureAccess?: () => () => boolean; onUnauthorized: (cause: unknown) => void }) {
  const [review, setReview] = useState<ContextualReviewData | null>(null), [loading, setLoading] = useState(!sessionUnavailable), [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const context = { runId, revision, transport, captureAccess, sessionUnavailable };
  const [dataContext, setDataContext] = useState(context);
  const attempts = useRef(new Set<string>());
  const same = dataContext.runId === runId && dataContext.revision === revision && dataContext.transport === transport && dataContext.captureAccess === captureAccess && dataContext.sessionUnavailable === sessionUnavailable;
  useEffect(() => {
    const scope = createContextualReviewRequestScope(captureAccess); scope.open();
    const request = scope.begin();
    void (async () => {
      await Promise.resolve();
      if (!request.isCurrent()) return;
      setDataContext({ runId, revision, transport, captureAccess, sessionUnavailable }); setReview(null); setError(""); setLoading(!sessionUnavailable);
      if (sessionUnavailable || !runId) return;
      const key = runId + ":" + (revision || "");
      await loadContextualReview(request, {
        read: (signal: AbortSignal) => transport({ method: "GET", signal }), generate: (signal: AbortSignal) => transport({ method: "POST", signal }),
        claimGeneration() { if (attempts.current.has(key)) return false; attempts.current.add(key); return true; },
        apply(value: ContextualReviewData) { setReview(value); },
        failure(cause: unknown) { setError("unconfirmed"); onUnauthorized(cause); },
      });
      if (request.isCurrent()) setLoading(false);
    })().finally(request.finish);
    return () => scope.close();
  }, [runId, revision, transport, sessionUnavailable, captureAccess, onUnauthorized, refresh]);
  return <ContextualReview review={same && !sessionUnavailable ? review : null} loading={!sessionUnavailable && (!same || loading)} error={same && !sessionUnavailable ? error : ""} onRefresh={() => setRefresh(value => value + 1)} />;
}
