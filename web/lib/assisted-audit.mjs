/** Method adapted from Cloudflare security-audit-skill, MIT, c1c8a8c….
 * Copyright (c) 2025-2026 Cloudflare, Inc. See ../../third_party/cloudflare-security-audit-skill.LICENSE.
 * Workbench implementation: Copyright (c) 2026 Carlos Felipe, MIT.
 * Pure projections only: no target execution, provider, filesystem or persistence.
 */
import {buildReviewGuidance} from './review-advisor.mjs';
import {parseEvidenceJson} from './rea-import.mjs';

export const ASSISTED_POLICY = 'cloudflare-assisted/1.0';
export const ASSISTED_SCHEMA = 'security-workbench.assisted-notes/v1';
export const ASSISTED_LIMITS = Object.freeze({input_bytes:32768,records:20,text:400,output_bytes:65536});
const SHA=/^[a-f0-9]{40}$/, DIGEST=/^[a-f0-9]{64}$/;
const ID=/^[a-zA-Z0-9_-]{1,64}$/;
const encoder=new TextEncoder();
const keys=(x,names)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const fail=()=>{throw new Error('Notas assistidas inválidas, sem contexto atual ou fora dos limites.');};
const safePath=p=>typeof p==='string'&&p.length<=240&&/^[A-Za-z0-9_./-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').some(x=>!x||x==='.'||x==='..');
const secret=/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{12,})\b|\b(?:password|secret|token|api[_-]?key)\s*[:=]\s*\S+/i;
function prose(s){if(typeof s!=='string'||!s.trim()||s.length>ASSISTED_LIMITS.text||/[\x00-\x1f\x7f]/.test(s)||secret.test(s.replaceAll('[REDACTED]','')))fail();return s;}
function list(x,min=0){if(!Array.isArray(x)||x.length<min||x.length>4)fail();return x.map(prose);}
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');

/** Only existing source-bound static candidates are in scope. Missing/ambiguous
 * references abstain; a planned unit is never a claim of covered source. */
export function buildAssistedAuditPlan(run){
  const empty={schema:'security-workbench.assisted-plan/v1',policy_version:ASSISTED_POLICY,state:'unavailable',coverage:'partial',context:null,units:[],omitted:null,independent_verification:'not_performed'};
  try{
    const guidance=buildReviewGuidance(run);
    if(!['ready','empty'].includes(guidance.state)||guidance.context.revision_state!=='verified'||!ID.test(run.id??'')||!ID.test(run.project_id??'')||!SHA.test(run.revision??'')||!DIGEST.test(run.snapshot_digest??run.digest??'')||!Array.isArray(run.findings)||run.findings.length>100)return empty;
    const units=[];
    for(const item of guidance.items){
      if(item.state!=='supported')continue;
      const f=run.findings.find(x=>x.fingerprint===item.finding_id);
      if(!f||f.review_identity_ambiguous===true||!safePath(f.path)||!Number.isSafeInteger(f.line)||f.line<1||f.line>1000000)continue;
      units.push({coverage_id:'finding:'+item.finding_id,finding_id:item.finding_id,path:f.path,line:f.line,rule_id:item.rule_id,attack_class:f.kind==='possible-secret'?'source-data-handling':'supply-chain-permissions',state:'planned',human_decision:item.decision_status,source_evidence:'existing_redacted_static_candidate'});
    }
    units.sort((a,b)=>a.finding_id.localeCompare(b.finding_id));
    return {...empty,state:'ready',context:{run_id:run.id,project_id:run.project_id,repository_id:run.repository_id,revision:run.revision,snapshot_digest:run.snapshot_digest??run.digest},units,omitted:run.findings.length-units.length};
  }catch{return empty;}
}

/** Selected Workbench notes contract, NOT the complete upstream findings.json.
 * Caller supplies the current authorized run; JSON cannot supply an authority,
 * human decision, severity or verification credential. Offline callers assert
 * their run provenance: this validator cannot authenticate a downloaded file.
 */
