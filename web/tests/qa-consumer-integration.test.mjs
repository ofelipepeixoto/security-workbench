import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubAppClient} from '../lib/github-app-client.mjs';
import {createGitHubAppAuth,connectionPersistenceFence} from '../lib/github-app-auth.mjs';
import {createWorkbenchService} from '../lib/workbench-service.mjs';
import {qaFetchBudget,QA_LIMITS} from '../lib/qa-guard.mjs';
import {recoverAnalysisJobs} from '../lib/analysis-jobs.mjs';
import queueWorker from '../workers/analysis-consumer.mjs';
import {qaConsumerFixture,ACTORS,REVISION,START,deferred} from './helpers/qa-consumer-fixture.mjs';

// Any accidental fallback to the host's real fetch fails the test, before I/O.
globalThis.fetch=async()=>{throw Error('Network forbidden in QA integration fixtures');};
const result=(s,job)=>{const row=s.stored(job);assert.notEqual(row.result_json,null);return JSON.parse(row.result_json);};
const noResult=(s,job)=>assert.equal(s.stored(job).result_json,null);

test('real auth/client/guard/consumer/scanner completes both owners with headroom; delivery and objects remain scoped',async t=>{
  const s=await qaConsumerFixture(t,{files:2});
  const completed=[];
  for(const name of ['A','B']) {
    const a=s.actors[name],before=s.calls.length,{job}=await a.enqueue();
    assert.equal((await s.consumer.process(job.id)).job.status,'complete');
    const sent=s.calls.slice(before);
    assert.ok(sent.length<=14,`two files must leave headroom, got ${sent.length}`);
    assert.equal(sent.filter(e=>e.stage==='identity').length,1);
    assert.ok(sent.every(e=>e.actor===name));
    assert.equal(sent.filter(e=>e.stage==='commit').length,3,'entry, after acquisition, before result commit');
    const stored=result(s,job);assert.equal(stored.files_read,2);assert.equal(stored.repository_id,a.repositoryId);
    assert.equal(stored.revision,REVISION);assert.equal(stored.partial,false);
    assert.equal(stored.findings.length,2);assert.ok(!JSON.stringify(stored).includes('invalid_synthetic_marker'));
    assert.equal((await s.consumer.process(job.id)).job.status,'complete');assert.equal(s.calls.length,before+sent.length);
    completed.push(job);
  }
  assert.equal(s.reservations(),2);
  for(const [name,index] of [['A',1],['B',0]]) {
    const a=s.actors[name],other=completed[index];
    const service=createWorkbenchService({db:s.db,ownerId:a.ownerId,user:a.user,
      githubApp:{enabled:true,getClient:async()=>{throw Error('cross-owner objects must be denied before provider');}}});
    for(const payload of [{action:'run',runId:other.run_id},{action:'report',runId:other.run_id},
      {action:'review',runId:other.run_id,fingerprint:'unknown',decision:'false_positive'},
      {action:'compare',before:other.run_id,after:completed[1-index].run_id}]) {
      await assert.rejects(service.act(payload),e=>e.status===404&&!e.message.includes('synthetic-fixture'));
    }
    await assert.rejects(a.jobs.get(other.id),e=>e.status===404);
    await assert.rejects(a.jobs.cancel(other.id),e=>e.status===404);
    await assert.rejects(a.jobs.enqueue({project:s.actors[name==='A'?'B':'A'].project,revision:REVISION,requestId:crypto.randomUUID(),confirmed:true}),e=>e.status===404);
  }
});

test('one-file minimum succeeds and a second repository page remains complete, not silently skipped',async t=>{
  for(const options of [{files:1},{files:2,repositoryPage:2},{files:2,installationPage:2}]) {
    const s=await qaConsumerFixture(t,options),{job}=await s.actors.A.enqueue();
    assert.equal((await s.consumer.process(job.id)).job.status,'complete');
    assert.equal(result(s,job).files_read,options.files);
    assert.equal(result(s,job).partial,false);
    assert.ok(s.calls.length<=16);
    if(options.repositoryPage===2)assert.equal(s.calls.filter(e=>e.stage==='repositories'&&e.page===2).length,3);
    if(options.installationPage===2)assert.equal(s.calls.filter(e=>e.stage==='installations'&&e.page===2).length,3);
  }
});

