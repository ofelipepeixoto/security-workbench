import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {migratedDatabase} from './helpers/d1-sqlite.mjs';
import {qaConsumerFixture,ACTORS,REVISION} from './helpers/qa-consumer-fixture.mjs';
import {createQaGuard} from '../lib/qa-guard.mjs';

// Real local SQL/scanner/Queue-handler code with synthetic transport. These are
// contract tests, not measurement of hosted CPU, Cloudflare usage or OAuth.
const fixture=()=>[{githubId:ACTORS.A.githubId,repositoryId:21,installationId:11,repo:'ofelipepeixoto/synthetic-fixture',revision:REVISION}];
test('actual INSERT refuses stale/future/closed or incomplete opening and never creates a formal window during migration',t=>{
 const db=migratedDatabase();t.after(()=>db.close());const now=Date.now();
 const insert=(start,items=fixture(),closed=null)=>db.sql.prepare('INSERT INTO workbench_qa_window VALUES (1,?,?,?,?)').run(start,start+604800000,JSON.stringify(items),closed);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM workbench_qa_active_window').get().n,0);
 for(const start of [1000,now-5001,now+6000])assert.throws(()=>insert(start),/opening denied/);
 for(const items of [[],[{}],[{...fixture()[0],githubId:'999'}],[{...fixture()[0],repositoryId:'21'}],[{...fixture()[0],revision:'bad'}],[{...fixture()[0],installationId:0}]])assert.throws(()=>insert(now,items),/opening denied/);
 assert.throws(()=>insert(now,fixture(),now),/opening denied/);
 insert(Date.now());assert.throws(()=>insert(Date.now()),/UNIQUE/);
 assert.throws(()=>db.sql.prepare('DELETE FROM workbench_qa_window').run(),/retention/);
});
test('canary is bound to deployed candidate, capped at two total A/B jobs and uses the real local acquisition pipeline',async t=>{
 const s=await qaConsumerFixture(t,{canary:true,files:1});
 assert.equal(s.db.sql.prepare('SELECT count(*) n FROM workbench_qa_window').get().n,0);
 for(const name of ['A','B']) {
  const {job}=await s.actors[name].enqueue();
  const result=await s.consumer.process(job.id);assert.equal(result.job.status,'complete');
  await assert.rejects(s.actors[name].enqueue(),e=>e.code==='qa_quota');
 }
 assert.equal(s.reservations(),2);
 await assert.rejects(s.actors.A.enqueue(),e=>e.code==='qa_quota');
 await assert.rejects(s.actors.B.enqueue(),e=>e.code==='qa_quota');
 const changed=createQaGuard({env:{...s.env,WORKBENCH_QA_SOURCE_SHA:'e'.repeat(40)},now:s.now});
 await assert.rejects(changed.window(),e=>e.code==='qa_scope');
 assert.throws(()=>s.db.sql.prepare('UPDATE workbench_qa_canary SET source_sha=?').run('e'.repeat(40)),/immutable/);
 assert.throws(()=>s.db.sql.prepare('DELETE FROM workbench_qa_canary').run(),/retention/);
});
test('canary revision and scope cannot be widened; listing policies reads one snapshot for one hundred metadata rows',async t=>{
 const s=await qaConsumerFixture(t,{canary:true,files:1}),a=s.actors.A;
 await assert.rejects(a.jobs.enqueue({project:a.project,revision:'c'.repeat(40),requestId:randomUUID(),confirmed:true}),e=>e.code==='qa_scope');
 assert.equal(s.reservations(),0);
 const guard=createQaGuard({env:s.env,now:s.now});
 const repositories=Array.from({length:100},(_,i)=>({repositoryId:i===0?21:100+i,installationId:11,repo:i===0?a.project.repo:`ofelipepeixoto/repo-${i}`}));
 const before=s.d1.reads,policy=await guard.catalogPolicies({ownerId:a.ownerId,githubId:a.githubId,repositories});
 assert.equal(s.d1.reads-before,1);assert.equal(policy[0].can_analyze,true);assert.equal(policy.filter(p=>p.can_analyze).length,1);
 assert.equal(JSON.stringify(policy).includes(a.project.repo),false);
 const denied=await guard.catalogPolicies({ownerId:a.ownerId,githubId:ACTORS.B.githubId,repositories});
 assert.equal(denied.some(p=>p.can_analyze),false);
});
test('closing a canary cannot reopen it; formal opening requires closure and never reuses a canary job',async t=>{
 const s=await qaConsumerFixture(t,{canary:true}),a=s.actors.A,{job}=await a.enqueue();
 const row=s.db.sql.prepare('SELECT * FROM workbench_qa_canary').get();
 assert.throws(()=>s.db.sql.prepare('INSERT INTO workbench_qa_window VALUES (1,?,?,?,NULL)').run(Date.now(),Date.now()+604800000,row.fixtures_json));
 s.db.sql.prepare('UPDATE workbench_qa_canary SET closed_at=?').run(Date.now());
 assert.throws(()=>s.db.sql.prepare('UPDATE workbench_qa_canary SET closed_at=NULL').run(),/immutable/);
 const stamp=Date.now()+1;
 s.db.sql.prepare('INSERT INTO workbench_qa_window VALUES (1,?,?,?,NULL)').run(stamp,stamp+604800000,row.fixtures_json);
 s.advance(stamp-row.starts_at);
 const guard=createQaGuard({env:s.env,now:s.now});
 await assert.rejects(guard.checkJob(s.db.sql.prepare('SELECT * FROM workbench_analysis_jobs WHERE id=?').get(job.id)),e=>e.code==='qa_closed');
 assert.equal(s.reservations(),1,'promotion must retain already consumed admission');
});

test('switching the active interval after final authorization cannot persist the older canary result',async t=>{
 const s=await qaConsumerFixture(t,{canary:true}),{job}=await s.actors.A.enqueue();
 const batch=s.db.batch.bind(s.db);let count=0,clock;
 // Test-only clock controls a SQL race; this is not elapsed hosted observation.
 s.db.sql.function('julianday',value=>{const ms=value==='now'?(clock??Date.now()):Date.parse(value);return Number.isFinite(ms)?2440587.5+ms/86400000:null;});
 s.db.batch=async statements=>{
  if(++count===2){
   const claim=s.db.sql.prepare('SELECT updated_at FROM workbench_analysis_jobs WHERE id=?').get(job.id);
   clock=Date.parse(claim.updated_at)+20;
   const canary=s.db.sql.prepare('SELECT * FROM workbench_qa_canary').get(),start=clock-10;
   s.db.sql.prepare('UPDATE workbench_qa_canary SET closed_at=?').run(clock);
   s.db.sql.prepare('INSERT INTO workbench_qa_window VALUES (1,?,?,?,NULL)').run(start,start+604800000,canary.fixtures_json);
   s.advance(clock-s.now().valueOf());
  }
  return batch(statements);
 };
 const done=await s.consumer.process(job.id);
 assert.equal(done.job.status,'failed');assert.equal(done.job.failure_code,'qa_closed');
 assert.equal(s.stored(job).result_json,null);assert.equal(s.reservations(),1);
 const stamp=new Date(clock).toISOString();
 assert.throws(()=>s.db.sql.prepare('UPDATE workbench_runs SET result_json=?,updated_at=? WHERE id=?').run('{}',stamp,job.run_id),/QA result denied/);
});
