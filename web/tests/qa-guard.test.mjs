import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {migratedDatabase} from './helpers/d1-sqlite.mjs';
import {createQaGuard,qaFetchBudget,QA_LIMITS} from '../lib/qa-guard.mjs';
import {createAnalysisJobs} from '../lib/analysis-jobs.mjs';
import {createAnalysisConsumer} from '../workers/analysis-consumer.mjs';
import {createWorkbenchService} from '../lib/workbench-service.mjs';

const START=Date.parse('2026-10-22T12:00:00Z'), SHA='a'.repeat(40);
const A='171351708',B='322086368',ownerA='qa-primary',ownerB=`github:${B}`;
const fixtures=[{githubId:A,installationId:11,repositoryId:21,repo:'ofelipepeixoto/qa-fixture-a'},
  {githubId:B,installationId:12,repositoryId:22,repo:'radartech-news/qa-fixture-b'}];
function setup(t,{activate=true}={}) {
  const db=migratedDatabase();t.after(()=>db.close());let clock=START;
  const env={DB:db,WORKBENCH_QA_ENABLED:'true',WORKBENCH_OWNER_ID:ownerA,
    WORKBENCH_JOBS_ENABLED:'true',WORKBENCH_MULTIUSER_ENABLED:'true',GITHUB_APP_ENABLED:'true'};
  const now=()=>new Date(clock),guard=()=>createQaGuard({env,now});
  if(activate)db.sql.prepare('INSERT INTO workbench_qa_window VALUES (1,?,?,?,NULL)').run(START,START+7*86400000,JSON.stringify(fixtures));
  function actor(githubId) {
    const f=fixtures.find(f=>f.githubId===githubId),ownerId=githubId===A?ownerA:ownerB,project={id:randomUUID(),repository_id:f.repositoryId,installation_id:f.installationId,repo:f.repo};
    db.sql.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at,source,installation_id,visibility) VALUES (?,?,?,?,?,'github-app',?,'private')")
      .run(project.id,ownerId,project.repo,project.repository_id,new Date(START).toISOString(),project.installation_id);
    const jobs=createAnalysisJobs({db,ownerId,githubId,now,qaGuard:guard(),authorize:async()=>true,analyze:async()=>{throw Error('synthetic failure');},random:()=>0});
    return {ownerId,githubId,project,jobs,enqueue:(requestId=randomUUID())=>jobs.enqueue({project,requestId,revision:SHA,confirmed:true})};
  }
  return {db,env,guard,now,actor,advance:ms=>{clock+=ms;}};
}
test('QA stays off by default and requires explicit activation, exact identity and selected fixture',async t=>{
  const s=setup(t,{activate:false}),a=s.actor(A);
  assert.equal(createQaGuard({env:{}}),undefined);
  await assert.rejects(a.enqueue(),e=>e.code==='qa_closed');
  s.db.sql.prepare('INSERT INTO workbench_qa_window VALUES (1,?,?,?,NULL)').run(START,START+604800000,JSON.stringify(fixtures));
  const scope={ownerId:a.ownerId,githubId:A,repositoryId:21,installationId:11,repo:fixtures[0].repo};
  await s.guard().check(scope);
  for(const altered of [{githubId:B},{ownerId:ownerB},{repositoryId:22},{installationId:12},{repo:'ofelipepeixoto/unselected'}]) {
    await assert.rejects(s.guard().check({...scope,...altered}),e=>e.code==='qa_scope');
  }
});
test('50 jobs is a combined A/B durable quota; duplicates and cancellation cannot reset it',async t=>{
  const s=setup(t),a=s.actor(A),b=s.actor(B);let first;
  for(let n=0;n<50;n++) {
    const actor=n%2?a:b,request=randomUUID(),one=await actor.enqueue(request);
    assert.equal((await actor.enqueue(request)).job.id,one.job.id);
    await actor.jobs.cancel(one.job.id);first??=one;
  }
  assert.equal(s.db.sql.prepare('SELECT count(*) AS n FROM workbench_qa_reservations').get().n,50);
  await assert.rejects(a.enqueue(),e=>e.code==='qa_quota'&&e.status===429);
  await assert.rejects(b.enqueue(),e=>e.code==='qa_quota');
  assert.throws(()=>s.db.sql.prepare('DELETE FROM workbench_qa_reservations WHERE job_id=?').run(first.job.id),/retention/);
  s.advance(86400000);
  assert.equal((await a.enqueue()).job.status,'queued');
});
test('race for the last slot admits one job and rolls back both the other job and its run',async t=>{
  const s=setup(t),a=s.actor(A),b=s.actor(B);
  for(let n=0;n<49;n++){const x=await a.enqueue();await a.jobs.cancel(x.job.id);}
  const results=await Promise.allSettled([a.enqueue(),b.enqueue()]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'qa_quota');
  assert.equal(s.db.sql.prepare('SELECT count(*) AS n FROM workbench_runs').get().n,50);
});
test('a busy enqueue rolls back quota; a producer missing the QA dependency fails closed',async t=>{
  const s=setup(t),a=s.actor(A);await a.enqueue();
  await assert.rejects(a.enqueue(),e=>e.code==='busy');
  assert.equal(s.db.sql.prepare('SELECT count(*) AS n FROM workbench_qa_reservations').get().n,1);
  const b=s.actor(B),unguarded=createAnalysisJobs({db:s.db,ownerId:b.ownerId,githubId:B,now:s.now});
  await assert.rejects(unguarded.enqueue({project:b.project,requestId:randomUUID(),revision:SHA,confirmed:true}));
  assert.equal(s.db.sql.prepare('SELECT count(*) AS n FROM workbench_runs').get().n,1);
});
test('immutable seven-day window has seven 24h buckets and cannot restart on redeploy',async t=>{
  const s=setup(t),a=s.actor(A);
  s.advance(604800000-1);assert.equal((await s.guard().window()).day,6);
  s.advance(1);await assert.rejects(a.enqueue(),e=>e.code==='qa_closed');
  assert.throws(()=>s.db.sql.prepare('UPDATE workbench_qa_window SET starts_at=starts_at+1,ends_at=ends_at+1').run(),/immutable/);
  assert.throws(()=>s.db.sql.prepare('DELETE FROM workbench_qa_window').run(),/retention/);
});
test('queue dispatch is atomic, paced and capped even when sends fail ambiguously',async t=>{
  const s=setup(t),a=s.actor(A),{job}=await a.enqueue();let sends=0;
  const send=async()=>{sends++;};
  const results=await Promise.all([s.guard().dispatch(job.id,send),s.guard().dispatch(job.id,send)]);
  assert.equal(results.filter(Boolean).length,1);assert.equal(sends,1);
  for(let n=0;n<2;n++){s.advance(60000);await assert.rejects(s.guard().dispatch(job.id,async()=>{sends++;throw Error('synthetic failure');}));}
  s.advance(60000);assert.equal(await s.guard().dispatch(job.id,send),false);assert.equal(sends,3);
  s.advance(604800000);await assert.rejects(s.guard().dispatch(job.id,send),e=>e.code==='qa_closed');assert.equal(sends,3);
});
test('closed QA scheduler sends nothing and consumer never calls GitHub or analyzer',async t=>{
  const s=setup(t),a=s.actor(A),{job}=await a.enqueue();let calls=0;
  s.env.ANALYSIS_QUEUE={send:async()=>{calls++;}};
  const consumer=createAnalysisConsumer({env:s.env,now:s.now,appAuthFactory:()=>{calls++;throw Error('must not run');}});
  s.advance(604800000);
  assert.equal(await consumer.recover(),0);
  await assert.rejects(consumer.process(job.id),e=>e.code==='qa_closed');assert.equal(calls,0);
});
test('closing during acquisition prevents result commit and retry',async t=>{
  const s=setup(t),a=s.actor(A),{job}=await a.enqueue();
  const jobs=createAnalysisJobs({db:s.db,ownerId:a.ownerId,githubId:A,now:s.now,qaGuard:s.guard(),authorize:async()=>true,
    analyze:async()=>{s.db.sql.prepare('UPDATE workbench_qa_window SET closed_at=?').run(START);return {};}});
  const done=await jobs.process(job.id);
  assert.equal(done.job.status,'failed');assert.equal(done.job.failure_code,'qa_closed');assert.equal(done.job.attempts,1);
  assert.equal(s.db.sql.prepare('SELECT result_json FROM workbench_runs WHERE id=?').get(job.run_id).result_json,null);
});
test('QA denies legacy scans, REA import and permanent deletion before scanner access',async t=>{
  const s=setup(t),a=s.actor(A),service=createWorkbenchService({db:s.db,ownerId:a.ownerId,user:{userId:a.ownerId,githubId:A},qaGuard:s.guard(),now:s.now,scanner:{}});
  for(const action of ['scan','inspect','authorize','import-rea','delete-project'])await assert.rejects(service.act({action}),e=>e.code==='qa_scope');
});
test('transport shares request/byte budget, rejects paid providers and never follows redirects',async()=>{
  let calls=0;
  const transport=qaFetchBudget(async(_url,init)=>{assert.equal(init.redirect,'manual');calls++;return new Response('{}');},{endsAt:Date.now()+60000});
  for(let n=0;n<QA_LIMITS.fetchesPerAttempt;n++)await transport('https://api.github.com/user');
  await assert.rejects(transport('https://api.github.com/user'),e=>e.code==='qa_consumption');
  assert.equal(calls,QA_LIMITS.fetchesPerAttempt);
  await assert.rejects(transport('https://api.openai.com/v1/responses'),e=>e.code==='qa_consumption');
  const large=qaFetchBudget(async()=>new Response(new Uint8Array(QA_LIMITS.bytesPerAttempt+1)),{endsAt:Date.now()+60000});
  await assert.rejects(large('https://api.github.com/user'),e=>e.code==='qa_consumption');
});
test('A cannot read/cancel B job or use its project ID; quota errors contain no other user data',async t=>{
  const s=setup(t),a=s.actor(A),b=s.actor(B),{job}=await b.enqueue();
  await assert.rejects(a.jobs.get(job.id),e=>e.status===404&&!e.message.includes(b.project.repo));
  await assert.rejects(a.jobs.cancel(job.id),e=>e.status===404);
  await assert.rejects(a.jobs.enqueue({project:b.project,revision:SHA,requestId:randomUUID(),confirmed:true}),e=>e.status===404);
  assert.equal((await b.jobs.get(job.id)).job.status,'queued');
});
test('D1 refuses claims and result writes after shutdown even if a consumer omits the QA flag',async t=>{
  const s=setup(t),a=s.actor(A),{job}=await a.enqueue();let calls=0;
  s.db.sql.prepare('UPDATE workbench_qa_window SET closed_at=?').run(START);
  const unguarded=createAnalysisJobs({db:s.db,ownerId:a.ownerId,githubId:A,now:s.now,
    authorize:async()=>{calls++;return true;},analyze:async()=>{calls++;}});
  await assert.rejects(unguarded.process(job.id),e=>e.code==='storage_unavailable');
  assert.equal(calls,0);
  assert.throws(()=>s.db.sql.prepare('UPDATE workbench_runs SET result_json=? WHERE id=?').run('{}',job.run_id),/QA result denied/);
  assert.equal(s.db.sql.prepare('SELECT result_json FROM workbench_runs WHERE id=?').get(job.run_id).result_json,null);
});