export async function validateAssistedAuditNotes(data,run){
  try{
    if(!(data instanceof Uint8Array)||data.length<1||data.length>ASSISTED_LIMITS.input_bytes)fail();
    const frozen=new Uint8Array(data),input=parseEvidenceJson(frozen),plan=buildAssistedAuditPlan(run);
    if(plan.state!=='ready'||!keys(input,['schema','policy_version','context','records'])||input.schema!==ASSISTED_SCHEMA||input.policy_version!==ASSISTED_POLICY||!keys(input.context,Object.keys(plan.context))||Object.keys(plan.context).some(k=>input.context[k]!==plan.context[k])||!Array.isArray(input.records)||input.records.length>ASSISTED_LIMITS.records)fail();
    const records=[],seen=new Set(),fingerprints=new Set();
    for(const r of input.records){
      if(!keys(r,['finding_id','path','line','source_verdict','source_fingerprint','hypothesis','counterevidence','blockers','validation_plan']))fail();
      const unit=plan.units.find(u=>u.finding_id===r.finding_id);
      if(!unit||unit.path!==r.path||unit.line!==r.line||seen.has(r.finding_id)||!['confirmed','needs_validation','rejected'].includes(r.source_verdict)||typeof r.source_fingerprint!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,95}$/.test(r.source_fingerprint)||fingerprints.has(r.source_fingerprint)||secret.test(r.source_fingerprint))fail();
      seen.add(r.finding_id);fingerprints.add(r.source_fingerprint);
      if(!keys(r.validation_plan,['source','local','deployment']))fail();
      const notes={hypothesis:prose(r.hypothesis),counterevidence:list(r.counterevidence,1),blockers:list(r.blockers,r.source_verdict==='needs_validation'?1:0),validation_plan:{source:prose(r.validation_plan.source),local:prose(r.validation_plan.local),deployment:prose(r.validation_plan.deployment)}};
      records.push({finding_id:r.finding_id,path:unit.path,line:unit.line,source_verdict:r.source_verdict,source_fingerprint:r.source_fingerprint,human_decision:unit.human_decision,technical_assessment:'needs_validation',independent_verification:'not_performed',reference_check:'existing_candidate_metadata_only',claim_sha256:await hash(encoder.encode(JSON.stringify(r))),...notes,required_blockers:['source_context_not_independently_verified','independent_verifier_not_run'],review_required:true});
    }
    records.sort((a,b)=>a.finding_id.localeCompare(b.finding_id));
    const output={schema:'security-workbench.assisted-projection/v1',policy_version:ASSISTED_POLICY,context:plan.context,coverage:'partial',records,report_sha256:await hash(frozen),provenance_authenticated:false,actions_performed:[]};
    if(encoder.encode(JSON.stringify(output)).length>ASSISTED_LIMITS.output_bytes)fail();
    return output;
  }catch{fail();}
}

/** Re-derive, never trust a stored/imported audit_plan or note as report prose. */
export function renderAssistedAuditPlanMarkdown(run){
  const plan=buildAssistedAuditPlan(run);
  return ['## Plano de revisão assistida — cobertura parcial','',
    `Política: ${ASSISTED_POLICY}. Metodologia adaptada de Cloudflare security-audit-skill (MIT).`,
    'Este bloco organiza a revisão dos candidatos estáticos existentes; não executa auditoria, modelo, código do alvo ou verificador independente.',
    plan.state==='ready'?`Unidades planejadas: ${plan.units.length}; candidatos fora deste recorte: ${plan.omitted}. Nenhuma unidade foi declarada coberta por este plano.`:'Contexto insuficiente para vincular um plano ao projeto, commit e digest atuais.',
    'Fronteiras a conferir: identidade → projeto; fonte autorizada → parser; observação → hipótese; hipótese → decisão humana.',
    'Para cada referência: conferir o local no mesmo commit; descrever o controle e o resultado alegado; buscar contraprovas; registrar bloqueio exato e plano seguro; obter verificação independente quando disponível.',
    'confirmed da origem é uma declaração do emissor. needs_validation permanece pendente e sem severidade. rejected não altera decisões humanas. Schema válido não comprova execução ou vulnerabilidade.',
    'Preservar false_positive e accepted_risk. Mudanças materiais de fonte/evidência/hipótese exigem nova verificação; ausência numa nova análise não significa correção.',
    'Classes selecionadas: tratamento de dados em fonte e permissões de cadeia de entrega. Outros domínios, validação dinâmica e auditoria geral permanecem fora do recorte.',
    'Uso assistido e exemplos: docs/assisted-audit.md. O prompt portátil de correção permanece separado.',''].join('\n');
}
