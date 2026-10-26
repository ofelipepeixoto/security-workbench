"use client";

import { useId } from "react";

export type AutomaticGuidanceItem = {
  finding_id: string | null;
  evidence_refs: string[];
  rule_id: string | null;
  advisor_rule: string | null;
  state: "supported" | "insufficient_context" | "unsupported";
  priority: "triage-first" | "context-review" | "decision-recorded" | "unavailable";
  priority_reason: string;
  summary: string;
  decision_status: string;
  false_positive_checks: string[];
  actions: string[];
  verification: { instruction: string; expected: string; status: "not_executed" }[];
  uncertainty: string[];
};

export type AutomaticGuidanceData = {
  schema: string;
  policy_version: string;
  method: "deterministic-rules";
  generation: "automatic";
  state: "ready" | "empty" | "insufficient_context" | "unavailable";
  context: {
    source: string;
    revision: string | null;
    revision_state: "verified" | "declared" | "unavailable";
    coverage: "partial" | "limited" | "unknown";
    source_content: "not_available";
  };
  summary: { supported: number; insufficient_context: number; unsupported: number; omitted: number };
  limits: { findings: number; output_bytes?: number };
  items: AutomaticGuidanceItem[];
};

const itemStates = {
  supported: "Orientação por regra disponível",
  insufficient_context: "Contexto insuficiente para uma mudança específica",
  unsupported: "Sem regra de orientação para este candidato",
};
const priorities = {
  "triage-first": "Conferir primeiro",
  "context-review": "Conferir o contexto",
  "decision-recorded": "Preservar a decisão registrada",
  unavailable: "Prioridade não determinada",
};
const decisions: Record<string, string> = {
  candidate: "A revisar",
  confirmed: "Confirmado após revisão",
  false_positive: "Falso positivo",
  accepted_risk: "Risco aceito",
};
const states = {
  ready: "As orientações abaixo foram geradas automaticamente pelas regras disponíveis para esta análise.",
  empty: "Nenhum candidato disponível para orientar nesta análise. A ausência de candidatos não comprova segurança.",
  insufficient_context: "Falta contexto para recomendar uma mudança específica. Confira a evidência, a cobertura e as informações que faltam.",
  unavailable: "A orientação não está disponível para este registro. Confira o resultado e os limites da análise antes de decidir o próximo passo.",
};
const sources: Record<string, string> = { "github-app": "GitHub App", "github-public": "GitHub público", "rea-import": "REA local importado" };

function GuidanceItem({ item, embedded = false }: { item: AutomaticGuidanceItem; embedded?: boolean }) {
  const id = useId();
  const Heading = embedded ? "h4" : "h3";
  return <section className="automatic-guidance-item" aria-labelledby={id}>
    <Heading id={id}>{itemStates[item.state]}</Heading>
    <p>{item.summary}</p>
    <dl className="automatic-guidance-meta">
      <div><dt>Regra da análise</dt><dd><code>{item.rule_id || "Não registrada"}</code></dd></div>
      <div><dt>Regra de orientação</dt><dd><code>{item.advisor_rule || "Não disponível"}</code></dd></div>
      <div><dt>Decisão humana atual</dt><dd>{decisions[item.decision_status] || "Não registrada"}</dd></div>
    </dl>
    <p><strong>{priorities[item.priority]}.</strong> {item.priority_reason} Esta ordem de conferência não é uma medida de severidade.</p>
    <div className="automatic-guidance-evidence"><strong>Referências da evidência</strong>{item.evidence_refs.length ? <ul>{item.evidence_refs.map((reference, index) => <li key={index}><code>{reference}</code></li>)}</ul> : <p>Nenhuma referência suficiente foi registrada. Não há base para propor uma alteração específica.</p>}</div>
    {!embedded && item.finding_id && /^[a-f0-9]{20}$/.test(item.finding_id) && <a className="automatic-guidance-link" href={"#" + item.finding_id}>Conferir evidência do candidato</a>}
    {item.false_positive_checks.length > 0 && <div><strong>Antes de tratar como problema</strong><ul>{item.false_positive_checks.map((check, index) => <li key={index}>{check}</li>)}</ul></div>}
    {item.actions.length > 0 && <div><strong>Próximos passos sugeridos</strong><ol>{item.actions.map((action, index) => <li key={index}>{action}</li>)}</ol></div>}
    {item.verification.length > 0 && <div><strong>Como verificar uma proposta</strong><p>Verificações sugeridas · não executadas pelo orientador.</p><ul>{item.verification.map((check, index) => <li key={index}>{check.instruction}<span className="automatic-guidance-expected">Resultado esperado: {check.expected}</span></li>)}</ul></div>}
    {item.uncertainty.length > 0 && <div className="automatic-guidance-limits"><strong>Contexto e limites que permanecem</strong><ul>{item.uncertainty.map((limit, index) => <li key={index}>{limit}</li>)}</ul></div>}
  </section>;
}

