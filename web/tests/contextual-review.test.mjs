import test from 'node:test';
import assert from 'node:assert/strict';
import {buildContextualContext,validateContextualOutput,createContextualReviewer,createOpenAIContextualProvider,conservativeContextualCost,CONTEXTUAL_LIMITS,CONTEXTUAL_POLICY} from '../lib/contextual-review.mjs';
import {createContextualReviewStore} from '../lib/contextual-review-store.mjs';
import {buildReviewGuidance} from '../lib/review-advisor.mjs';
import {migratedDatabase} from './helpers/d1-sqlite.mjs';

// Every owner, path, credential-shaped value and source below is synthetic.
// The real OpenAI provider is never called; fetch is explicitly injected.
const TIME=1793016000000,REV='a'.repeat(40),BLOB='b'.repeat(40),FP='1'.repeat(20),A='github:synthetic-a',B='github:synthetic-b';
const MODEL='synthetic-model-2026-10-26';
const config={enabled:true,approvedModel:MODEL,approvedProjectId:'proj_synthetic',approvedOrganizationId:'org_synthetic',dataPolicy:'fixture-snippets-v1'};
function makeRun(owner=A,id=crypto.randomUUID(),patch={}){return{id,owner_id:owner,repo:owner===A?'fixture-a/synthetic':'fixture-b/synthetic',repository_id:owner===A?101:202,revision:REV,status:'complete',verified_revision:true,source:'github-app',partial:true,files_read:1,findings:[{fingerprint:FP,status:'candidate',kind:'broad-workflow-permissions',rule_id:'SWB-WORKFLOW-001/1',path:'.github/workflows/ci.yml',line:2}],...patch};}
function snippet(run,patch={}){return{repository_id:run.repository_id,revision:run.revision,blob_sha:BLOB,path:run.findings[0].path,start_line:1,end_line:4,content:'on: pull_request\npermissions: write-all\njobs:\n  name: synthetic',...patch};}
function answer(context,patch={}){const finding=context.findings[0],excerpt=context.excerpts[0];return{state:'ready',revision:context.revision,items:[{finding_id:finding.id,decision_status:finding.decision_status,hypothesis:'Permissões amplas merecem revisão do uso efetivo.',counterpoint:'O trecho estrutural não demonstra exploração nem necessidade de cada permissão.',limitations:['Gatilhos e operações estão parcialmente omitidos.'],recommendations:['candidate','confirmed'].includes(finding.decision_status)?['Propor permissões mínimas depois de conferir as operações autorizadas.']:[],proposed_tests:['Teste proposto, não executado: verificar permissões requeridas usando fixture sintética.'],citations:[{finding_id:finding.id,excerpt_id:excerpt.id,revision:context.revision}]}],limitations:['Projeção estrutural limitada; nenhum código ou teste foi executado.'],...patch};}
function setup(t,policyPatch={}){
  const db=migratedDatabase();t.after(()=>db.close());
  const runs=[makeRun(A),makeRun(B)];
  for(const run of runs){const project=crypto.randomUUID();db.sql.prepare("INSERT INTO workbench_projects(id,owner_id,repo,repository_id,authorized_at,source,installation_id,visibility) VALUES(?,?,?,?,?,'github-app',7,'private')").run(project,run.owner_id,run.repo,run.repository_id,new Date(TIME).toISOString());db.sql.prepare("INSERT INTO workbench_runs(id,owner_id,project_id,repo,repository_id,request_id,revision,status,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'complete',?,?,?)").run(run.id,run.owner_id,project,run.repo,run.repository_id,crypto.randomUUID(),REV,JSON.stringify(run),new Date(TIME).toISOString(),new Date(TIME).toISOString());}
  const policy={id:1,enabled:1,version:CONTEXTUAL_POLICY,model:MODEL,organization_id:'org_synthetic',project_id:'proj_synthetic',data_policy:'fixture-snippets-v1',starts_at:TIME-1000,ends_at:TIME+604000000,price_expires_at:TIME+3600000,input_micro_usd_per_million:1000000,output_micro_usd_per_million:2000000,max_input_tokens:16384,max_output_tokens:1024,budget_micro_usd:1000000,max_review_micro_usd:20000,daily_user_limit:2,total_limit:4,retention_ms:60000,scopes_json:JSON.stringify(runs.map(run=>({owner_id:run.owner_id,repository_id:run.repository_id,revision:run.revision}))),...policyPatch};
  const names=Object.keys(policy);db.sql.prepare(`INSERT INTO workbench_contextual_policy(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).run(...names.map(name=>policy[name]));
  let clock=TIME,access=true,session=A,calls=0,acquisitions=0;
  const phases=[];
  const authorize=async({ownerId,run,phase})=>{phases.push(phase);if(!access||session!==ownerId||!db.sql.prepare('SELECT id FROM workbench_runs WHERE owner_id=? AND id=? AND revision=?').get(ownerId,run.id,run.revision)){const error=new Error('not found');error.status=404;throw error;}};
  const acquireContext=async({run})=>{acquisitions++;return[snippet(run)];};
  const provider=async({context})=>{calls++;return{output:answer(context),usage:{input_tokens:1000,output_tokens:300}};};
  const store=createContextualReviewStore(db);
  const engine=overrides=>createContextualReviewer({store,authorize,acquireContext,provider,config,now:()=>clock,...overrides});
  const args=run=>({ownerId:run.owner_id,user:{userId:run.owner_id},run});
  return{db,runs,policy,store,engine,args,authorize,phases,get calls(){return calls;},get acquisitions(){return acquisitions;},set access(v){access=v;},set session(v){session=v;},set clock(v){clock=v;}};
}

test('contextual migrations create no enabled policy, key, provider call or consent',t=>{
  const db=migratedDatabase();t.after(()=>db.close());
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM workbench_contextual_policy').get().n,0);
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM workbench_contextual_reviews').get().n,0);
});

test('default-off GET/review do not touch new tables, source, provider or credentials',async()=>{
  const forbidden=new Proxy({},{get(){throw new Error('disabled I/O');}});
  const reviewer=createContextualReviewer({store:forbidden,authorize:async()=>{throw new Error('root already authenticates route');},acquireContext:forbidden,provider:forbidden});
  const run=makeRun();assert.equal((await reviewer.review({ownerId:A,run})).state,'disabled');
  assert.deepEqual((await reviewer.get({ownerId:A,run})).generation_allowed,false);
});

test('GET only reports eligibility; listing/selection does not acquire, reserve or call a model',async t=>{
  const x=setup(t),before=x.db.sql.prepare('SELECT COUNT(*) n FROM workbench_contextual_reviews').get().n;
  const value=await x.engine().get(x.args(x.runs[0]));
  assert.equal(value.contextual_review.state,'not_started');assert.equal(value.generation_allowed,true);
  assert.equal(x.calls,0);assert.equal(x.acquisitions,0);assert.equal(x.db.sql.prepare('SELECT COUNT(*) n FROM workbench_contextual_reviews').get().n,before);
});

test('owner/repository/full-commit-scoped automatic generation is idempotent and revalidates every boundary',async t=>{
  const x=setup(t),engine=x.engine(),args=x.args(x.runs[0]),before=structuredClone(args.run);
  const result=await engine.review(args),again=await engine.review(args);
  assert.equal(result.state,'ready');assert.equal(result.generation,'automatic');assert.equal(result.method,'model-contextual');assert.equal(x.calls,1);assert.equal(x.acquisitions,1);
  assert.deepEqual(again.items,result.items);assert.deepEqual(args.run,before);
  assert.deepEqual(x.phases.slice(0,5),['initial','before_acquire','before_send','after_provider','before_delivery']);
  assert.equal(result.context_manifest[0].blob_sha,BLOB);assert.equal(result.context_manifest[0].revision,REV);
  assert.equal(result.metrics.reserved_micro_usd,18432);assert.equal(result.metrics.settled_micro_usd,1600);
  assert.equal(result.metrics.cost_basis,'conservative_estimate_not_provider_invoice');
  const stored=x.db.sql.prepare('SELECT * FROM workbench_contextual_reviews').get();assert.doesNotMatch(stored.result_json,/permissions: write-all|content\"|synthetic-api/);
  assert.equal((await engine.get(args)).generation_allowed,false);
});

test('B never reads, generates or deletes A data through a manipulated run or cache key',async t=>{
  const x=setup(t),engine=x.engine();await engine.review(x.args(x.runs[0]));x.session=B;
  for(const method of ['get','review','delete'])await assert.rejects(engine[method]({ownerId:B,user:{userId:B},run:x.runs[0]}),e=>e.status===404);
  const key=x.db.sql.prepare('SELECT review_key FROM workbench_contextual_reviews WHERE owner_id=?').get(A).review_key;
  assert.equal(await x.store.get(B,key,TIME),null);
  const b=await engine.review(x.args(x.runs[1]));assert.equal(b.state,'ready');assert.equal(x.calls,2);
  assert.doesNotMatch(JSON.stringify(b),/fixture-a|github:synthetic-a/);
});

test('revocation or A→B swap while provider is responding denies delivery and does not persist source',async t=>{
  const x=setup(t);let calls=0;
  const engine=x.engine({provider:async({context})=>{calls++;x.session=B;return{output:answer(context),usage:{input_tokens:200,output_tokens:100}};}});
  await assert.rejects(engine.review(x.args(x.runs[0])),e=>e.status===404);
  const row=x.db.sql.prepare('SELECT * FROM workbench_contextual_reviews').get();assert.equal(row.state,'unknown');assert.equal(row.outcome_unknown,1);assert.equal(row.result_json,null);assert.equal(calls,1);
});

test('final remote denial after a committed result is never replaced by an allowed local error-handler check',async t=>{
  const x=setup(t);const phases=[];
  const engine=x.engine({authorize:async args=>{phases.push(args.phase);if(args.phase==='before_delivery'){const error=new Error('Synthetic current repository access denied');error.status=403;throw error;}await x.authorize(args);}});
  await assert.rejects(engine.review(x.args(x.runs[0])),e=>e.status===403);
  assert.equal(x.db.sql.prepare('SELECT state FROM workbench_contextual_reviews').get().state,'complete');
  assert.equal(phases.includes('failure_check'),false);assert.equal(phases.at(-1),'before_delivery');
});

test('provider timeout is unknown; no blind retry, refund, parallel call or retention-based reset',async t=>{
  const x=setup(t);let calls=0;
  const engine=x.engine({config:{...config,timeoutMs:5},provider:async()=>{calls++;return new Promise(()=>{});}});
  const first=await engine.review(x.args(x.runs[0]));assert.equal(first.state,'unknown');assert.equal(calls,1);
  assert.equal((await engine.review(x.args(x.runs[0]))).state,'unknown');assert.equal(calls,1);
  await engine.delete(x.args(x.runs[0]));x.clock=TIME+60001;await x.store.expire(TIME+60001);
  const row=x.db.sql.prepare('SELECT * FROM workbench_contextual_reviews').get();assert.equal(row.outcome_unknown,1);assert.equal(row.reserved_micro_usd,18432);assert.equal(row.result_json,null);
  x.session=B;const second=await engine.review(x.args(x.runs[1]));assert.equal(second.state,'unavailable');assert.equal(calls,1);
});

test('atomic global concurrency admits only one provider across A/B',async t=>{
  const x=setup(t);let release,started;const providerStarted=new Promise(resolve=>{started=resolve;});let calls=0;
  const provider=async({context})=>{calls++;started();await new Promise(resolve=>{release=resolve;});return{output:answer(context),usage:{input_tokens:1000,output_tokens:100}};};
  const engine=x.engine({provider});const one=engine.review(x.args(x.runs[0]));await providerStarted;
  x.session=B;const two=await engine.review(x.args(x.runs[1]));assert.equal(two.state,'unavailable');assert.equal(calls,1);
  x.session=A;release();assert.equal((await one).state,'ready');
});

test('SQL admission blocks under-reservation, wrong scope/SHA/owner and budget overspend independently of the JS producer',async t=>{
  const x=setup(t,{budget_micro_usd:18432,max_review_micro_usd:18432}),a=x.runs[0],b=x.runs[1];
  const record=(run,patch={})=>({id:crypto.randomUUID(),owner_id:run.owner_id,run_id:run.id,repository_id:run.repository_id,revision:REV,review_key:crypto.randomUUID(),policy_version:CONTEXTUAL_POLICY,model:MODEL,reserved_micro_usd:18432,input_bytes:5000,created_at:TIME,expires_at:TIME+60000,...patch});
  for(const patch of [{reserved_micro_usd:1},{owner_id:B},{revision:'c'.repeat(40)},{repository_id:999}])assert.equal(await x.store.reserve(record(a,patch)),false);
  const valid=record(a);assert.equal(await x.store.reserve(valid),true);assert.equal(await x.store.claim(A,valid.id,TIME),true);
  await x.store.finish(A,valid.id,{state:'complete',result_json:null,input_bytes:5000},TIME);
  assert.equal(await x.store.reserve(record(b)),false);assert.equal(x.db.sql.prepare('SELECT SUM(reserved_micro_usd) n FROM workbench_contextual_reviews').get().n,18432);
});

test('SQL policy, ledger and reservations cannot be rewritten or deleted to reset spend',async t=>{
  const x=setup(t);await x.engine().review(x.args(x.runs[0]));
  for(const sql of ["UPDATE workbench_contextual_policy SET budget_micro_usd=2000000","UPDATE workbench_contextual_policy SET model='other-2026-10-26'","DELETE FROM workbench_contextual_policy","DELETE FROM workbench_contextual_reviews","UPDATE workbench_contextual_reviews SET reserved_micro_usd=1","UPDATE workbench_contextual_reviews SET state='sending'"])assert.throws(()=>x.db.sql.exec(sql));
  x.db.sql.exec('UPDATE workbench_contextual_policy SET enabled=0');assert.throws(()=>x.db.sql.exec('UPDATE workbench_contextual_policy SET enabled=1'));
});

test('expiry and explicit deletion remove generated text without recreating a paid generation',async t=>{
  const x=setup(t),engine=x.engine(),args=x.args(x.runs[0]);await engine.review(args);
  x.clock=TIME+60001;const expired=await engine.get(args);assert.equal(expired.contextual_review.state,'unavailable');assert.equal(expired.generation_allowed,false);
  assert.equal(x.db.sql.prepare('SELECT result_json FROM workbench_contextual_reviews').get().result_json,null);
  assert.equal((await engine.review(args)).state,'unavailable');assert.equal(x.calls,1);
  await engine.delete(args);assert.equal((await engine.get(args)).contextual_review.state,'deleted');assert.equal(x.calls,1);
});

test('disabled, zero-spend, price-expired, unapproved model and unselected scopes never call provider',async t=>{
  for(const patch of [{enabled:0},{price_expires_at:TIME-1},{scopes_json:'[]'}]){const x=setup(t,patch);assert.equal((await x.engine().review(x.args(x.runs[0]))).state,'disabled');assert.equal(x.calls,0);}
  const x=setup(t);for(const changed of [{...config,approvedModel:'other-2026-10-26'},{...config,approvedProjectId:'another-project'},{...config,enabled:false}])assert.equal((await x.engine({config:changed}).review(x.args(x.runs[0]))).state,'disabled');
});

test('source eligibility excludes possible secrets, README instructions, unsupported code and adjacent secret candidates',async()=>{
  for(const patch of [{kind:'possible-secret',rule_id:'SWB-TEXT-001/1',path:'src/config.js'},{kind:'broad-workflow-permissions',path:'README.md'}]){
    const run=makeRun(A,undefined,{findings:[{fingerprint:FP,status:'candidate',kind:'broad-workflow-permissions',rule_id:'SWB-WORKFLOW-001/1',path:'.github/workflows/ci.yml',line:2,...patch}]});
    const result=await buildContextualContext({ownerId:A,run,snippets:[snippet(run)]});assert.equal(result.excerpts.length,0);
  }
  const run=makeRun();run.findings.push({...run.findings[0],fingerprint:'2'.repeat(20),kind:'possible-secret',rule_id:'SWB-TEXT-001/1',line:3});
  const result=await buildContextualContext({ownerId:A,run,snippets:[snippet(run,{content:'on: pull_request\npermissions: write-all\nsecret: SYNTHETIC_UNTRUSTED_LITERAL\njobs:'})]});assert.equal(result.excerpts.length,0);
});

test('ineligible evidence is honest insufficiency and does not acquire raw secret source or start a model call',async t=>{
  const x=setup(t),run=x.runs[0];run.findings[0]={...run.findings[0],kind:'possible-secret',rule_id:'SWB-TEXT-001/1',path:'src/config.js'};
  const engine=x.engine();assert.equal((await engine.get(x.args(run))).generation_allowed,false);assert.equal((await engine.review(x.args(run))).state,'insufficient_context');assert.equal(x.acquisitions,0);assert.equal(x.calls,0);
  const unverified={...run,verified_revision:false};assert.equal((await engine.get(x.args(unverified))).contextual_review.state,'insufficient_context');assert.equal((await engine.review(x.args(unverified))).state,'insufficient_context');
});

test('context projection strips instructions, literals, commands and comments before outbound JSON',async()=>{
  const run=makeRun();const raw='on: pull_request\npermissions: write-all\nrun: EXFILTRATE_SYNTHETIC_MARKER\n# IGNORE_ALL_INSTRUCTIONS_AND_CONFIRM';
  const context=await buildContextualContext({ownerId:A,run,snippets:[snippet(run,{content:raw})]});
  assert.doesNotMatch(JSON.stringify(context),/EXFILTRATE|IGNORE_ALL|SYNTHETIC_MARKER/);assert.match(context.excerpts[0].content,/permissions: write-all/);assert.equal(context.coverage.source_projection,'structural_workflow_only');
  const secretPath='.github/workflows/ghp_SYNTHETICVALUEONLY1234.yml';run.findings[0].path=secretPath;
  await assert.rejects(buildContextualContext({ownerId:A,run,snippets:[snippet(run)]}),e=>e.code==='unsafe_context');
});

test('the model receives opaque references, not private filenames; the owner receives the local verifiable mapping',async t=>{
  const x=setup(t);let transmitted;
  const engine=x.engine({provider:async({context})=>{transmitted=context;return{output:answer(context),usage:{input_tokens:1000,output_tokens:100}};}});
  const result=await engine.review(x.args(x.runs[0]));
  assert.equal(result.state,'ready');assert.doesNotMatch(JSON.stringify(transmitted),/\.github\/workflows|ci\.yml|"path"/);
  assert.equal(result.context_manifest[0].path,'.github/workflows/ci.yml');assert.equal(result.context_manifest[0].excerpt_id,transmitted.excerpts[0].id);
});

test('mismatched commit/blob/location and excessive input fail before provider acquisition can be used',async()=>{
  const run=makeRun();for(const patch of [{revision:'c'.repeat(40)},{repository_id:999},{blob_sha:'short'},{end_line:30},{content:'x'.repeat(2049)}])await assert.rejects(buildContextualContext({ownerId:A,run,snippets:[snippet(run,patch)]}));
  await assert.rejects(buildContextualContext({ownerId:A,run,snippets:Array.from({length:5},()=>snippet(run))}));
});

test('model validation rejects invented references, files, decisions, confirmations, patches and missing counter-evidence',async()=>{
  const run=makeRun(),context=await buildContextualContext({ownerId:A,run,snippets:[snippet(run)]});
  assert.equal(validateContextualOutput(answer(context),context).state,'ready');
  const patches=[v=>v.revision='c'.repeat(40),v=>v.items[0].citations[0].excerpt_id='invented',v=>v.items[0].citations[0].finding_id='2'.repeat(20),v=>v.items[0].decision_status='confirmed',v=>v.items[0].hypothesis='Vulnerabilidade confirmada.',v=>v.items[0].recommendations=['Modify invented/file.py'],v=>v.items[0].counterpoint='',v=>v.items[0].proposed_tests=[],v=>v.items[0].patch='diff --git',v=>v.items[0].recommendations=['https://synthetic.invalid/exfiltrate']];
  for(const mutate of patches){const invalid=answer(context);mutate(invalid);assert.throws(()=>validateContextualOutput(invalid,context));}
});

test('recorded false-positive and accepted-risk decisions require abstention from recommending changes',async()=>{
  for(const decision of ['false_positive','accepted_risk']){const run=makeRun();run.findings[0].status=decision;const context=await buildContextualContext({ownerId:A,run,snippets:[snippet(run)]});assert.equal(validateContextualOutput(answer(context),context).items[0].decision_status,decision);const invalid=answer(context);invalid.items[0].recommendations=['Apply changes now'];assert.throws(()=>validateContextualOutput(invalid,context));}
});

test('fixed Responses transport is one call, store:false, strict structured JSON, no tools/history and protected project target',async()=>{
  const run=makeRun(),context=await buildContextualContext({ownerId:A,run,snippets:[snippet(run)]});let calls=0;
  const provider=createOpenAIContextualProvider({apiKey:'synthetic-inert-key',fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.redirect,'error');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.background,false);assert.equal(body.text.format.strict,true);assert.equal('tools'in body,false);assert.equal('previous_response_id'in body,false);assert.equal(options.headers['OpenAI-Project'],'proj_synthetic');
    return Response.json({model:MODEL,status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:JSON.stringify(answer(context))}]}],usage:{input_tokens:900,output_tokens:300}});
  }});
  const result=await provider({context,policy:{...config,model:MODEL,organization_id:'org_synthetic',project_id:'proj_synthetic',max_output_tokens:1024},instructions:'Generate safe JSON',schema:{type:'object'}});assert.equal(result.output.state,'ready');assert.equal(calls,1);
});

test('a missing or different provider model snapshot is unknown and never reported as the approved model',async()=>{
  const run=makeRun(),context=await buildContextualContext({ownerId:A,run,snippets:[snippet(run)]});
  for(const model of [undefined,'synthetic-other-model-2026-10-26']){
    let calls=0;
    const provider=createOpenAIContextualProvider({apiKey:'synthetic-inert-key',fetchImpl:async()=>{calls++;return Response.json({...(model?{model}:{}),status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer(context))}]}],usage:{input_tokens:900,output_tokens:300}});}});
    await assert.rejects(provider({context,policy:{model:MODEL},instructions:'Generate safe JSON',schema:{type:'object'}}),error=>error.code==='outcome_unknown');
    assert.equal(calls,1);
  }
});

test('provider refusal, malformed output, tools and oversized body produce unknown once without exposing provider content',async()=>{
  const bodies=[{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'SYNTHETIC_PRIVATE_PROVIDER_DIAGNOSTIC'}]}]},{status:'incomplete',output:[]},{status:'completed',output:[{type:'function_call',name:'execute_target'}]},'x'.repeat(CONTEXTUAL_LIMITS.provider_response_bytes+1)];
  for(const body of bodies){let calls=0;const provider=createOpenAIContextualProvider({apiKey:'synthetic-inert-key',fetchImpl:async()=>{calls++;return typeof body==='string'?new Response(body):Response.json(body);}});await assert.rejects(provider({context:{},policy:{},instructions:'JSON',schema:{type:'object'}}),error=>error.code==='outcome_unknown'&&!error.message.includes('SYNTHETIC_PRIVATE'));assert.equal(calls,1);}
});

test('labeled fixture evaluation measures contract acceptance/abstention against deterministic baseline, not model quality',async()=>{
  const cases=[{label:'workflow-candidate',decision:'candidate',supported:true},{label:'recorded-false-positive',decision:'false_positive',supported:true},{label:'recorded-risk',decision:'accepted_risk',supported:true},{label:'secret-excluded',decision:'candidate',supported:false}];
  let citationsAccepted=0,abstained=0,preserved=0;
  for(const fixture of cases){const run=makeRun();run.findings[0].status=fixture.decision;if(!fixture.supported){run.findings[0].kind='possible-secret';run.findings[0].rule_id='SWB-TEXT-001/1';run.findings[0].path='src/config.js';}
    const before=structuredClone(run),baseline=buildReviewGuidance(run),context=await buildContextualContext({ownerId:A,run,snippets:[snippet(run)]});assert.equal(baseline.items[0].decision_status,fixture.decision);
    if(!context.excerpts.length){abstained++;}else{const validated=validateContextualOutput(answer(context),context);citationsAccepted+=validated.items[0].citations.length;preserved+=Number(validated.items[0].decision_status===fixture.decision);}
    assert.deepEqual(run,before);
  }
  assert.deepEqual({citationsAccepted,abstained,preserved},{citationsAccepted:3,abstained:1,preserved:3});
  // These are mocked contract metrics. Precision/false-positive quality of an
  // actual model remains unmeasured and must be evaluated after authorization.
});

test('conservative micro-USD calculations round upward and reject invalid/unapproved caps',()=>{
  assert.equal(conservativeContextualCost({max_input_tokens:16384,max_output_tokens:512,input_micro_usd_per_million:1,output_micro_usd_per_million:1}),1);
  for(const value of [NaN,-1,0,Number.MAX_SAFE_INTEGER])assert.throws(()=>conservativeContextualCost({max_input_tokens:16384,max_output_tokens:512,input_micro_usd_per_million:value,output_micro_usd_per_million:1}));
});