test('larger fixture stops before the reserved final checks, explicitly reports partial acquisition and keeps the 20-file ceiling honest',async t=>{
  const s=await qaConsumerFixture(t,{files:8}),{job}=await s.actors.A.enqueue();
  assert.equal((await s.consumer.process(job.id)).job.status,'complete');
  const stored=result(s,job);
  assert.ok(stored.files_read>=2&&stored.files_read<8);assert.equal(stored.partial,true);
  assert.match(stored.omissions.join(' '),/orçamento|requisições|aquisição.*QA/i);
  assert.equal(stored.coverage.acquisition_budget.requests_limit,16);
  assert.equal(stored.coverage.acquisition_budget.omitted_files,8-stored.files_read);
  assert.ok(s.calls.length<=16);assert.equal(s.calls.filter(e=>e.stage==='commit').length,3);
});

test('both installation and repository pagination consume the same budget and refuse unknown coverage safely',async t=>{
  const s=await qaConsumerFixture(t,{files:3,installationPage:2,repositoryPage:2}),{job}=await s.actors.A.enqueue();
  const done=await s.consumer.process(job.id);
  assert.ok(s.calls.length<=16);
  if(done.job.status==='complete') {
    const stored=result(s,job);assert.equal(stored.partial,true);assert.ok(stored.files_read<3);
    assert.match(stored.omissions.join(' '),/orçamento|requisições|aquisição.*QA/i);
    assert.equal(s.calls.filter(e=>e.stage==='commit').length,3);
  } else {assert.equal(done.job.failure_code,'qa_consumption');assert.equal(done.job.attempts,1);noResult(s,job);}
});

test('the 17th attempted request is blocked before transport and retains its typed cause through a real client',async()=>{
  let sent=0;const events=[];
  const budget=qaFetchBudget(async()=>{sent++;return Response.json({id:Number(ACTORS.A.githubId),login:ACTORS.A.login});},
    {endsAt:Date.now()+60000,observe:e=>events.push(e)});
  const client=createGitHubAppClient({accessToken:'ghu_SYNTHETIC_ONLY_NEVER_VALID',expectedGitHubId:ACTORS.A.githubId,appId:123,fetcher:budget});
  for(let n=0;n<16;n++)await client.getIdentity();
  await assert.rejects(client.getIdentity(),e=>e.code==='qa_consumption');
  assert.equal(sent,16);assert.equal(budget.stats().attempted,17);assert.equal(budget.stats().sent,16);
  assert.equal(budget.stats().remaining,0);
  assert.ok(events.some(e=>e.code==='qa_consumption'));
});

test('pagination growth after acquisition exhausts the common budget once, never persists or retries a deterministic failure',async t=>{
  const s=await qaConsumerFixture(t,{files:4,onRequest:({entry,state})=>{if(entry.stage==='blob')state.repositoryPage=2;}});
  const {job}=await s.actors.A.enqueue(),done=await s.consumer.process(job.id);
  assert.equal(done.job.status,'failed');assert.equal(done.job.failure_code,'qa_consumption');assert.equal(done.job.attempts,1);
  noResult(s,job);assert.equal(s.reservations(),1);const calls=s.calls.length;
  await s.consumer.process(job.id);assert.equal(s.calls.length,calls);
});

for(const change of ['revoked','suspended','contents','pull','renamed','private','shaChanged']) {
  test(`fresh authorization rejects ${change} changed during blob acquisition`,async t=>{
    const s=await qaConsumerFixture(t,{onRequest:({entry,state})=>{
      if(entry.stage==='blob')state[change]=change==='contents'?'none':change==='pull'||change==='private'?false:true;
    }});
    const {job}=await s.actors.A.enqueue(),done=await s.consumer.process(job.id);
    assert.notEqual(done.job.status,'complete');noResult(s,job);
    assert.ok(s.calls.some(e=>e.stage==='blob'));assert.ok(s.calls.filter(e=>e.stage==='installations').length>=2);
    assert.ok(s.calls.length<=16);
  });
}

