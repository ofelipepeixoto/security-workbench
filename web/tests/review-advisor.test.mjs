import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReviewGuidance, renderReviewGuidanceMarkdown, REVIEW_ADVISOR_SCHEMA, REVIEW_ADVISOR_POLICY, REVIEW_ADVISOR_LIMITS } from '../lib/review-advisor.mjs';
import { renderReport } from '../lib/scanner.mjs';
import { handleWorkbenchRequest } from '../lib/workbench-service.mjs';
import { migratedDatabase } from './helpers/d1-sqlite.mjs';

const SHA='a'.repeat(40), FP='1'.repeat(20);
function finding(patch={}) { return {fingerprint:FP,kind:'possible-secret',rule_id:'SWB-TEXT-001/1',path:'src/config.js',line:3,status:'candidate',confidence:'medium',evidence:'Atribuição a secret com valor [REDACTED].',impact:'Impacto potencial, não verificado.',recommendation:'Conferir o contexto.',...patch}; }
function run(patch={}) { return {id:crypto.randomUUID(),repo:'fixture-owner/synthetic-app',repository_id:123,revision:SHA,status:'complete',verified_revision:true,source:'github-app',partial:true,files_read:1,bytes_read:24,findings:[finding()],dependencies:[],...patch}; }

test('automatic guidance is deterministic, versioned, traceable and does not mutate candidates or introduce an inferred severity',()=>{
  const input=run(), before=structuredClone(input), first=buildReviewGuidance(input), second=buildReviewGuidance(input);
  assert.deepEqual(first,second); assert.deepEqual(input,before);
  assert.equal(first.schema,REVIEW_ADVISOR_SCHEMA); assert.equal(first.policy_version,REVIEW_ADVISOR_POLICY);
  assert.equal(first.method,'deterministic-rules'); assert.equal(first.generation,'automatic'); assert.equal(first.state,'ready');
  const item=first.items[0]; assert.equal(item.finding_id,FP); assert.deepEqual(item.evidence_refs,['finding:'+FP]);
  assert.equal(item.rule_id,'SWB-TEXT-001/1'); assert.equal(item.advisor_rule,'SWB-ADVISE-SECRET/1'); assert.equal(item.priority,'triage-first');
  assert.equal(item.decision_status,'candidate'); assert.equal(first.context.source_content,'not_available'); assert.equal(first.context.revision_state,'verified');
  assert.ok(item.false_positive_checks.length); assert.ok(item.actions.length); assert.ok(item.verification.every(check=>check.status==='not_executed'));
  assert.equal('severity' in item,false); assert.equal('exploitability' in item,false); assert.equal('patch' in item,false);
  first.items[0].actions[0]='mutated client projection'; assert.notEqual(buildReviewGuidance(input).items[0].actions[0],'mutated client projection');
});

test('each supported textual rule supplies specific uncertainty, action and verification without inventing source context',()=>{
  const input=run({findings:[finding(),finding({fingerprint:'2'.repeat(20),kind:'broad-workflow-permissions',rule_id:'SWB-WORKFLOW-001/1',path:'.github/workflows/ci.yml',line:5})]});
  const value=buildReviewGuidance(input); assert.equal(value.summary.supported,2);
  assert.equal(value.items[1].advisor_rule,'SWB-ADVISE-WORKFLOW/1'); assert.equal(value.items[1].priority,'context-review');
  assert.match(value.items[1].false_positive_checks.join(' '),/gatilhos, jobs/);
  assert.match(value.items[1].actions.join(' '),/Não inventar um bloco YAML/);
  assert.match(value.items[0].actions.join(' '),/Não copiar, testar/);
  assert.match(value.items[0].uncertainty.join(' '),/não foram verificados/);
  assert.match(value.items[1].uncertainty.join(' '),/explorabilidade não foram verificados/);
});

test('all human decisions are preserved and recorded false positive or risk acceptance does not request an automatic correction',()=>{
  for(const decision of ['candidate','confirmed','false_positive','accepted_risk']) {
    const input=run({findings:[finding({status:decision})]}), before=structuredClone(input), item=buildReviewGuidance(input).items[0];
    assert.equal(item.decision_status,decision); assert.deepEqual(input,before);
    if(['false_positive','accepted_risk'].includes(decision)) {
      assert.equal(item.priority,'decision-recorded'); assert.match(item.actions.join(' '),/Preservar/); assert.match(item.actions.join(' '),/decisão explícita/);
    } else assert.equal(item.priority,'triage-first');
  }
});

