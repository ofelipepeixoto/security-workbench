import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWorkbenchRequest} from '../lib/workbench-service.mjs';
import {contextualRuntime} from '../lib/contextual-review-workbench.mjs';
import {CONTEXTUAL_POLICY} from '../lib/contextual-review.mjs';
import {GitHubAppError} from '../lib/github-app-client.mjs';
import {migratedDatabase} from './helpers/d1-sqlite.mjs';

// Local HTTP handler + actual SQLite/D1 adapter. Only transport boundaries are
// synthetic. No live GitHub/OpenAI call, credential, hosted session or QA job.
const ORIGIN='https://workbench.example',TIME=1793016000000,REV='a'.repeat(40),BLOB='b'.repeat(40),FP='1'.repeat(20);
const CSRF='c'.repeat(43),MODEL='synthetic-model-2026-10-26';
const A={userId:'qa:synthetic-a',githubId:'11',role:'admin',provider:'github',csrfToken:CSRF};
const B={userId:'github:22',githubId:'22',role:'member',provider:'github',csrfToken:'d'.repeat(43)};
const ACCESS={multiUserEnabled:true,githubOwnerId:'11',workbenchOwnerId:A.userId,allowedGitHubIds:['22']};
const CONFIG={enabled:true,approvedModel:MODEL,approvedProjectId:'proj_synthetic',approvedOrganizationId:'org_synthetic',dataPolicy:'fixture-snippets-v1'};

function answer(context) {
  const f=context.findings[0],e=context.excerpts[0];
  return {state:'ready',revision:context.revision,items:[{finding_id:f.id,decision_status:f.decision_status,
    hypothesis:'A permissão ampla merece verificação contextual.',counterpoint:'O trecho não demonstra exploração ou necessidade real de escrita.',
    limitations:['Operações do workflow foram omitidas.'],recommendations:['Propor permissões mínimas após conferir as operações.'],
    proposed_tests:['Teste proposto e não executado: verificar a permissão mínima usando uma fixture.'],
    citations:[{finding_id:f.id,excerpt_id:e.id,revision:context.revision}]}],limitations:['Contexto estrutural limitado; não é um parecer de segurança.']};
}