for(const change of ['revoked','renamed','private']) {
  test(`the final job gate rejects ${change} after the scanner exit check already passed`,async t=>{
    let commits=0;
    const s=await qaConsumerFixture(t,{onRequest:({entry,state})=>{
      if(entry.stage==='commit')commits++;
      if(entry.stage==='installations'&&commits===2)state[change]=change==='private'?false:true;
    }});
    const {job}=await s.actors.A.enqueue(),done=await s.consumer.process(job.id);
    assert.equal(done.job.status,'failed');assert.equal(done.job.failure_code,'access_revoked');
    assert.ok(commits>=2);noResult(s,job);
  });
}

for(const localChange of ['disconnect','expire','close']) {
  test(`local ${localChange} at acquisition prevents stale context from committing`,async t=>{
    const s=await qaConsumerFixture(t,{onRequest:({entry,db,actors})=>{
      if(entry.stage!=='blob')return;
      if(localChange==='disconnect')db.sql.prepare('DELETE FROM workbench_github_app_connections WHERE owner_id=?').run(actors.A.ownerId);
      else if(localChange==='expire')db.sql.prepare('UPDATE workbench_github_app_connections SET expires_at=? WHERE owner_id=?').run(START/1000-1,actors.A.ownerId);
      else db.sql.prepare('UPDATE workbench_qa_window SET closed_at=? WHERE id=1').run(START);
    }});
    const {job}=await s.actors.A.enqueue(),done=await s.consumer.process(job.id);
    assert.equal(done.job.status,'failed');noResult(s,job);assert.equal(s.reservations(),1);
    assert.ok(['access_revoked','qa_closed'].includes(done.job.failure_code));
  });
}

test('a provider identity mismatch cannot acquire a tree or disclose another principal',async t=>{
  const s=await qaConsumerFixture(t);s.state.wrongIdentity=true;
  const {job}=await s.actors.A.enqueue(),done=await s.consumer.process(job.id);
  assert.equal(done.job.failure_code,'access_revoked');assert.equal(s.calls.length,1);noResult(s,job);
});

test('429 Retry-After is durable, no early retry, capped attempts and unchanged admission quota',async t=>{
  const s=await qaConsumerFixture(t,{onRequest:({entry})=>entry.stage==='blob'?new Response('{}',{status:429,headers:{'Retry-After':'120','X-RateLimit-Remaining':'0'}}):undefined});
  const {job}=await s.actors.A.enqueue(),one=await s.consumer.process(job.id);
  assert.equal(one.job.status,'queued');assert.equal(one.job.failure_code,'github_rate_limited');
  assert.ok(Date.parse(one.job.retry_at)>=START+120000);
  const sent=s.calls.length;await s.consumer.process(job.id);assert.equal(s.calls.length,sent);
  s.advance(Date.parse(one.job.available_at)-s.now().valueOf()+1);
  const two=await s.consumer.process(job.id);assert.equal(two.job.status,'failed');assert.equal(two.job.attempts,2);
  assert.equal(two.job.failure_code,'github_rate_limited');assert.equal(s.reservations(),1);noResult(s,job);
});

test('a 503 is retried with backoff and a new attempt can recover without freeing quota',async t=>{
  let failures=1;
  const s=await qaConsumerFixture(t,{onRequest:({entry})=>entry.stage==='blob'&&failures-->0?new Response('{}',{status:503}):undefined});
  const {job}=await s.actors.A.enqueue(),one=await s.consumer.process(job.id);
  assert.equal(one.job.status,'queued');assert.equal(one.job.failure_code,'acquisition_failed');
  assert.ok(Date.parse(one.job.available_at)>=START+60000);
  s.advance(Date.parse(one.job.available_at)-s.now().valueOf()+1);
  const two=await s.consumer.process(job.id);assert.equal(two.job.status,'complete');assert.equal(two.job.attempts,2);
  assert.equal(s.calls.filter(e=>e.stage==='identity').length,2,'context cannot survive an attempt');
  assert.equal(s.reservations(),1);
});

