import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePackagingManifest,qaMetadata,createQaEntryModule} from '../../scripts/prepare-qa-workers.mjs';

const manifest=()=>({accountId:'a'.repeat(32),databaseId:'11111111-1111-4111-8111-111111111111',
  restoreDatabaseId:'22222222-2222-4222-8222-222222222222',queueId:'b'.repeat(32),queueName:'security-workbench-analysis-qa',
  origin:'https://security-workbench-qa.synthetic.workers.dev',productionResourceIds:['33333333-3333-4333-8333-333333333333'],sourceRevision:'c'.repeat(40)});
test('QA packaging rejects resource reuse, malformed IDs, wrong queue and production/custom origins',()=>{
  validatePackagingManifest(manifest());
  for(const patch of [{databaseId:manifest().restoreDatabaseId},{queueId:manifest().databaseId},{databaseId:manifest().productionResourceIds[0]},
    {queueName:'production-queue'},{origin:'https://security-workbench.camaleaoweb3.com.br'},{accountId:'unconfirmed'},
    {sourceRevision:'not-a-commit'}])assert.throws(()=>validatePackagingManifest({...manifest(),...patch}));
});
test('metadata binds only operational D1 and QA producer, keeps auth/jobs off and has no cron, secrets, restore or connectors',()=>{
  const m=manifest(),metadata=qaMetadata(m,'qa-entry.mjs');
  assert.deepEqual(metadata.bindings.filter(b=>b.type==='d1'),[{type:'d1',name:'DB',id:m.databaseId}]);
  assert.deepEqual(metadata.bindings.filter(b=>b.type==='queue'),[{type:'queue',name:'ANALYSIS_QUEUE',queue_name:m.queueName}]);
  const vars=Object.fromEntries(metadata.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
  for(const flag of ['WORKBENCH_JOBS_ENABLED','WORKBENCH_MULTIUSER_ENABLED','GITHUB_APP_ENABLED','GITHUB_LOGIN_ENABLED'])assert.equal(vars[flag],'false');
  assert.equal(vars.WORKBENCH_QA_ENABLED,'true');assert.equal(vars.GITHUB_OWNER_ID,'171351708');
  assert.deepEqual(metadata.observability,{enabled:false});assert.equal(metadata.logpush,false);
  assert.equal(JSON.stringify(metadata).includes(m.restoreDatabaseId),false);
  assert.equal(metadata.bindings.some(b=>/secret|assets|r2_bucket|service/.test(b.type)),false);
  assert.equal(metadata.triggers,undefined);assert.equal(metadata.queues,undefined);
});
test('an explicitly pending Queue omits its binding without enabling work or inventing an identifier',()=>{
  const m={...manifest(),queuePending:true,productionResourceIds:undefined,productionManagedBySites:true};delete m.queueId;
  const metadata=qaMetadata(m,'qa-entry.mjs');
  assert.equal(metadata.bindings.some(b=>b.type==='queue'),false);
  assert.equal(metadata.bindings.find(b=>b.name==='WORKBENCH_JOBS_ENABLED').text,'false');
  assert.throws(()=>qaMetadata({...m,queueId:'b'.repeat(32)},'qa-entry.mjs'));
  assert.throws(()=>qaMetadata({...m,queuePending:false},'qa-entry.mjs'));
});
test('static QA adapter serves exact assets and HEAD/ETag, preserves the server and never proxies misses',async()=>{
  const origin=manifest().origin,content='/* synthetic asset */';
  const assets={'/_next/static/synthetic.js':{base64:Buffer.from(content).toString('base64'),type:'text/javascript; charset=utf-8',etag:'"fixture-digest"'}};
  const handler='data:text/javascript,'+encodeURIComponent('export default {fetch(request,env){return new Response(JSON.stringify({path:new URL(request.url).pathname,hasAssets:!!env.ASSETS,db:env.DB}));}};');
  const worker=(await import('data:text/javascript,'+encodeURIComponent(createQaEntryModule(assets,origin,handler)))).default;
  const request=(p,init)=>new Request(origin+p,init);
  let response=await worker.fetch(request('/_next/static/synthetic.js?cache=1'),{DB:'qa-database'},{});
  assert.equal(await response.text(),content);assert.match(response.headers.get('Cache-Control'),/immutable/);
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  response=await worker.fetch(request('/_next/static/synthetic.js',{method:'HEAD'}),{},{});assert.equal(await response.text(),'');
  response=await worker.fetch(request('/_next/static/synthetic.js',{headers:{'If-None-Match':'"fixture-digest"'}}),{},{});assert.equal(response.status,304);
  response=await worker.fetch(request('/api/workbench'),{DB:'qa-database'},{});
  assert.deepEqual(await response.json(),{path:'/api/workbench',hasAssets:true,db:'qa-database'});
  response=await worker.fetch(request('/_next/static/missing.js'),{},{});assert.equal((await response.json()).path,'/_next/static/missing.js');
  response=await worker.fetch(new Request('https://foreign.example/_next/static/synthetic.js'),{},{});assert.equal(response.status,404);
  response=await worker.fetch(request('/_next/static/synthetic.js',{method:'POST'}),{},{});assert.equal(response.status,405);
});
