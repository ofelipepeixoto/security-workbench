import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createQaMetrics} from '../lib/qa-metrics.mjs';
import {createAnalysisConsumer} from '../workers/analysis-consumer.mjs';
import {migratedDatabase} from './helpers/d1-sqlite.mjs';
import {qaConsumerFixture} from './helpers/qa-consumer-fixture.mjs';
const enabled={WORKBENCH_QA_ENABLED:'true',WORKBENCH_QA_METRICS_ENABLED:'true'};
test('QA telemetry stays disabled without both explicit flags and never logs invalid identifiers',async()=>{
 for(const env of [{},{WORKBENCH_QA_ENABLED:'true'},{WORKBENCH_QA_METRICS_ENABLED:'true'}])assert.equal(await createQaMetrics({env,jobId:randomUUID(),emit:()=>assert.fail()}),undefined);
 assert.equal(await createQaMetrics({env:enabled,jobId:'private-name',emit:()=>assert.fail()}),undefined);
});
test('one bounded numeric record contains no raw job ID, strings from events or claimed CPU measurement',async()=>{
 const rows=[],jobId=randomUUID();let now=100;
 const metrics=await createQaMetrics({env:enabled,jobId,emit:r=>rows.push(r),clock:()=>now});
 metrics.observe({attempted:2,sent:1,bytes:100,url:'https://private.synthetic',token:'PRIVATE_SYNTHETIC'});
 metrics.observe({attempted:Infinity,sent:-1,bytes:'PRIVATE_SYNTHETIC',phase:'private-repository'});
 now=150;metrics.finish('arbitrary-private-outcome','PRIVATE_SYNTHETIC');metrics.finish('complete');
 assert.equal(rows.length,1);const r=rows[0],serialized=JSON.stringify(r);
 assert.equal(r.wall_ms,50);assert.equal(r.github_attempts,2);assert.equal(r.github_sent,1);assert.equal(r.github_bytes,100);
 assert.equal(r.cpu_ms,null);assert.equal(r.cpu_source,'cloudflare_trace_required');assert.equal(r.outcome,'error');assert.equal(r.error_code,'other');
 assert.equal(r.job_ref.length,24);assert.ok(serialized.length<1000);assert.ok(!serialized.includes(jobId));
 for(const value of ['PRIVATE_SYNTHETIC','private-repository','private.synthetic'])assert.ok(!serialized.includes(value));
});
test('D1 wrapper preserves first/all/run/bind/batch results and rollback without extra API calls',async t=>{
 const db=migratedDatabase();t.after(()=>db.close());let calls=0;
 const originalPrepare=db.prepare.bind(db),originalBatch=db.batch.bind(db);
 db.prepare=q=>({bind(...v){const raw=originalPrepare(q).bind(...v);return Object.fromEntries(['first','all','run'].map(method=>[method,async()=>{calls++;return raw[method]();}]));}});
 db.batch=async statements=>{calls++;return originalBatch(statements);};
 const rows=[],metrics=await createQaMetrics({env:enabled,jobId:randomUUID(),emit:r=>rows.push(r)}),wrapped=metrics.wrapDb(db);
 const before=calls;
 const one=await wrapped.prepare('SELECT ? AS marker').bind('private-synthetic-value').first();assert.equal(one.marker,'private-synthetic-value');
 const all=await wrapped.prepare('SELECT ? AS marker').bind('private-synthetic-value').all();assert.equal(all.results[0].marker,'private-synthetic-value');
 await wrapped.batch([wrapped.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at) VALUES (?,?,?,?,?)").bind('test-a','owner-a','synthetic/a',1,'now')]);
 await assert.rejects(wrapped.batch([wrapped.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at) VALUES (?,?,?,?,?)").bind('test-b','owner-a','synthetic/b',2,'now'),wrapped.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at) VALUES (?,?,?,?,?)").bind('test-a','owner-a','synthetic/duplicate',3,'now')]));
 assert.equal(db.sql.prepare("SELECT count(*) n FROM workbench_projects WHERE id='test-b'").get().n,0);
 // SQLite's batch adapter invokes its prepared statements; the wrapper must
 // not add a query or wrap those raw statements a second time.
 assert.equal(calls-before,7);
 metrics.finish('complete');assert.equal(rows[0].d1_api_attempts,4);assert.equal(rows[0].d1_statement_attempts,5);
 assert.ok(rows[0].d1_meta_missing>0);assert.ok(!JSON.stringify(rows).includes('private-synthetic-value'));
});
test('only numeric observed D1 metadata is emitted; missing metadata is explicit and a failing sink cannot change queries',async()=>{
 const rows=[],metrics=await createQaMetrics({env:enabled,jobId:randomUUID(),emit:r=>rows.push(r)});
 const result={meta:{rows_read:8,rows_written:2},results:[{private:'private-synthetic'}]};
 const statement={bind(){return this;},async all(){return result;},async first(){return result.results[0];},async run(){return result;}};
 const db=metrics.wrapDb({prepare(){return statement;},async batch(items){return items.map(()=>result);}});
 assert.equal(await db.prepare('not logged').bind('private-synthetic').all(),result);
 assert.equal((await db.prepare('not logged').first()).private,'private-synthetic');
 await db.batch([db.prepare('not logged')]);metrics.finish('complete');
 assert.equal(rows[0].d1_rows_read_observed,16);assert.equal(rows[0].d1_rows_written_observed,4);assert.equal(rows[0].d1_meta_missing,1);
 const sinkFails=await createQaMetrics({env:enabled,jobId:randomUUID(),emit:()=>{throw Error('sink offline');}});sinkFails.finish('complete');
});
test('opt-in consumer emits one sanitized record per A/B processing invocation with unchanged calls and persisted result',async t=>{
 const s=await qaConsumerFixture(t,{canary:true,files:1}),records=[];
 const consumer=createAnalysisConsumer({env:{...s.env,WORKBENCH_QA_METRICS_ENABLED:'true'},now:s.now,fetcher:s.fetcher,metricsSink:r=>records.push(r)});
 for(const name of ['A','B']) {
  const {job}=await s.actors[name].enqueue(),before=s.calls.length;
  const result=await consumer.process(job.id);assert.equal(result.job.status,'complete');assert.equal(s.calls.length-before,12);
 }
 assert.equal(records.length,2);assert.notEqual(records[0].job_ref,records[1].job_ref);
 for(const r of records){assert.equal(r.outcome,'complete');assert.equal(r.github_sent,12);assert.ok(r.github_bytes>0);assert.ok(r.d1_api_attempts>0);assert.equal(r.cpu_ms,null);}
 const serialized=JSON.stringify(records);
 for(const value of ['ghu_','synthetic-fixture','invalid_synthetic_marker',s.actors.A.ownerId,s.actors.B.ownerId])assert.ok(!serialized.includes(value));
});