test('real scanner cancellation stops further provider operations and fences a late blob without duplicate effects',async t=>{
  const started=deferred(),release=deferred();
  const s=await qaConsumerFixture(t,{onRequest:async({entry})=>{if(entry.stage==='blob'){started.resolve();await release.promise;}}});
  const {job}=await s.actors.A.enqueue(),work=s.consumer.process(job.id);await started.promise;
  const sent=s.calls.length;
  assert.equal((await s.consumer.process(job.id)).job.attempts,1);assert.equal(s.calls.length,sent);
  await s.actors.A.jobs.cancel(job.id);release.resolve();
  assert.equal((await work).job.status,'cancelled');noResult(s,job);assert.equal(s.reservations(),1);
  assert.equal(s.calls.length,sent,'no provider request after the cancellation is observed');
});

test('cancellation during installation pagination stops before the following repository or commit request',async t=>{
  const started=deferred(),release=deferred();
  const s=await qaConsumerFixture(t,{onRequest:async({entry,init})=>{
    if(entry.stage==='installations'){assert.ok(init.signal);started.resolve();await release.promise;}
  }});
  const {job}=await s.actors.A.enqueue(),work=s.consumer.process(job.id);await started.promise;
  const sent=s.calls.length;await s.actors.A.jobs.cancel(job.id);release.resolve();
  assert.equal((await work).job.status,'cancelled');assert.equal(s.calls.length,sent);
  // The completed request's child signal can be closed already; cancellation
  // must stop the next operation, not retroactively abort that completed child.
  noResult(s,job);
});

test('interleaved A/B executions use separate contexts, provider identities, grants and persisted results',async t=>{
  const barriers={A:{started:deferred(),release:deferred()},B:{started:deferred(),release:deferred()}};
  const s=await qaConsumerFixture(t,{onRequest:async({entry})=>{
    if(entry.stage==='blob'){const gate=barriers[entry.actor];gate.started.resolve();await gate.release.promise;}
  }});
  const a=await s.actors.A.enqueue(),b=await s.actors.B.enqueue();
  const workA=s.consumer.process(a.job.id);await barriers.A.started.promise;
  const workB=s.consumer.process(b.job.id);await barriers.B.started.promise;
  barriers.B.release.resolve();assert.equal((await workB).job.status,'complete');
  barriers.A.release.resolve();assert.equal((await workA).job.status,'complete');
  assert.equal(result(s,a.job).repository_id,21);assert.equal(result(s,b.job).repository_id,22);
  assert.equal(s.calls.filter(e=>e.actor==='A'&&e.stage==='identity').length,1);
  assert.equal(s.calls.filter(e=>e.actor==='B'&&e.stage==='identity').length,1);assert.equal(s.reservations(),2);
});

test('expired execution recovers with a new lease/context and fences a late real scanner result',async t=>{
  const started=deferred(),release=deferred();let held=false;
  const s=await qaConsumerFixture(t,{onRequest:async({entry})=>{
    if(entry.stage==='blob'&&!held){held=true;started.resolve();await release.promise;}
  }});
  const {job}=await s.actors.A.enqueue(),old=s.consumer.process(job.id);await started.promise;
  s.advance(60001);
  const recovered=await recoverAnalysisJobs({db:s.db,now:s.now});
  assert.equal(recovered.length,1);assert.equal(recovered[0].id,job.id);
  assert.equal((await s.consumer.process(job.id)).job.status,'complete');
  const committed=s.stored(job).result_json;release.resolve();await old;
  assert.equal(s.stored(job).result_json,committed);assert.equal(s.reservations(),1);
  assert.equal((await s.actors.A.jobs.get(job.id)).job.attempts,2);
});

test('45s timeout aborts the propagated signal and late provider completion cannot persist',async t=>{
  const started=deferred(),release=deferred();let signal;
  const s=await qaConsumerFixture(t,{onRequest:async({entry,init})=>{if(entry.stage==='blob'){signal=init.signal;started.resolve();await release.promise;}}});
  t.mock.timers.enable({apis:['setTimeout']});
  const {job}=await s.actors.A.enqueue(),work=s.consumer.process(job.id);await started.promise;
  t.mock.timers.tick(45000);
  const done=await work;assert.equal(done.job.failure_code,'acquisition_timeout');assert.equal(signal.aborted,true);
  release.resolve();await new Promise(resolve=>setImmediate(resolve));noResult(s,job);
});