function setup(t,{enabled=true,oldSchema=false}={}) {
  const raw=migratedDatabase();t.after(()=>raw.close());
  const runs=[A,B].map((user,index)=>{
    const project=crypto.randomUUID(),id=crypto.randomUUID(),repositoryId=index?202:101,repo=index?'fixture-b/synthetic':'fixture-a/synthetic';
    const finding={fingerprint:FP,kind:'broad-workflow-permissions',rule_id:'SWB-WORKFLOW-001/1',path:'.github/workflows/ci.yml',line:2,status:'candidate',confidence:'high',evidence:'Structural fixture only.'};
    const result={source:'github-app',revision:REV,repository_id:repositoryId,verified_revision:true,status:'complete',files_read:1,partial:true,findings:[finding],dependencies:[]};
    raw.sql.prepare("INSERT INTO workbench_projects(id,owner_id,repo,repository_id,authorized_at,source,installation_id,visibility) VALUES(?,?,?,?,?,'github-app',?,'private')").run(project,user.userId,repo,repositoryId,new Date(TIME).toISOString(),index?8:7);
    raw.sql.prepare("INSERT INTO workbench_runs(id,owner_id,project_id,repo,repository_id,request_id,revision,status,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'complete',?,?,?)").run(id,user.userId,project,repo,repositoryId,crypto.randomUUID(),REV,JSON.stringify(result),new Date(TIME).toISOString(),new Date(TIME).toISOString());
    return {id,project,repositoryId,repo,user};
  });
  if(enabled) {
    const policy={id:1,enabled:1,version:CONTEXTUAL_POLICY,model:MODEL,organization_id:'org_synthetic',project_id:'proj_synthetic',data_policy:'fixture-snippets-v1',starts_at:TIME-1000,ends_at:TIME+604000000,price_expires_at:TIME+3600000,input_micro_usd_per_million:1000000,output_micro_usd_per_million:2000000,max_input_tokens:16384,max_output_tokens:1024,budget_micro_usd:1000000,max_review_micro_usd:20000,daily_user_limit:2,total_limit:4,retention_ms:60000,scopes_json:JSON.stringify(runs.map(r=>({owner_id:r.user.userId,repository_id:r.repositoryId,revision:REV})))};
    const names=Object.keys(policy);raw.sql.prepare(`INSERT INTO workbench_contextual_policy(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).run(...names.map(n=>policy[n]));
  }
  if(oldSchema)raw.sql.exec('DROP TABLE workbench_contextual_reviews; DROP TABLE workbench_contextual_policy');
  const state={session:A,access:true,connection:true,connectionReads:0,executionContexts:0,calls:0,acquisitions:0,checks:0,contextualReads:0,userReads:0,onSource:null,onProvider:null,onCheck:null,onFinish:null};
  const db={...raw,prepare(sql){
    if(/workbench_contextual_/.test(sql)){state.contextualReads++;if(oldSchema)throw new Error('New contextual tables must not be touched while off');}
    const prepared=raw.prepare(sql);
    return {bind(...args){const statement=prepared.bind(...args);return{...statement,async run(){const result=await statement.run();if(/^UPDATE workbench_contextual_reviews SET state=\?,result_json=/.test(sql)&&args[0]==='complete')await state.onFinish?.();return result;}};}};
  }};
  const client={
    restrictRequestBudget(value){assert.equal(value,16);},
    async checkRepositoryAccess({installationId,repositoryId}) {
      state.checks++;await state.onCheck?.(state.checks);
      const r=runs.find(r=>r.repositoryId===repositoryId&&(r.user===A?7:8)===installationId);
      if(!state.access||!r)throw new GitHubAppError('forbidden',403);
      return{repository:{id:r.repositoryId,full_name:r.repo,private:true,visibility:'private'}};
    },
    async readContextFile(options){
      state.acquisitions++;assert.equal(options.revision,REV);assert.equal(options.path,'.github/workflows/ci.yml');assert.equal(options.maxBytes,32768);
      await state.onSource?.();
      return{repository:{id:options.repositoryId},revision:REV,path:options.path,blob_sha:BLOB,bytes:69,text:'on: pull_request\npermissions: write-all\njobs:\n  name: fixture'};
    },
  };
  const provider=async({context})=>{state.calls++;await state.onProvider?.(context);return{output:answer(context),usage:{input_tokens:1000,output_tokens:300}};};
  const deps={getDb:()=>db,getUser:async()=>{state.userReads++;return state.session;},authorizedOwnerId:A.userId,accessPolicy:ACCESS,
    githubApp:{enabled:true,async getClient(){return client;},createExecutionContext(){
      state.executionContexts++;
      return{async getClient(){
        state.connectionReads++;
        if(!state.connection)throw new GitHubAppError('disconnected',401);
        return client;
      }};
    }},contextual:{config:{...CONFIG,enabled},provider},now:()=>new Date(TIME)};
  const request=async({run=runs[0],method='GET',body,csrf,headers={}}={})=>{
    const req=new Request(ORIGIN+'/api/workbench/contextual-review'+(method==='GET'?'?runId='+run.id:''),method==='GET'?undefined:{method,headers:{Origin:ORIGIN,'Content-Type':'application/json',...(csrf===false?{}:{'X-Workbench-CSRF':csrf??state.session?.csrfToken??CSRF}),...headers},body:JSON.stringify(body??{runId:run.id})});
    const response=await handleWorkbenchRequest(req,deps,{contextualOnly:true});
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    return{status:response.status,body:await response.json()};
  };
  return{raw,db,runs,state,request,deps};
}

test('runtime key presence cannot enable contextual calls in production or without the explicit QA switch',()=>{
  for(const env of [{},{OPENAI_API_KEY:'synthetic-value'},{WORKBENCH_CONTEXTUAL_ENABLED:'true',OPENAI_API_KEY:'synthetic-value'},{WORKBENCH_QA_ENABLED:'true',OPENAI_API_KEY:'synthetic-value'}]){
    const runtime=contextualRuntime(env);assert.equal(runtime.config.enabled,false);assert.equal(runtime.provider,undefined);
  }
});

test('authorized default-off HTTP GET and POST work before the contextual migration and perform no contextual I/O',async t=>{
  const x=setup(t,{enabled:false,oldSchema:true});
  for(const method of ['GET','POST']){const result=await x.request({method});assert.equal(result.status,200);assert.equal(result.body.contextual_review.state,'disabled');assert.equal(result.body.generation_allowed,false);}
  assert.equal(x.state.contextualReads,0);assert.equal(x.state.acquisitions,0);assert.equal(x.state.calls,0);
});

test('B cannot discover, generate or delete A review by guessing its run ID',async t=>{
  const x=setup(t);x.state.session=B;
  for(const input of [{},{method:'POST'},{method:'POST',body:{runId:x.runs[0].id,operation:'delete'}}]){
    const result=await x.request(input);assert.equal(result.status,404);assert.doesNotMatch(JSON.stringify(result.body),/fixture-a|synthetic-a|workflows|permissions/);
  }
  assert.equal(x.state.contextualReads,0);assert.equal(x.state.acquisitions,0);assert.equal(x.state.calls,0);
});

test('contextual HTTP mutation rejects missing CSRF, foreign origin and owner/source/model injection before provider access',async t=>{
  const x=setup(t);
  assert.equal((await x.request({method:'POST',csrf:false})).status,403);
  assert.equal((await x.request({method:'POST',headers:{Origin:'https://other.example'}})).status,403);
  for(const injected of [{ownerId:B.userId},{source:'caller source'},{model:MODEL},{action:'contextual-read'}])assert.equal((await x.request({method:'POST',body:{runId:x.runs[0].id,...injected}})).status,400);
  assert.equal(x.state.calls,0);assert.equal(x.state.acquisitions,0);assert.equal(x.state.contextualReads,0);
});

test('active GET is metadata-only eligibility; automatic POST returns pinned citations and is idempotent',async t=>{
  const x=setup(t);const eligibility=await x.request();
  assert.equal(eligibility.status,200);assert.equal(eligibility.body.generation_allowed,true);assert.equal(eligibility.body.contextual_review.state,'not_started');
  assert.equal(x.state.calls,0);assert.equal(x.state.acquisitions,0);assert.equal(x.raw.sql.prepare('SELECT COUNT(*) n FROM workbench_contextual_reviews').get().n,0);
  const first=await x.request({method:'POST'}),again=await x.request({method:'POST'});
  assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.contextual_review.state,'ready');assert.deepEqual(again.body.contextual_review.items,first.body.contextual_review.items);
  assert.equal(x.state.calls,1);assert.equal(x.state.acquisitions,1);assert.ok(x.state.userReads>5);
  assert.ok(x.state.connectionReads>5,'the live local connection is read at contextual boundaries');
  assert.equal(first.body.contextual_review.context_manifest[0].revision,REV);assert.equal(first.body.contextual_review.context_manifest[0].blob_sha,BLOB);
  const saved=x.raw.sql.prepare('SELECT result_json FROM workbench_contextual_reviews').get().result_json;assert.doesNotMatch(saved,/permissions: write-all|on: pull_request/);
});

test('logout or A-to-B session change after acquisition denies sending source to the provider',async t=>{
  for(const replacement of [null,B]){
    const x=setup(t);x.state.onSource=()=>{x.state.session=replacement;};
    const result=await x.request({method:'POST'});assert.equal(result.status,404);assert.equal(x.state.calls,0);assert.equal(x.state.acquisitions,1);
    assert.doesNotMatch(JSON.stringify(result.body),/fixture-a|hypothesis|workflows/);
  }
});

test('logout after the initial route access check is observed before any contextual source acquisition',async t=>{
  const x=setup(t);x.state.onCheck=count=>{if(count===1)x.state.session=null;};
  const result=await x.request({method:'POST'});assert.equal(result.status,404);
  assert.equal(x.state.acquisitions,0);assert.equal(x.state.calls,0);
  assert.equal(x.raw.sql.prepare('SELECT COUNT(*) n FROM workbench_contextual_reviews').get().n,0);
});

test('GitHub access revoked after acquisition blocks the model call even while login remains valid',async t=>{
  const x=setup(t);x.state.onSource=()=>{x.state.access=false;};
  const result=await x.request({method:'POST'});assert.equal(result.status,403);assert.equal(x.state.calls,0);assert.equal(x.state.session,A);
});

test('A-to-B session swap during provider response denies delivery and retains an unknown financial reservation',async t=>{
  const x=setup(t);x.state.onProvider=()=>{x.state.session=B;};
  const result=await x.request({method:'POST'});assert.equal(result.status,404);assert.equal(x.state.calls,1);
  assert.doesNotMatch(JSON.stringify(result.body),/hypothesis|fixture-a|workflows/);
  const row=x.raw.sql.prepare('SELECT state,outcome_unknown,result_json FROM workbench_contextual_reviews').get();assert.equal(row.state,'unknown');assert.equal(row.outcome_unknown,1);assert.equal(row.result_json,null);
});

test('a persisted human decision changing during generation prevents delivery of a stale contextual decision',async t=>{
  const x=setup(t);x.state.onProvider=()=>{x.raw.sql.prepare('INSERT INTO workbench_reviews(id,owner_id,run_id,fingerprint,decision,updated_at) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),A.userId,x.runs[0].id,FP,'accepted_risk',new Date(TIME).toISOString());};
  const result=await x.request({method:'POST'});assert.equal(result.status,404);assert.equal(x.state.calls,1);
  assert.equal(x.raw.sql.prepare('SELECT decision FROM workbench_reviews').get().decision,'accepted_risk');assert.doesNotMatch(JSON.stringify(result.body),/hypothesis|Permissões|recomenda/);
});

test('revocation after the result is persisted never falls back to completed cache delivery',async t=>{
  const x=setup(t);x.state.onFinish=()=>{x.state.access=false;};
  const result=await x.request({method:'POST'});assert.equal(result.status,403);assert.equal(x.state.calls,1);
  assert.doesNotMatch(JSON.stringify(result.body),/hypothesis|fixture-a|workflows|context_manifest/);
  assert.equal(x.raw.sql.prepare('SELECT state FROM workbench_contextual_reviews').get().state,'complete');
  const cache=await x.request();assert.equal(cache.status,404);assert.doesNotMatch(JSON.stringify(cache.body),/hypothesis|context_manifest/);assert.equal(x.state.calls,1);
});

test('session change after persistence is checked again before generated text delivery',async t=>{
  const x=setup(t);x.state.onFinish=()=>{x.state.session=B;};
  const result=await x.request({method:'POST'});assert.equal(result.status,404);assert.equal(x.state.calls,1);
  assert.equal(x.raw.sql.prepare('SELECT state FROM workbench_contextual_reviews').get().state,'complete');
  assert.doesNotMatch(JSON.stringify(result.body),/hypothesis|fixture-a|workflows|context_manifest/);
  const b=await x.request();assert.equal(b.status,404);assert.equal(x.state.calls,1);
});

test('local App disconnect after acquisition denies a still-valid cached provider token before sending context',async t=>{
  const x=setup(t);x.state.onSource=()=>{x.state.connection=false;};
  const result=await x.request({method:'POST'});assert.equal(result.status,401);assert.equal(result.body.code,'disconnected');
  assert.equal(x.state.access,true,'the provider still accepts its token; local consent is independently required');
  assert.equal(x.state.calls,0);assert.equal(x.state.acquisitions,1);assert.ok(x.state.connectionReads>=3);
  assert.doesNotMatch(JSON.stringify(result.body),/hypothesis|fixture-a|workflows|context_manifest/);
});

test('local App disconnect after persistence prevents generated or cached result delivery despite provider access',async t=>{
  const x=setup(t);x.state.onFinish=()=>{x.state.connection=false;};
  const result=await x.request({method:'POST'});assert.equal(result.status,401);assert.equal(result.body.code,'disconnected');
  assert.equal(x.state.access,true);assert.equal(x.state.calls,1);assert.equal(x.raw.sql.prepare('SELECT state FROM workbench_contextual_reviews').get().state,'complete');
  assert.doesNotMatch(JSON.stringify(result.body),/hypothesis|fixture-a|workflows|context_manifest/);
  const cache=await x.request();assert.equal(cache.status,404);assert.equal(x.state.calls,1);assert.doesNotMatch(JSON.stringify(cache.body),/hypothesis|context_manifest/);
});

test('active contextual work fails closed when fresh execution-context authorization is unavailable',async t=>{
  const x=setup(t);delete x.deps.githubApp.createExecutionContext;
  const result=await x.request({method:'POST'});assert.equal(result.status,503);
  assert.equal(x.state.calls,0);assert.equal(x.state.acquisitions,0);assert.equal(x.state.connectionReads,0);
  assert.equal(x.raw.sql.prepare('SELECT COUNT(*) n FROM workbench_contextual_reviews').get().n,0);
});