test('unknown rules and REA remain unsupported while missing commit/rule/location/decision metadata stays insufficient',()=>{
  for(const patch of [{kind:'unknown-structure'}, {kind:'possible-secret',rule_id:'SWB-TEXT-001/999'}]) {
    const item=buildReviewGuidance(run({findings:[finding(patch)]})).items[0]; assert.equal(item.state,'unsupported'); assert.equal(item.rule_id,null);
  }
  assert.equal(buildReviewGuidance(run({source:'rea-import',verified_revision:false})).items[0].state,'unsupported');
  for(const patch of [{revision:null},{source:'unknown'},{verified_revision:false},{repository_id:0},{partial:undefined}]) assert.equal(buildReviewGuidance(run(patch)).items[0].state,'insufficient_context');
  for(const patch of [{rule_id:undefined},{path:'../outside.js'},{line:0},{status:'automatically-confirmed'}]) assert.equal(buildReviewGuidance(run({findings:[finding(patch)]})).items[0].state,'insufficient_context');
  const duplicate=buildReviewGuidance(run({findings:[finding(),finding()]})); assert.equal(duplicate.summary.insufficient_context,2); assert.ok(duplicate.items.every(item=>item.finding_id===null && item.evidence_refs.length===0));
});

test('failed or malformed records never become an empty successful advisory and zero candidates never imply safety',()=>{
  for(const input of [null,{},run({status:'failed'}),run({status:'running'}),run({findings:null}),new Proxy({},{get(){throw new Error('synthetic failure');}})]) assert.equal(buildReviewGuidance(input).state,'unavailable');
  const empty=run({findings:[]}); assert.equal(buildReviewGuidance(empty).state,'empty'); assert.match(renderReviewGuidanceMarkdown(empty),/isso não comprova segurança/);
});

