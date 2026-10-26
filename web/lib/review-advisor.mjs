/** Automatic, deterministic guidance from an already authorized analysis.
 * No model, network, repository read, command, credential or patch capability.
 * Guidance is derived on read, separately from persisted human decisions.
 */
export const REVIEW_ADVISOR_SCHEMA = 'security-workbench.review-advisor/v1';
export const REVIEW_ADVISOR_POLICY = 'static-guidance/1.0';
export const REVIEW_ADVISOR_LIMITS = Object.freeze({ findings: 100, output_bytes: 192 * 1024 });
const SHA = /^[a-f0-9]{40}$/;
const FINGERPRINT = /^[a-f0-9]{20}$/;
const DECISIONS = new Set(['candidate', 'confirmed', 'false_positive', 'accepted_risk']);
const SOURCES = new Set(['github-public', 'github-app', 'rea-import']);
const encoder = new TextEncoder();
const boundedString = (value, max) => typeof value === 'string' && value.length <= max ? value : null;
function fingerprintOf(finding) {
  const value = boundedString(finding?.fingerprint, 20);
  return value?.length === 20 && FINGERPRINT.test(value) ? value : null;
}

/**
 * @typedef {{instruction:string,expected:string,status:'not_executed'}} GuidanceVerification
 * @typedef {{finding_id:string|null,evidence_refs:string[],rule_id:string|null,advisor_rule:string|null,state:'supported'|'insufficient_context'|'unsupported',priority:'triage-first'|'context-review'|'decision-recorded'|'unavailable',priority_reason:string,summary:string,decision_status:string,false_positive_checks:string[],actions:string[],verification:GuidanceVerification[],uncertainty:string[]}} GuidanceItem
 * @typedef {{schema:string,policy_version:string,method:'deterministic-rules',generation:'automatic',state:'ready'|'empty'|'insufficient_context'|'unavailable',context:{source:string,revision:string|null,revision_state:'verified'|'declared'|'unavailable',coverage:'partial'|'limited'|'unknown',source_content:'not_available'},summary:{supported:number,insufficient_context:number,unsupported:number,omitted:number},limits:{findings:number,output_bytes:number},items:GuidanceItem[]}} ReviewGuidance
 */

const POLICIES = new Map([
  ['possible-secret', {
    rule: 'SWB-TEXT-001/1', advisor: 'SWB-ADVISE-SECRET/1', priority: 'triage-first',
    reason: 'Prioridade de triagem: esclarecer a possível exposição antes de compartilhar o código. Não é severidade nem prova de credencial válida.',
    summary: 'A regra textual registrou uma atribuição com nome associado a segredo. O valor não foi validado e deve permanecer mascarado.',
    falsePositive: [
      'Conferir localmente, em canal protegido, se o valor é um exemplo inerte, fixture ou credencial real; o nome do arquivo não decide isso.',
      'Conferir a linha no SHA registrado e seu uso autorizado. O orientador não recebeu o valor nem os arquivos completos.',
    ],
    actions: [
      'Preservar a redação do valor e restringir seu compartilhamento. Não copiar, testar ou incluir a possível credencial em um prompt ou diff.',
      'Se o titular confirmar um segredo real, preparar a remoção do literal usando um mecanismo de segredos já autorizado e um plano de revogação pelo titular. Nenhuma revogação é executada aqui.',
    ],
    verification: [{
      instruction: 'Para uma mudança proposta, definir um teste local da configuração usando somente valor sintético e o mecanismo já aprovado.',
      expected: 'O teste proposto conserva o comportamento necessário sem literal real no código ou no diff. A verificação ainda não foi executada.', status: 'not_executed',
    }],
    uncertainty: ['Validade, alcance, exposição histórica e uso da possível credencial não foram verificados.'],
  }],
  ['broad-workflow-permissions', {
    rule: 'SWB-WORKFLOW-001/1', advisor: 'SWB-ADVISE-WORKFLOW/1', priority: 'context-review',
    reason: 'Prioridade de revisão de contexto: determinar o alcance e a necessidade das permissões. Não é severidade nem prova de exploração.',
    summary: 'A regra textual registrou permissions: write-all em um caminho de workflow. Isso não comprova o comportamento efetivo do GitHub Actions.',
    falsePositive: [
      'Conferir se a linha representa configuração efetiva ou texto de exemplo no arquivo autorizado.',
      'Conferir gatilhos, jobs e operações necessárias no mesmo SHA; esses contextos não estão disponíveis ao orientador.',
    ],
    actions: [
      'Relacionar as operações de cada job às permissões necessárias antes de propor uma mudança.',
      'Preparar uma proposta mínima de permissões explícitas, sustentada pelo contexto conferido. Não inventar um bloco YAML nem ampliar permissões.',
    ],
    verification: [{
      instruction: 'Definir uma verificação estática local da configuração proposta e casos sintéticos para as operações que precisam continuar permitidas e as que devem ser negadas.',
      expected: 'Os testes propostos justificam cada permissão e preservam os casos negativos. Nenhum workflow é disparado ou considerado aprovado aqui.', status: 'not_executed',
    }],
    uncertainty: ['Gatilhos, comportamento dos jobs, permissões efetivas e explorabilidade não foram verificados.'],
  }],
]);