test('separate contexts cannot share a one-use acquisition capability or retain it after a refresh',async t=>{
  const s=await qaConsumerFixture(t),auth=createGitHubAppAuth({config:{enabled:true,origin:s.env.WORKBENCH_ORIGIN,appId:123,
    slug:s.env.GITHUB_APP_SLUG,clientId:s.env.GITHUB_APP_CLIENT_ID,clientSecret:s.env.GITHUB_APP_CLIENT_SECRET,
    encryptionKey:s.env.GITHUB_APP_TOKEN_KEY,keyVersion:'1'},db:s.db,fetcher:s.fetcher,now:s.now});
  const a=await auth.getClient(s.actors.A.user),b=await auth.getClient(s.actors.B.user);
  const options={installationId:11,repositoryId:21,revision:REVISION},proof=await a.authorizeForAcquisition(options);
  assert.throws(()=>b.consumeAcquisitionAuthorization(proof.ticket,options),e=>e.status===403);
  assert.throws(()=>a.consumeAcquisitionAuthorization({},options),e=>e.status===403);
  assert.equal(a.consumeAcquisitionAuthorization(proof.ticket,options).repository.id,21);
  assert.throws(()=>a.consumeAcquisitionAuthorization(proof.ticket,options),e=>e.status===403);
  const newer=await a.authorizeForAcquisition(options);s.state.revoked=true;
  await assert.rejects(a.authorizeRepository(options),e=>e.status===403);
  assert.throws(()=>a.consumeAcquisitionAuthorization(newer.ticket,options),e=>e.status===403);
});

test('the actual Queue path acknowledges an integrated consumption failure without retrying or persisting',async t=>{
  const s=await qaConsumerFixture(t,{files:4,onRequest:({entry,state})=>{if(entry.stage==='blob')state.repositoryPage=2;}});
  const {job}=await s.actors.A.enqueue();
  t.mock.timers.enable({apis:['Date'],now:START});
  let ack=0,retry=0;
  const blockedFetch=globalThis.fetch;
  try {
    globalThis.fetch=s.fetcher;
    await queueWorker.queue({messages:[{body:{jobId:job.id},ack(){ack++;},retry(){retry++;}}]},s.env);
  } finally {globalThis.fetch=blockedFetch;}
  assert.equal(ack,1);assert.equal(retry,0);assert.equal(s.calls.length,16);
  assert.equal((await s.actors.A.jobs.get(job.id)).job.failure_code,'qa_consumption');noResult(s,job);
  assert.equal(QA_LIMITS.fetchesPerAttempt,16);
});

test('sanitized diagnostics contain phases and numbers, never credentials or paths, and an observer cannot break processing',async t=>{
  const s=await qaConsumerFixture(t,{observe:()=>{throw Error('synthetic observer failure');}}),{job}=await s.actors.A.enqueue();
  assert.equal((await s.consumer.process(job.id)).job.status,'complete');
  const trace=JSON.stringify(s.events);
  for(const forbidden of ['Authorization','ghu_','SYNTHETIC_ONLY','synthetic-fixture','https:','token_envelope','invalid_synthetic_marker'])assert.equal(trace.includes(forbidden),false);
  for(const phase of ['authorization_initial','scanner_initial','acquisition','authorization_after_acquisition','authorization_final','finished'])assert.ok(s.events.some(e=>e.phase===phase));
  const last=s.events.filter(e=>e.type==='request').at(-1);
  assert.equal(last.attempted,s.calls.length);assert.equal(last.sent,s.calls.length);assert.equal(last.remaining,16-s.calls.length);
});

