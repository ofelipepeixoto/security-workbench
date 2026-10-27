import test from 'node:test';
import assert from 'node:assert/strict';
import {migratedDatabase} from './helpers/d1-sqlite.mjs';
import {createQaGuard,QA_ALLOWED_GITHUB_IDS,QA_REPOSITORY_NAMESPACES} from '../lib/qa-guard.mjs';
import {handleWorkbenchRequest} from '../lib/workbench-service.mjs';
import {createGitHubAppAuth} from '../lib/github-app-auth.mjs';
import {qaConsumerFixture} from './helpers/qa-consumer-fixture.mjs';

// Real route/guards and local migrated SQLite; App metadata transport is a spy.
// All repository/installation IDs are synthetic. No hosted request or provider.
const source='d'.repeat(40),csrf='SYNTHETIC_CSRF_NOT_A_CREDENTIAL';
const origin='https://security-workbench-qa.synthetic.workers.dev';
const fixtures=QA_ALLOWED_GITHUB_IDS.map((githubId,i)=>({githubId,repositoryId:21+i,installationId:11+i,repo:`${QA_REPOSITORY_NAMESPACES[i]}/synthetic-fixture`}));
function fixture(t,{actor=0,enabled=true,jobs=false,lookup,guardOverride}={}) {
  const db=migratedDatabase();t.after(()=>db.close());
  const user={userId:actor===0?'qa-primary':`github:${fixtures[1].githubId}`,githubId:fixtures[actor].githubId,provider:'github',role:actor===0?'admin':'member',csrfToken:csrf};
  const env={DB:db,WORKBENCH_ORIGIN:origin,WORKBENCH_OWNER_ID:'qa-primary',WORKBENCH_QA_ENABLED:enabled?'true':'false',WORKBENCH_JOBS_ENABLED:jobs?'true':'false',WORKBENCH_QA_SOURCE_SHA:source,WORKBENCH_QA_CHECK_FIXTURES:JSON.stringify(fixtures)};
  const calls={metadata:0,acquisition:0,dispatch:0,writes:0};
  const originalPrepare=db.prepare.bind(db);db.prepare=sql=>({bind(...values){const s=originalPrepare(sql).bind(...values);return {...s,run:async()=>{calls.writes++;return s.run();}};}});
  const app={enabled:true,getConnection:async()=>({state:'connected'}),getClient:async()=>({
    checkRepositoryAccess:async({repositoryId,installationId})=>{calls.metadata++;if(lookup)return lookup({repositoryId,installationId});const f=fixtures.find(f=>f.repositoryId===repositoryId&&f.installationId===installationId);return {repository:{id:f.repositoryId,full_name:f.repo,private:true}};},
    authorizeRepository:async()=>{calls.acquisition++;throw Error('Code acquisition must not be reached');},
  })};
  const guard=createQaGuard({env});if(guardOverride)Object.assign(guard,guardOverride);
  const deps={getUser:async()=>user,getDb:async()=>db,authorizedOwnerId:'qa-primary',accessPolicy:{multiUserEnabled:true,githubOwnerId:fixtures[0].githubId,workbenchOwnerId:'qa-primary',allowedGitHubIds:QA_ALLOWED_GITHUB_IDS},githubApp:app,jobsEnabled:jobs,qaGuard:guard,dispatchJob:async()=>{calls.dispatch++;}};
  const request=(payload,overrides={})=>handleWorkbenchRequest(new Request(origin+'/api/workbench',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Workbench-CSRF':csrf,...overrides.headers},body:JSON.stringify(payload)}),{...deps,...overrides.dependencies});
  const counts=()=>Object.fromEntries(['projects','runs','analysis_jobs','qa_reservations','qa_canary','qa_window'].map(name=>[name,db.sql.prepare(`SELECT count(*) n FROM workbench_${name}`).get().n]));
  return {db,user,env,deps,guard,calls,request,counts,payload:action=>({action,qaClosedCheck:true,repositoryId:fixtures[actor].repositoryId,installationId:fixtures[actor].installationId})};
}
test('A and B closed checks execute the real gates, preserve counts, never acquire SHA/code or write processing',async t=>{
  for(const actor of [0,1]){
    const f=fixture(t,{actor}),before=f.counts();
    const pre=await f.request({action:'qa-closed-check'}),p=await pre.json();assert.equal(pre.status,200);assert.deepEqual(p.check.fixture,{repositoryId:21+actor,installationId:11+actor});
    const prep=await f.request(f.payload('catalog-authorize')),p1=await prep.json();assert.equal(prep.status,403);assert.equal(p1.code,'qa_closed');assert.equal(p1.qa_check.action,'catalog-authorize');assert.equal(p1.qa_check.source_revision,source);
    const queued=await f.request(f.payload('enqueue-job')),p2=await queued.json();assert.equal(queued.status,503);assert.equal(p2.error,'A execução por jobs não está ativada neste ambiente.');assert.equal(p2.code,undefined);assert.equal(p2.qa_check.action,'enqueue-job');assert.ok(Number.isFinite(Date.parse(p2.qa_check.checked_at)));
    assert.equal(queued.headers.get('Cache-Control'),'no-store');assert.deepEqual(f.counts(),before);assert.deepEqual(f.calls,{metadata:3,acquisition:0,dispatch:0,writes:0});
    // No projectId/revision was fabricated: the existing jobs gate precedes them.
    assert.equal(Object.hasOwn(f.payload('enqueue-job'),'projectId'),false);
  }
});
test('anonymous, expired session, invalid CSRF and wrong principal cannot obtain a closed-check receipt',async t=>{
  const f=fixture(t);
  for(const overrides of [{dependencies:{getUser:async()=>null}},{dependencies:{getUser:async()=>({})}},{headers:{'X-Workbench-CSRF':'wrong'}},{dependencies:{getUser:async()=>({...f.user,userId:'other-owner'})}}]){
    const r=await f.request(f.payload('catalog-authorize'),overrides);assert.ok([401,403].includes(r.status));assert.equal((await r.json()).qa_check,undefined);
  }
  assert.equal(f.calls.metadata,0);assert.equal(f.calls.acquisition,0);assert.equal(f.calls.writes,0);
});
test('cross-account fixtures, malformed input and non-QA access are denied on the server before metadata',async t=>{
  const f=fixture(t);
  for(const patch of [{repositoryId:fixtures[1].repositoryId,installationId:fixtures[1].installationId},{repositoryId:-1},{qaClosedCheck:false},{url:'https://untrusted.invalid'},{action:'report'}]){
    const r=await f.request({...f.payload('catalog-authorize'),...patch});assert.ok([400,403].includes(r.status));assert.equal((await r.json()).qa_check,undefined);
  }
  const outside=fixture(t,{enabled:false});assert.equal((await outside.request({action:'qa-closed-check'})).status,403);
  const wrongOrigin=fixture(t);wrongOrigin.env.WORKBENCH_ORIGIN='https://production.synthetic.invalid';assert.equal((await wrongOrigin.request({action:'qa-closed-check'})).status,403);assert.equal(wrongOrigin.calls.metadata,0);
  assert.equal(f.calls.metadata+outside.calls.metadata,0);
});
test('open/unknown processing flags, active QA and unavailable state stop before either negative',async t=>{
  const f=fixture(t);f.env.WORKBENCH_JOBS_ENABLED='unknown';assert.equal((await f.request({action:'qa-closed-check'})).status,409);
  f.env.WORKBENCH_JOBS_ENABLED='false';
  const start=Date.now();f.db.sql.prepare('INSERT INTO workbench_qa_canary VALUES (1,?,?,?,?,NULL)').run(start,start+900000,JSON.stringify(fixtures.map(f=>({...f,revision:'a'.repeat(40)}))),source);
  assert.equal((await f.request({action:'qa-closed-check'})).status,409);assert.equal(f.calls.metadata,0);
  const open=fixture(t,{jobs:true});assert.equal((await open.request(open.payload('enqueue-job'))).status,403);assert.equal(open.calls.metadata,0);
  const unknown=fixture(t,{guardOverride:{closedCheck:async()=>{throw Error('unknown storage');}}});assert.equal((await unknown.request({action:'qa-closed-check'})).status,500);assert.equal(unknown.calls.metadata,0);
});
test('unexpected allowance or access mismatch stops without acquisition; duplicate negatives remain harmless',async t=>{
  const f=fixture(t,{guardOverride:{check:async()=>({})}});const unexpected=await f.request(f.payload('catalog-authorize'));assert.equal(unexpected.status,409);assert.match((await unexpected.json()).error,/passou inesperadamente/);assert.equal(f.calls.acquisition,0);
  const mismatch=fixture(t,{lookup:()=>({repository:{id:21,full_name:'unrelated/private'}})});const r=await mismatch.request({action:'qa-closed-check'});assert.equal(r.status,403);assert.equal(JSON.stringify(await r.json()).includes('unrelated'),false);
  const dup=fixture(t),before=dup.counts();for(let i=0;i<2;i++){assert.equal((await dup.request(dup.payload('catalog-authorize'))).status,403);assert.equal((await dup.request(dup.payload('enqueue-job'))).status,503);}
  assert.deepEqual(dup.counts(),before);assert.equal(dup.calls.acquisition+dup.calls.dispatch+dup.calls.writes,0);
});

test('real App auth/client metadata transport stays actor-scoped and never calls commit/tree/blob during closed checks',async t=>{
  const s=await qaConsumerFixture(t,{origin});s.env.WORKBENCH_JOBS_ENABLED='false';
  s.db.sql.prepare('UPDATE workbench_qa_window SET closed_at=? WHERE id=1').run(s.now().valueOf());
  s.env.WORKBENCH_QA_CHECK_FIXTURES=JSON.stringify(Object.values(s.actors).map(a=>({githubId:a.githubId,repositoryId:a.repositoryId,installationId:a.installationId,repo:a.project.repo})));
  const app=createGitHubAppAuth({config:{enabled:true,origin:s.env.WORKBENCH_ORIGIN,appId:s.env.GITHUB_APP_ID,slug:s.env.GITHUB_APP_SLUG,clientId:s.env.GITHUB_APP_CLIENT_ID,clientSecret:s.env.GITHUB_APP_CLIENT_SECRET,encryptionKey:s.env.GITHUB_APP_TOKEN_KEY,keyVersion:'1'},db:s.db,fetcher:s.fetcher,now:s.now});
  const counts=()=>['projects','runs','analysis_jobs','qa_reservations','qa_canary','qa_window'].map(n=>s.db.sql.prepare(`SELECT count(*) n FROM workbench_${n}`).get().n),before=counts();
  for(const name of ['A','B']) {
    const a=s.actors[name],user={...a.user,csrfToken:csrf};
    const deps={getUser:async()=>user,getDb:async()=>s.db,authorizedOwnerId:s.env.WORKBENCH_OWNER_ID,accessPolicy:{multiUserEnabled:true,githubOwnerId:s.actors.A.githubId,workbenchOwnerId:s.env.WORKBENCH_OWNER_ID,allowedGitHubIds:QA_ALLOWED_GITHUB_IDS},githubApp:app,jobsEnabled:false,dispatchJob:async()=>{throw Error('No dispatch permitted');},qaGuard:createQaGuard({env:s.env,now:s.now}),now:s.now};
    for(const action of ['qa-closed-check','catalog-authorize','enqueue-job']) {
      const body=action==='qa-closed-check'?{action}:{action,qaClosedCheck:true,repositoryId:a.repositoryId,installationId:a.installationId};
      const r=await handleWorkbenchRequest(new Request(s.env.WORKBENCH_ORIGIN+'/api/workbench',{method:'POST',headers:{Origin:s.env.WORKBENCH_ORIGIN,'Content-Type':'application/json','X-Workbench-CSRF':csrf},body:JSON.stringify(body)}),deps);
      assert.equal(r.status,action==='qa-closed-check'?200:action==='catalog-authorize'?403:503);
    }
  }
  assert.deepEqual(counts(),before);assert.equal(s.calls.length,18);assert.ok(s.calls.every(c=>['identity','installations','repositories'].includes(c.stage)));
  assert.equal(s.calls.filter(c=>c.actor==='A').length,9);assert.equal(s.calls.filter(c=>c.actor==='B').length,9);
});