function contextOf(run) {
  const suppliedSource = boundedString(run?.source, 32), suppliedRevision = boundedString(run?.revision, 40);
  const source = SOURCES.has(suppliedSource) ? suppliedSource : 'unknown';
  const revision = suppliedRevision?.length === 40 && SHA.test(suppliedRevision) ? suppliedRevision : null;
  return { source, revision,
    revision_state: revision ? run.verified_revision === true && ['github-public', 'github-app'].includes(source) && Number.isSafeInteger(run.repository_id) && run.repository_id > 0 ? 'verified' : 'declared' : 'unavailable',
    coverage: run?.partial === true ? 'partial' : run?.partial === false ? 'limited' : 'unknown', source_content: 'not_available' };
}

function base(context) {
  return { schema: REVIEW_ADVISOR_SCHEMA, policy_version: REVIEW_ADVISOR_POLICY, method: 'deterministic-rules', generation: 'automatic', state: 'unavailable', context,
    summary: { supported: 0, insufficient_context: 0, unsupported: 0, omitted: 0 }, limits: { ...REVIEW_ADVISOR_LIMITS }, items: [] };
}

function validLocation(finding) {
  return typeof finding?.path === 'string' && finding.path.length > 0 && finding.path.length <= 1024 && !/[\\\x00-\x1f\x7f-\x9f]/.test(finding.path) && !finding.path.split('/').some(part => !part || part === '.' || part === '..') && Number.isSafeInteger(finding.line) && finding.line > 0;
}

function fallback(findingId, decision, policy, state, reason) {
  return { finding_id: findingId, evidence_refs: findingId ? [`finding:${findingId}`] : [], rule_id: null, advisor_rule: policy?.advisor ?? null, state, priority: 'unavailable', priority_reason: 'Não há base suficiente para priorizar uma correção por esta política.', summary: reason, decision_status: decision,
    false_positive_checks: [], actions: ['Conferir a regra, o local e a origem da evidência autorizada antes de propor uma correção.'], verification: [], uncertainty: ['Sem leitura adicional, execução de testes, correlação de CVEs ou confirmação de vulnerabilidade.'] };
}

/** @param {unknown} input @returns {ReviewGuidance} */
export function buildReviewGuidance(input) {
  // Treat imported/cached values only as data. Fixed policy texts never execute
  // or interpolate instructions, code, evidence bodies, paths or secret values.
  try {
    const run = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
    const context = contextOf(run), result = base(context);
    if (!run || run.status !== 'complete' || !Array.isArray(run.findings)) return result;
    const items = run.findings.slice(0, REVIEW_ADVISOR_LIMITS.findings);
    result.summary.omitted = Math.max(0, run.findings.length - items.length);
    const identities = new Map();
    for (const finding of items) {
      const id = fingerprintOf(finding);
      if (id) identities.set(id, (identities.get(id) ?? 0) + 1);
    }
    let bytes = 2048; // Includes the envelope, counters and bounded context.
    for (const finding of items) {
      const candidateId = fingerprintOf(finding), suppliedDecision = boundedString(finding?.status, 32);
      const id = candidateId && identities.get(candidateId) === 1 ? candidateId : null;
      const decision = DECISIONS.has(suppliedDecision) ? suppliedDecision : 'unavailable';
      const policy = POLICIES.get(boundedString(finding?.kind, 64));
      let item;
      if (!id) item = fallback(null, decision, policy, 'insufficient_context', 'O candidato não tem uma referência única reconhecida nesta análise.');
      else if (!policy || context.source === 'rea-import') item = fallback(id, decision, null, 'unsupported', 'Esta política cobre somente as duas regras textuais nativas. Observações REA e regras desconhecidas não recebem uma correção presumida.');
      else if (finding.rule_id && finding.rule_id !== policy.rule) item = fallback(id, decision, null, 'unsupported', 'A versão da regra registrada não é suportada por esta política de orientação.');
      else if (!finding.rule_id || !validLocation(finding) || (policy.rule === 'SWB-WORKFLOW-001/1' && !finding.path.startsWith('.github/workflows/')) || decision === 'unavailable' || context.revision_state !== 'verified' || context.coverage === 'unknown') item = fallback(id, decision, policy, 'insufficient_context', 'Faltam metadados verificados de regra, local, commit, cobertura ou decisão para orientar este candidato.');
      else {
        const recorded = ['false_positive', 'accepted_risk'].includes(decision);
        item = { finding_id: id, evidence_refs: [`finding:${id}`], rule_id: policy.rule, advisor_rule: policy.advisor, state: 'supported', priority: recorded ? 'decision-recorded' : policy.priority,
          priority_reason: recorded ? 'Preservar a decisão humana registrada; a orientação automática não reclassifica o candidato nem autoriza uma alteração.' : policy.reason,
          summary: policy.summary, decision_status: decision,
          false_positive_checks: [...policy.falsePositive],
          actions: recorded ? [decision === 'false_positive' ? 'Preservar o falso positivo registrado. Uma nova proposta depende de contexto ou evidência nova e de decisão explícita do titular.' : 'Preservar a aceitação de risco registrada. Antes de propor aplicação de mudança, obter uma nova decisão explícita do titular.'] : [...policy.actions],
          verification: policy.verification.map(check => ({ ...check })),
          uncertainty: [...policy.uncertainty, 'A orientação usa metadados da análise e não leu o conteúdo-fonte completo. Referências finding identificam o candidato existente, não evidência nova.'],
        };
      }
      const size = encoder.encode(JSON.stringify(item)).byteLength + 1;
      if (bytes + size > REVIEW_ADVISOR_LIMITS.output_bytes) { result.summary.omitted++; continue; }
      bytes += size; result.items.push(item); result.summary[item.state]++;
    }
    result.state = result.summary.supported ? 'ready' : items.length === 0 && context.revision_state === 'verified' ? 'empty' : 'insufficient_context';
    if (encoder.encode(JSON.stringify(result)).byteLength > REVIEW_ADVISOR_LIMITS.output_bytes) return base(context);
    return result;
  } catch { return base(contextOf(null)); }
}

