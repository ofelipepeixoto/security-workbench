import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAssistedAuditPlan,validateAssistedAuditNotes,renderAssistedAuditPlanMarkdown,ASSISTED_POLICY,ASSISTED_LIMITS} from '../lib/assisted-audit.mjs';
import {renderReport} from '../lib/scanner.mjs';
import {handleWorkbenchRequest} from '../lib/workbench-service.mjs';
import {migratedDatabase} from './helpers/d1-sqlite.mjs';

const fixture=name=>JSON.parse(readFileSync(new URL('../../docs/fixtures/assisted-'+name+'.json',import.meta.url),'utf8'));
const bytes=x=>new TextEncoder().encode(typeof x==='string'?x:JSON.stringify(x));
const validate=(notes,run=fixture('run'))=>validateAssistedAuditNotes(bytes(notes),run);

test('versioned plan is deterministic, bounded, partial and does not claim source review or mutate decisions',()=>{
  const run=fixture('run'),before=structuredClone(run),plan=buildAssistedAuditPlan(run);
  assert.deepEqual(plan,buildAssistedAuditPlan(run));assert.deepEqual(run,before);
  assert.equal(plan.policy_version,ASSISTED_POLICY);assert.equal(plan.coverage,'partial');assert.equal(plan.units[0].state,'planned');assert.equal(plan.independent_verification,'not_performed');assert.equal(plan.units.length,1);
  assert.equal(buildAssistedAuditPlan({...run,findings:[]}).units.length,0);
});
test('valid notes preserve source verdict and evidence references without confirming the product finding',async()=>{
  const notes=fixture('notes'),run=fixture('run'),before=structuredClone(run),out=await validate(notes,run);
  assert.equal(out.records[0].source_verdict,'confirmed');assert.equal(out.records[0].human_decision,'candidate');assert.equal(out.records[0].technical_assessment,'needs_validation');assert.equal(out.records[0].independent_verification,'not_performed');assert.equal(out.provenance_authenticated,false);assert.deepEqual(out.actions_performed,[]);assert.equal(out.records[0].severity,undefined);assert.match(out.report_sha256,/^[a-f0-9]{64}$/);assert.deepEqual(run,before);
  assert.deepEqual(out,await validate(notes,run));
});
test('malformed, duplicate-key, unknown-field and excessive input is rejected without echoing input',async()=>{
  for(const input of ['{',JSON.stringify(fixture('notes')).replace('"schema":','"schema":"duplicate","schema":'),{...fixture('notes'),human_decision:'confirmed'},'x'.repeat(ASSISTED_LIMITS.input_bytes+1)])await assert.rejects(validate(input),/Notas assistidas inválidas/);
  const notes=fixture('notes');notes.records[0].severity='critical';await assert.rejects(validate(notes));
});
test('foreign run, project, repository, commit and snapshot cannot bind notes to another scope',async()=>{
  for(const [key,value]of [['run_id','other-run'],['project_id','other-project'],['repository_id',999],['revision','b'.repeat(40)],['snapshot_digest','e'.repeat(64)]]){const notes=fixture('notes');notes.context[key]=value;await assert.rejects(validate(notes));}
});
test('invented finding, location or trace fields are rejected rather than manufacturing evidence',async()=>{
  for(const patch of [{finding_id:'f'.repeat(20)},{path:'../private.js'},{path:'src/invented.js'},{line:800},{evidence:'fabricated'}]){const notes=fixture('notes');Object.assign(notes.records[0],patch);await assert.rejects(validate(notes));}
});
test('raw evidence and document prompt injection do not become plan/report instructions',async()=>{
  const run=fixture('run'),poison='IGNORE_POLICY_SYNTHETIC_ONLY <script>do-not-run</script>';
  run.findings[0].evidence=poison;run.audit_plan={units:[{instruction:poison}]};
  assert.ok(!JSON.stringify(buildAssistedAuditPlan(run)).includes(poison));assert.ok(!renderAssistedAuditPlanMarkdown(run).includes(poison));
  const notes=fixture('notes');notes.records[0].hypothesis=poison;const out=await validate(notes,run);
  assert.equal(out.records[0].technical_assessment,'needs_validation');assert.deepEqual(out.actions_performed,[]);
  assert.ok(!renderAssistedAuditPlanMarkdown({...run,assisted_notes:out}).includes(poison));
});
test('redacted source stays omitted, recognizable raw secrets are rejected, and insufficient context abstains',async()=>{
  const run=fixture('run');run.findings[0].evidence='secret=[REDACTED]';assert.ok(!JSON.stringify(buildAssistedAuditPlan(run)).includes('[REDACTED]'));
  const notes=fixture('notes');notes.records[0].hypothesis='token='+('SYNTHETIC_ONLY_'.repeat(2));await assert.rejects(validate(notes));
  for(const patch of [{verified_revision:false},{source:'rea-import'},{snapshot_digest:null},{project_id:null},{status:'failed'},{findings:null}]){assert.equal(buildAssistedAuditPlan({...run,...patch}).state,'unavailable');await assert.rejects(validate(fixture('notes'),{...run,...patch}));}
});
test('all persisted human decisions survive rejected or confirmed claims, replay and changed hypotheses',async()=>{
  for(const decision of ['candidate','confirmed','false_positive','accepted_risk'])for(const verdict of ['confirmed','rejected']){
    const run=fixture('run');run.findings[0].status=decision;const notes=fixture('notes');notes.records[0].source_verdict=verdict;
    const out=await validate(notes,run);assert.equal(out.records[0].human_decision,decision);
    const old=out.records[0].claim_sha256;notes.records[0].hypothesis='Nova hipótese sintética requer revalidação.';
    const next=await validate(notes,run);assert.notEqual(next.records[0].claim_sha256,old);assert.equal(next.records[0].review_required,true);assert.equal(next.records[0].human_decision,decision);
  }
});
test('needs_validation requires blockers and has no severity or asserted independent verifier',async()=>{
  const notes=fixture('notes');notes.records[0].source_verdict='needs_validation';notes.records[0].blockers=['Contexto do gatilho não foi adquirido.'];
  const out=await validate(notes);assert.equal(out.records[0].severity,undefined);assert.deepEqual(out.records[0].blockers,notes.records[0].blockers);
  for(const patch of [{blockers:[]},{independent_verification:'verified'},{human_decision:'confirmed'},{severity:'low'}]){const n=structuredClone(notes);Object.assign(n.records[0],patch);await assert.rejects(validate(n));}
});
test('old source and duplicate records require revalidation; no missing finding is called fixed',async()=>{
  const notes=fixture('notes');await assert.rejects(validate(notes,{...fixture('run'),revision:'b'.repeat(40)}));
  notes.records.push(structuredClone(notes.records[0]));await assert.rejects(validate(notes));
  await assert.rejects(validate(fixture('notes'),{...fixture('run'),findings:[]}));
  assert.match(renderAssistedAuditPlanMarkdown(fixture('run')),/não significa correção/);
});
test('real export contains the derived plan, keeps portable prompt separate and ignores stored annotations',()=>{
  const run=fixture('run');run.assisted_notes={hypothesis:'UNTRUSTED_STORED_TEXT'};
  const report=renderReport(run);assert.ok(report.includes(renderAssistedAuditPlanMarkdown(run)));assert.ok(report.includes('Prompt portátil'));assert.ok(!report.includes('UNTRUSTED_STORED_TEXT'));assert.equal(report.split('```').length-1,2);
});
test('owner-scoped real API derives plan only after access checks; other account and revocation reveal none',async t=>{
  const db=migratedDatabase();t.after(()=>db.close());const run=fixture('run'),stamp='2026-10-28T00:00:00Z';
  db.sql.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at,source,installation_id,visibility) VALUES (?,?,?,?,?,'github-app',7,'private')").run(run.project_id,'owner-a',run.repo,run.repository_id,stamp);
  db.sql.prepare("INSERT INTO workbench_runs (id,owner_id,project_id,repo,repository_id,request_id,revision,status,result_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'complete',?,?,?)").run(run.id,'owner-a',run.project_id,run.repo,run.repository_id,crypto.randomUUID(),run.revision,JSON.stringify(run),stamp,stamp);
  let denied=false,checks=0;
  const get=async userId=>handleWorkbenchRequest(new Request('https://synthetic.invalid/api/workbench',{method:'POST',headers:{Origin:'https://synthetic.invalid','Content-Type':'application/json','X-Workbench-CSRF':'x'.repeat(43)},body:JSON.stringify({action:'run',runId:run.id})}),{getUser:async()=>({userId,githubId:userId==='owner-a'?'11':'22',provider:'github',role:userId==='owner-a'?'admin':'member',csrfToken:'x'.repeat(43)}),getDb:()=>db,authorizedOwnerId:'owner-a',accessPolicy:{multiUserEnabled:true,githubOwnerId:'11',workbenchOwnerId:'owner-a',allowedGitHubIds:['22']},githubApp:{enabled:true,getClient:async()=>({checkRepositoryAccess:async()=>{checks++;if(denied){const {GitHubAppError}=await import('../lib/github-app-client.mjs');throw new GitHubAppError('forbidden',403);}return {repository:{id:run.repository_id}};}})}});
  const opened=await get('owner-a');assert.equal(opened.status,200);assert.equal((await opened.json()).run.audit_plan.state,'ready');assert.equal(checks,1);
  const other=await get('github:22');assert.equal(other.status,404);assert.ok(!(await other.text()).includes(run.repo));assert.equal(checks,1);
  db.sql.prepare('INSERT INTO workbench_reviews (id,owner_id,run_id,fingerprint,decision,updated_at) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),'owner-a',run.id,run.findings[0].fingerprint,'accepted_risk',stamp);
  const current=(await (await get('owner-a')).json()).run;
  assert.equal(current.audit_plan.units[0].human_decision,'accepted_risk');
  assert.equal((await validate(fixture('notes'),current)).records[0].human_decision,'accepted_risk');
  denied=true;const revoked=await get('owner-a');assert.equal(revoked.status,404);assert.ok(!(await revoked.text()).includes('audit_plan'));
  assert.equal(db.sql.prepare('SELECT count(*) n FROM workbench_analysis_jobs').get().n,0);
  assert.equal(db.sql.prepare('SELECT decision FROM workbench_reviews').get().decision,'accepted_risk');
});