test('concurrent fetch admissions cannot exceed sixteen while their liveness checks are pending',async()=>{
  const release=deferred();let sent=0;
  const budget=qaFetchBudget(async()=>{sent++;return Response.json({});},
    {endsAt:Date.now()+60000,beforeRequest:()=>release.promise});
  const settled=Promise.allSettled(Array.from({length:17},()=>budget('https://api.github.com/user')));
  assert.equal(sent,0);assert.equal(budget.stats().attempted,17);
  release.resolve();const outcomes=await settled;
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,16);
  assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'qa_consumption');assert.equal(sent,16);
});

for(const status of [401,403]) {
  test(`HTTP ${status} during acquisition is denied without retry or result`,async t=>{
    const s=await qaConsumerFixture(t,{onRequest:({entry})=>entry.stage==='blob'?new Response('{}',{status}):undefined});
    const {job}=await s.actors.A.enqueue(),done=await s.consumer.process(job.id);
    assert.equal(done.job.status,'failed');assert.equal(done.job.failure_code,'access_revoked');
    assert.equal(done.job.attempts,1);noResult(s,job);
    assert.ok(s.events.some(e=>e.type==='response'&&e.status===status));
  });
}

// Test-only SQLite clock: this never configures or weakens the product clock.
function finalWriteHook(s,before) {
  const batch=s.db.batch.bind(s.db);let batches=0;
  s.db.batch=async statements=>{if(++batches===2)await before();return batch(statements);};
}
function databaseClock(s) {
  let clock;
  s.db.sql.function('julianday',value=>{
    const ms=value==='now'?(clock??Date.now()):Date.parse(value);
    return Number.isFinite(ms)?2440587.5+ms/86400000:null;
  });
  return elapsed=>{
    const claim=s.db.sql.prepare("SELECT updated_at FROM workbench_analysis_jobs WHERE status='running'").get();
    assert.ok(claim);clock=Date.parse(claim.updated_at)+elapsed;
  };
}

test('a final mutation delayed beyond 45s cannot persist even with a frozen application clock',async t=>{
  const s=await qaConsumerFixture(t),{job}=await s.actors.A.enqueue(),advanceDatabase=databaseClock(s);
  finalWriteHook(s,()=>advanceDatabase(45001));
  const done=await s.consumer.process(job.id);
  assert.equal(done.job.status,'queued');assert.equal(done.job.failure_code,'acquisition_timeout');
  assert.equal(done.job.attempts,1);assert.equal(s.reservations(),1);noResult(s,job);
  assert.equal(s.now().valueOf(),START);assert.equal(s.calls.length,12);
});

test('window expiration while the final batch waits denies a result and further retry',async t=>{
  const s=await qaConsumerFixture(t),{job}=await s.actors.A.enqueue(),advanceDatabase=databaseClock(s);
  finalWriteHook(s,()=>advanceDatabase(604800001));
  const done=await s.consumer.process(job.id);
  assert.equal(done.job.status,'failed');assert.equal(done.job.failure_code,'qa_closed');
  assert.equal(done.job.attempts,1);assert.equal(s.reservations(),1);noResult(s,job);
});

test('a result admitted before the deadline and its job remain atomic if the clock crosses between statements',async t=>{
  const s=await qaConsumerFixture(t),{job}=await s.actors.A.enqueue(),advanceDatabase=databaseClock(s);
  const prepare=s.db.prepare.bind(s.db);let crossed=false;
  s.db.prepare=query=>({bind(...values){
    const bound=prepare(query).bind(...values);
    return {...bound,async run(){
      const outcome=await bound.run();
      if(query.startsWith('UPDATE workbench_runs SET status=')&&outcome.meta.changes===1){
        advanceDatabase(45001);crossed=true;
      }
      return outcome;
    }};
  }});
  const done=await s.consumer.process(job.id);
  assert.equal(crossed,true);assert.equal(done.job.status,'complete');
  assert.equal(s.stored(job).status,'complete');assert.equal(result(s,job).files_read,1);
  assert.equal(s.reservations(),1);
  // The contract gates the result mutation; transport acknowledgement may arrive later.
});