export function AutomaticGuidance({ guidance, findingId }: { guidance?: AutomaticGuidanceData | null; findingId?: string }) {
  const id = useId();
  if (findingId) {
    const item = guidance?.items.find(candidate => candidate.finding_id === findingId);
    return <div className="automatic-guidance automatic-guidance-inline"><p className="automatic-guidance-label">Orientação automática por regras</p>{item ? <GuidanceItem item={item} embedded /> : <p>Não há orientação vinculada a este candidato. Não foi feita uma revisão contextual por modelo.</p>}</div>;
  }
  return <section id="analysis-guidance" className="panel automatic-guidance" aria-labelledby={id}>
    <div className="section-heading"><div><h2 id={id}>Orientação automática</h2><p>Complemento às evidências da análise, gerado sem revisão humana prévia.</p></div><span className="badge">Por regras · sem IA</span></div>
    <div className="automatic-guidance-body">
      <p>{guidance ? states[guidance.state] : states.unavailable}</p>
      <p>Esta orientação por regras não chama modelos de IA. O orientador não aplica correções nem altera decisões humanas. Uma proposta de mudança precisa ser conferida no código autorizado.</p>
      {guidance && <>
        <dl className="automatic-guidance-meta">
          <div><dt>Origem da análise</dt><dd>{sources[guidance.context.source] || "Origem não reconhecida"}</dd></div>
          <div><dt>Política de orientação</dt><dd><code>{guidance.policy_version}</code></dd></div>
          <div><dt>Commit de referência</dt><dd><code>{guidance.context.revision || "Não informado"}</code><span className="automatic-guidance-expected">{guidance.context.revision_state === "verified" ? "Vínculo verificado na aquisição" : guidance.context.revision_state === "declared" ? "Declarado · vínculo não verificado" : "Vínculo não disponível"}</span></dd></div>
          <div><dt>Cobertura</dt><dd>{guidance.context.coverage === "partial" ? "Parcial" : guidance.context.coverage === "limited" ? "Limitada aos formatos suportados" : "Não informada"}</dd></div>
        </dl>
        <p>O orientador usa os resultados normalizados. Não recebeu o conteúdo completo dos arquivos para uma revisão contextual.</p>
        <ul className="automatic-guidance-counts"><li>{guidance.summary.supported} com orientação por regra</li><li>{guidance.summary.insufficient_context} com contexto insuficiente</li><li>{guidance.summary.unsupported} sem regra de orientação</li></ul>
        {guidance.summary.omitted > 0 && <p className="automatic-guidance-limits">{guidance.summary.omitted} candidatos não aparecem neste bloco por limite de orientação. O orientador considera até {guidance.limits.findings} candidatos; isso não significa ausência de outros problemas.</p>}
        {guidance.items.length > 0 && <details className="automatic-guidance-details"><summary>Conferir orientações, evidências e limites por candidato</summary><div>{guidance.items.map((item, index) => <GuidanceItem key={item.finding_id || index} item={item} />)}</div></details>}
      </>}
      <p className="automatic-guidance-model"><strong>Revisão contextual por modelo: camada separada.</strong> Confira seu estado no painel próprio. Uma orientação por regras não comprova execução de modelo nem aprovação dessa integração.</p>
    </div>
  </section>;
}