test('untrusted instructions, raw evidence, source paths, values and poisoned stored guidance cannot enter the advisor projection',()=>{
  const hostile='SYNTHETIC_UNTRUSTED_INSTRUCTION\n```\n[open](https://invalid.example) <script>do-not-run</script>';
  const input=run({repo:hostile,guidance:{items:[{actions:[hostile]}]},findings:[finding({path:'src/ordinary.js',evidence:hostile,impact:hostile,recommendation:hostile}),finding({fingerprint:'2'.repeat(20),kind:hostile,rule_id:hostile,path:hostile})]});
  const value=JSON.stringify(buildReviewGuidance(input)), markdown=renderReviewGuidanceMarkdown(input);
  for(const output of [value,markdown]) { assert.doesNotMatch(output,/SYNTHETIC_UNTRUSTED|<script>|\[open\]\(https:|```|src\/ordinary/); }
  assert.equal(buildReviewGuidance(input).items[1].state,'unsupported');
});

test('input work, JSON and Markdown are bounded for maximum supported/fallback cases and oversized untrusted fields',()=>{
  for(const mode of ['mixed','secret','workflow','fallback']) {
    const findings=Array.from({length:100},(_,index)=>finding({fingerprint:index.toString(16).padStart(20,'0'),...(mode==='workflow'||(mode==='mixed'&&index%2)?{kind:'broad-workflow-permissions',rule_id:'SWB-WORKFLOW-001/1',path:'.github/workflows/ci.yml'}:{}),...(mode==='fallback'?{kind:'unsupported'}:{}),evidence:'x'.repeat(20000)}));
    const input=run({findings}), value=buildReviewGuidance(input);
    assert.ok(value.items.length<=100); assert.equal(value.items.length+value.summary.omitted,100);
    assert.ok(Buffer.byteLength(JSON.stringify(value))<=REVIEW_ADVISOR_LIMITS.output_bytes);
    assert.ok(Buffer.byteLength(renderReviewGuidanceMarkdown(input))<=REVIEW_ADVISOR_LIMITS.output_bytes);
  }
  const findings=Array(100000); for(let index=0;index<100;index++)findings[index]=finding({fingerprint:index.toString(16).padStart(20,'0')});
  Object.defineProperty(findings,100,{get(){throw new Error('must not traverse beyond admitted findings');}});
  const value=buildReviewGuidance(run({findings})); assert.notEqual(value.state,'unavailable'); assert.ok(value.summary.omitted>=99900);
});

test('the real report contains automatic guidance with the same current decisions and proposed tests, without adding executable fences',()=>{
  const input=run({findings:[finding({status:'false_positive'})]}), before=structuredClone(input), markdown=renderReport(input);
  assert.ok(markdown.includes(renderReviewGuidanceMarkdown(input))); assert.ok(markdown.includes(REVIEW_ADVISOR_POLICY)); assert.match(markdown,/decision-recorded/);
  assert.match(markdown,/gerada automaticamente, sem revisão humana prévia/); assert.match(markdown,/Nenhum modelo de IA foi chamado/); assert.match(markdown,/Verificação proposta \(não executada\)/);
  assert.equal(markdown.split('```').length-1,2); assert.deepEqual(input,before);
});

test('authorized run/review/report endpoints derive current guidance without persisting it, enqueueing work, additional providers or cross-user data',async t=>{
  const db=migratedDatabase(); t.after(()=>db.close());
  const directory=await mkdtemp(join(tmpdir(),'workbench-guidance-')); t.after(()=>rm(directory,{recursive:true,force:true}));
  const user={userId:'synthetic-owner',githubId:'11',provider:'github',role:'admin',csrfToken:'c'.repeat(43)};
  const member={userId:'github:22',githubId:'22',provider:'github',role:'member',csrfToken:'m'.repeat(43)};
  const policy={enabled:true,origin:'https://synthetic.invalid',clientId:'inert_client',clientSecret:'inert_secret',githubOwnerId:'11',workbenchOwnerId:user.userId,multiUserEnabled:true,allowedGitHubIds:['22']};
  const projectId=crypto.randomUUID(),runId=crypto.randomUUID(),stamp='2026-10-26T00:00:00Z',input=run();
  db.sql.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at,source,installation_id,visibility) VALUES (?,?,?,?,?,'github-app',?,'private')").run(projectId,user.userId,input.repo,input.repository_id,stamp,7);
  const stored=JSON.stringify(input);
  db.sql.prepare("INSERT INTO workbench_runs (id,owner_id,project_id,repo,repository_id,request_id,revision,status,result_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'complete',?,?,?)").run(runId,user.userId,projectId,input.repo,input.repository_id,crypto.randomUUID(),SHA,stored,stamp,stamp);
  let accessChecks=0;
  const dependencies={getDb:()=>db,authorizedOwnerId:user.userId,accessPolicy:policy,githubApp:{enabled:true,getClient:async()=>({checkRepositoryAccess:async()=>{accessChecks++;return {repository:{id:input.repository_id}};}})}};
  const request=async (actor,action,extra={})=>{
    const response=await handleWorkbenchRequest(new Request(policy.origin+'/api/workbench',{method:'POST',headers:{Origin:policy.origin,'Content-Type':'application/json','X-Workbench-CSRF':actor.csrfToken},body:JSON.stringify({action,runId,...extra})}),{...dependencies,getUser:async()=>actor});
    return {status:response.status,body:await response.json()};
  };
  const opened=await request(user,'run'); assert.equal(opened.status,200); assert.equal(opened.body.run.guidance.state,'ready'); assert.equal(accessChecks,1);
  const reviewed=await request(user,'review',{fingerprint:FP,decision:'false_positive'}); assert.equal(reviewed.status,200); assert.equal(reviewed.body.run.guidance.items[0].decision_status,'false_positive'); assert.equal(reviewed.body.run.guidance.items[0].priority,'decision-recorded'); assert.equal(accessChecks,2);
  const exported=await request(user,'report'); assert.equal(exported.status,200); assert.equal(accessChecks,3); assert.match(exported.body.markdown,/decision-recorded/); assert.match(exported.body.markdown,/decisão humana preservada: false_positive/);
  const filename=join(directory,exported.body.filename); await writeFile(filename,exported.body.markdown); assert.equal(await readFile(filename,'utf8'),exported.body.markdown);
  for(const action of ['run','report','review']) { const denied=await request(member,action,{fingerprint:FP,decision:'confirmed'}); assert.equal(denied.status,404); assert.equal(JSON.stringify(denied.body).includes(FP),false); }
  assert.equal(accessChecks,3); assert.equal(db.sql.prepare('SELECT result_json FROM workbench_runs WHERE id=?').get(runId).result_json,stored);
  assert.equal(db.sql.prepare('SELECT decision FROM workbench_reviews WHERE run_id=?').get(runId).decision,'false_positive');
  for(const table of ['workbench_analysis_jobs','workbench_qa_window','workbench_qa_reservations'])assert.equal(db.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
});