for(const mutation of ['project-revoked','project-renamed','project-rebound','disconnect','connection-replaced']) {
  test(`local ${mutation} immediately before the final batch denies persistence without crossing owners`,async t=>{
    const s=await qaConsumerFixture(t),{job}=await s.actors.A.enqueue();
    const bConnection=s.db.sql.prepare('SELECT token_envelope FROM workbench_github_app_connections WHERE owner_id=?').get(s.actors.B.ownerId).token_envelope;
    finalWriteHook(s,()=>{
      const a=s.actors.A;
      if(mutation==='project-revoked')s.db.sql.prepare('UPDATE workbench_projects SET revoked_at=? WHERE id=?').run(new Date(START).toISOString(),a.project.id);
      if(mutation==='project-renamed')s.db.sql.prepare('UPDATE workbench_projects SET repo=? WHERE id=?').run(`${a.namespace}/renamed-synthetic`,a.project.id);
      if(mutation==='project-rebound')s.db.sql.prepare('UPDATE workbench_projects SET installation_id=99 WHERE id=?').run(a.project.id);
      if(mutation==='disconnect')s.db.sql.prepare('DELETE FROM workbench_github_app_connections WHERE owner_id=?').run(a.ownerId);
      if(mutation==='connection-replaced')s.db.sql.prepare('UPDATE workbench_github_app_connections SET token_envelope=? WHERE owner_id=?').run(bConnection,a.ownerId);
    });
    const done=await s.consumer.process(job.id);
    assert.equal(done.job.status,'failed');assert.equal(done.job.failure_code,'access_revoked');noResult(s,job);
    assert.equal(done.job.attempts,1);assert.equal(s.reservations(),1);
    assert.ok(s.calls.every(call=>call.actor==='A'));assert.equal(s.calls.length,12);
    assert.equal(s.db.sql.prepare('SELECT count(*) n FROM workbench_runs WHERE owner_id=?').get(s.actors.B.ownerId).n,0);
  });
}

test('revoking the other owner connection cannot invalidate or supply the active owner result',async t=>{
  const s=await qaConsumerFixture(t),{job}=await s.actors.A.enqueue();
  finalWriteHook(s,()=>s.db.sql.prepare('DELETE FROM workbench_github_app_connections WHERE owner_id=?').run(s.actors.B.ownerId));
  const done=await s.consumer.process(job.id);
  assert.equal(done.job.status,'complete');assert.equal(result(s,job).repository_id,s.actors.A.repositoryId);
  assert.equal(s.calls.length,12);assert.ok(s.calls.every(call=>call.actor==='A'));
  await assert.rejects(s.actors.B.jobs.get(job.id),e=>e.status===404);
});


test('a persistence capability is opaque and cannot cross owner, identity, job or lease',async t=>{
  const s=await qaConsumerFixture(t),a=s.actors.A;
  const auth=createGitHubAppAuth({config:{enabled:true,origin:s.env.WORKBENCH_ORIGIN,appId:123,
    slug:s.env.GITHUB_APP_SLUG,clientId:s.env.GITHUB_APP_CLIENT_ID,clientSecret:s.env.GITHUB_APP_CLIENT_SECRET,
    encryptionKey:s.env.GITHUB_APP_TOKEN_KEY,keyVersion:'1'},db:s.db,fetcher:s.fetcher,now:s.now});
  const job={id:crypto.randomUUID(),lease_token:crypto.randomUUID(),owner_id:a.ownerId,github_id:a.githubId};
  const context=auth.createExecutionContext(a.user,{jobId:job.id,leaseToken:job.lease_token});
  await context.getClient();const proof=context.persistenceProof();
  assert.equal(JSON.stringify(proof),'{}');
  assert.ok(!JSON.stringify(connectionPersistenceFence(proof,job).values).includes('ghu_SYNTHETIC_ONLY'));
  for(const change of [{owner_id:s.actors.B.ownerId},{github_id:s.actors.B.githubId},
    {id:crypto.randomUUID()},{lease_token:crypto.randomUUID()}]) {
    assert.throws(()=>connectionPersistenceFence(proof,{...job,...change}),e=>e.code==='disconnected');
  }
  for(const forged of [{},JSON.parse(JSON.stringify(proof))])
    assert.throws(()=>connectionPersistenceFence(forged,job),e=>e.code==='disconnected');
  assert.equal(s.calls.length,0,'building local proof does not add provider operations');
});