/** Render only the derived, bounded projection; never trust stored guidance.
 * All variable fields below are enum values or validated SHA/fingerprint IDs. */
export function renderReviewGuidanceMarkdown(run) {
  const guidance = buildReviewGuidance(run);
  const states = { ready: 'Orientações disponíveis', empty: 'Nenhum candidato registrado para orientar; isso não comprova segurança.', insufficient_context: 'Contexto insuficiente ou regra não suportada.', unavailable: 'Orientação indisponível: análise concluída e candidatos não estão disponíveis.' };
  const lines = ['## Orientação automática por regras', '',
    `Contrato: ${guidance.schema} · política: ${guidance.policy_version} · método: ${guidance.method}.`,
    'A orientação é gerada automaticamente, sem revisão humana prévia. Nenhum modelo de IA foi chamado. Ela não confirma candidatos, não altera decisões e não aplica patches.',
    'Revisão contextual por modelo: não executada. Não faz parte desta orientação por regras.',
    states[guidance.state], '',
    `Origem: ${guidance.context.source} · commit: ${guidance.context.revision ?? 'indisponível'} (${guidance.context.revision_state}) · cobertura: ${guidance.context.coverage}. Conteúdo-fonte completo indisponível ao orientador.`,
    `Suportadas: ${guidance.summary.supported}; contexto insuficiente: ${guidance.summary.insufficient_context}; não suportadas: ${guidance.summary.unsupported}; omitidas pelo limite: ${guidance.summary.omitted}.`, ''];
  let bytes = encoder.encode(lines.join('\n')).byteLength, omitted = 0;
  for (const item of guidance.items) {
    const block = [`### Orientação do candidato ${item.finding_id ?? 'sem referência válida'}`, '',
      `Referências: ${item.evidence_refs.join(', ') || 'indisponíveis'} · regra: ${item.rule_id ?? 'não registrada ou não suportada'} · política aplicada: ${item.advisor_rule ?? 'nenhuma'}.`,
      `Estado: ${item.state} · prioridade de triagem: ${item.priority} · decisão humana preservada: ${item.decision_status}.`, item.priority_reason, '', item.summary, ''];
    if (item.false_positive_checks.length) block.push('Possível falso positivo — verificações propostas:', ...item.false_positive_checks.map(text => `- ${text}`), '');
    block.push('Ações orientadas:', ...item.actions.map(text => `- ${text}`), '');
    for (const check of item.verification) block.push(`- Verificação proposta (não executada): ${check.instruction}`, `  Resultado esperado, ainda não comprovado: ${check.expected}`);
    block.push(...item.uncertainty.map(text => `- Limite: ${text}`), '');
    const size = encoder.encode(block.join('\n')).byteLength + 1;
    if (bytes + size + 256 > REVIEW_ADVISOR_LIMITS.output_bytes) { omitted++; continue; }
    bytes += size; lines.push(...block);
  }
  if (omitted) lines.push(`Limite da exportação: ${omitted} orientações não foram incluídas neste Markdown. A lista acima não é completa.`, '');
  return lines.join('\n');
}
