import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePackagingManifest,qaMetadata,createQaEntryModule,qaPackageDigests} from '../../scripts/prepare-qa-workers.mjs';

const manifest=()=>({accountId:'a'.repeat(32),databaseId:'11111111-1111-4111-8111-111111111111',
  restoreDatabaseId:'22222222-2222-4222-8222-222222222222',queueId:'b'.repeat(32),queueName:'security-workbench-analysis-qa',
  approvedGitHubApp:{appId:'1234567',slug:'synthetic-qa',keyVersion:'1'},origin:'https://security-workbench-qa.synthetic.workers.dev',productionResourceIds:['33333333-3333-4333-8333-333333333333'],sourceRevision:'c'.repeat(40)});
test('QA packaging rejects resource reuse, malformed IDs, wrong queue and production/custom origins',()=>{
  validatePackagingManifest(manifest());
  for(const patch of [{databaseId:manifest().restoreDatabaseId},{queueId:manifest().databaseId},{databaseId:manifest().productionResourceIds[0]},
    {queueName:'production-queue'},{origin:'https://security-workbench.camaleaoweb3.com.br'},{accountId:'unconfirmed'},
    {sourceRevision:'not-a-commit'},{sourceRevision:undefined}])assert.throws(()=>validatePackagingManifest({...manifest(),...patch}));
});
test('metadata binds only operational D1 and QA producer, keeps auth/jobs off and has no cron, secrets, restore or connectors',()=>{
  const m=manifest(),metadata=qaMetadata(m,'qa-entry.mjs');
  assert.deepEqual(metadata.bindings.filter(b=>b.type==='d1'),[{type:'d1',name:'DB',id:m.databaseId}]);
  assert.deepEqual(metadata.bindings.filter(b=>b.type==='queue'),[{type:'queue',name:'ANALYSIS_QUEUE',queue_name:m.queueName}]);
  const vars=Object.fromEntries(metadata.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
  for(const flag of ['WORKBENCH_JOBS_ENABLED','WORKBENCH_MULTIUSER_ENABLED','GITHUB_APP_ENABLED','GITHUB_LOGIN_ENABLED','WORKBENCH_CONTEXTUAL_ENABLED','WORKBENCH_QA_METRICS_ENABLED'])assert.equal(vars[flag],'false');
  assert.equal(vars.WORKBENCH_QA_ENABLED,'true');assert.equal(vars.GITHUB_OWNER_ID,'171351708');
  assert.deepEqual(metadata.keep_bindings,['secret_text']);assert.deepEqual(metadata.observability,{enabled:false});assert.equal(metadata.logpush,false);
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

test('private package digests bind the exact source, metadata and module bytes without including module bodies',()=>{
 const payload={sourceRevision:'c'.repeat(40),web:{name:'security-workbench-qa',metadata:{bindings:[]},modules:[{name:'index.js',content:'export default {}'}]},consumer:{name:'security-workbench-analysis-qa',metadata:{bindings:[]},modules:[{name:'worker.mjs',content:'export default {}'}]}};
 const one=qaPackageDigests(payload);assert.equal(one.web.modules[0].bytes,17);assert.equal(one.payloadSha256.length,64);assert.equal(JSON.stringify(one).includes('export default'),false);
 payload.consumer.modules[0].content+=';';const two=qaPackageDigests(payload);assert.notEqual(one.payloadSha256,two.payloadSha256);assert.notEqual(one.consumer.modules[0].sha256,two.consumer.modules[0].sha256);assert.equal(one.web.metadataSha256,two.web.metadataSha256);
});

function snapshot(m) {
 const values={GITHUB_SESSION_VERSION:'3',GITHUB_LOGIN_ENABLED:'true',GITHUB_LOGIN_CLIENT_ID:'Iv23.synthetic-client',GITHUB_OWNER_ID:'171351708',
  GITHUB_APP_ENABLED:'true',GITHUB_APP_ID:m.approvedGitHubApp.appId,GITHUB_APP_SLUG:m.approvedGitHubApp.slug,GITHUB_APP_CLIENT_ID:'Iv23.synthetic-app-client',GITHUB_APP_KEY_VERSION:m.approvedGitHubApp.keyVersion,
  WORKBENCH_MULTIUSER_ENABLED:'true',WORKBENCH_PILOT_GITHUB_IDS:'322086368',WORKBENCH_OWNER_ID:'qa:ofelipepeixoto',WORKBENCH_ORIGIN:m.origin};
 const rows=object=>Object.entries(object).map(([name,text])=>({type:'plain_text',name,text}));
 return {web:rows(values),consumer:rows({...values,GITHUB_LOGIN_ENABLED:'false',GITHUB_APP_ENABLED:'false',WORKBENCH_MULTIUSER_ENABLED:'false'})};
}
test('an exact reviewed authentication snapshot preserves each Worker independently without activating processing or widening pilots',()=>{
 const m=manifest();m.existingPlainBindings=snapshot(m);
 for(const [role,module] of [['web','qa-entry.mjs'],['consumer','analysis-worker.mjs']]) {
  const metadata=qaMetadata(m,module),vars=Object.fromEntries(metadata.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
  for(const binding of m.existingPlainBindings[role])assert.equal(vars[binding.name],binding.text);
  assert.equal(vars.WORKBENCH_PILOT_GITHUB_IDS,'322086368','owner is separate; preserve the exact already-granted pilot subset');
  for(const flag of ['WORKBENCH_JOBS_ENABLED','WORKBENCH_CONTEXTUAL_ENABLED','WORKBENCH_QA_METRICS_ENABLED'])assert.equal(vars[flag],'false');
  assert.equal(vars.WORKBENCH_QA_ENABLED,'true');assert.equal(vars.WORKBENCH_QA_SOURCE_SHA,m.sourceRevision);
  assert.deepEqual(metadata.keep_bindings,['secret_text']);assert.equal(metadata.triggers,undefined);assert.equal(metadata.queues,undefined);
 }
 assert.throws(()=>qaMetadata(m,'unapproved-worker.mjs'));
});
test('authentication preservation rejects missing scope, foreign identity/origin, secrets, duplicates and processing/model/log overrides',()=>{
 const original=manifest();original.existingPlainBindings=snapshot(original);
 const changed=(name,text)=>{const m=structuredClone(original);m.existingPlainBindings.web.find(b=>b.name===name).text=text;return m;};
 for(const [name,text] of [['WORKBENCH_OWNER_ID','qa:other'],['GITHUB_OWNER_ID','322086368'],['WORKBENCH_ORIGIN','https://foreign.example'],
  ['GITHUB_APP_ID','123'],['GITHUB_APP_SLUG','another-app'],['GITHUB_APP_KEY_VERSION','2'],['WORKBENCH_PILOT_GITHUB_IDS','171351708,999'],
  ['WORKBENCH_PILOT_GITHUB_IDS','322086368,322086368'],['GITHUB_LOGIN_ENABLED','yes'],['GITHUB_SESSION_VERSION','0'],['GITHUB_SESSION_VERSION','version3'],['GITHUB_LOGIN_CLIENT_ID','ghp_SYNTHETIC_ONLY'],['GITHUB_APP_CLIENT_ID','sk-SYNTHETIC_ONLY'],
  ['GITHUB_LOGIN_CLIENT_ID','https://foreign.example'],['GITHUB_APP_CLIENT_ID','line1\nline2']])assert.throws(()=>qaMetadata(changed(name,text),'qa-entry.mjs'));
 for(const name of ['GITHUB_CLIENT_ID','GITHUB_APP_CLIENT_SECRET','OPENAI_API_KEY','WORKBENCH_JOBS_ENABLED','WORKBENCH_CONTEXTUAL_ENABLED','WORKBENCH_QA_METRICS_ENABLED','LOG_LEVEL']) {
  const m=structuredClone(original);const row=m.existingPlainBindings.consumer.find(b=>b.name==='GITHUB_APP_CLIENT_ID');Object.assign(row,{name,type:'plain_text',text:'true'});assert.throws(()=>qaMetadata(m,'qa-entry.mjs'));
 }
 const missing=structuredClone(original);missing.existingPlainBindings.web=missing.existingPlainBindings.web.filter(b=>b.name!=='WORKBENCH_PILOT_GITHUB_IDS');assert.throws(()=>qaMetadata(missing,'qa-entry.mjs'));
 const incomplete=structuredClone(original);incomplete.existingPlainBindings.web=incomplete.existingPlainBindings.web.filter(b=>b.name!=='GITHUB_APP_CLIENT_ID');assert.throws(()=>qaMetadata(incomplete,'qa-entry.mjs'));
 const duplicate=structuredClone(original);duplicate.existingPlainBindings.consumer=duplicate.existingPlainBindings.consumer.filter(b=>b.name!=='GITHUB_APP_CLIENT_ID');duplicate.existingPlainBindings.consumer.push(duplicate.existingPlainBindings.consumer[0]);assert.throws(()=>qaMetadata(duplicate,'qa-entry.mjs'));
 const secret=structuredClone(original);secret.existingPlainBindings.web[0].type='secret_text';assert.throws(()=>qaMetadata(secret,'qa-entry.mjs'));
 const foreignRole=structuredClone(original);foreignRole.existingPlainBindings.production=[];assert.throws(()=>qaMetadata(foreignRole,'qa-entry.mjs'));
});

test('the approved App scope belongs to the private manifest and must exactly match the reviewed authentication snapshot',()=>{
 const m=manifest();m.existingPlainBindings=snapshot(m);
 for(const app of [undefined,null,{appId:'0',slug:'synthetic-qa',keyVersion:'1'},
  {appId:'1234567890123',slug:'synthetic-qa',keyVersion:'1'},{appId:'1234567',slug:'https://foreign.example',keyVersion:'1'},
  {appId:'1234567',slug:'synthetic-qa',keyVersion:'0'},{appId:'1234567',slug:'synthetic-qa',keyVersion:'1',clientSecret:'SYNTHETIC_ONLY'},
  {appId:'7654321',slug:'synthetic-qa',keyVersion:'1'},{appId:'1234567',slug:'different-app',keyVersion:'1'},
  {appId:'1234567',slug:'synthetic-qa',keyVersion:'2'}])assert.throws(()=>qaMetadata({...m,approvedGitHubApp:app},'qa-entry.mjs'));
 const dormant=manifest();delete dormant.approvedGitHubApp;
 assert.equal(qaMetadata(dormant,'qa-entry.mjs').bindings.find(b=>b.name==='GITHUB_APP_ENABLED').text,'false');
});

test('closed checks add only a private web fixture binding and never activate processing or consumer',()=>{
 const fixtures=['171351708','322086368'].map((githubId,i)=>({githubId,repositoryId:21+i,installationId:11+i,repo:`${['ofelipepeixoto','radartech-news'][i]}/security-workbench-qa-fixture`}));
 const m={...manifest(),qaClosedCheckFixtures:fixtures};
 const web=qaMetadata(m,'qa-entry.mjs'),consumer=qaMetadata(m,'analysis-worker.mjs');
 assert.deepEqual(JSON.parse(web.bindings.find(b=>b.name==='WORKBENCH_QA_CHECK_FIXTURES').text),fixtures);
 assert.equal(consumer.bindings.some(b=>b.name==='WORKBENCH_QA_CHECK_FIXTURES'),false);
 assert.equal(qaMetadata(manifest(),'qa-entry.mjs').bindings.some(b=>b.name==='WORKBENCH_QA_CHECK_FIXTURES'),false);
 for(const changes of [{githubId:'other'},{repo:'unrelated/private'},{installationId:0},{extra:'not permitted'}])assert.throws(()=>qaMetadata({...m,qaClosedCheckFixtures:[{...fixtures[0],...changes},fixtures[1]]},'qa-entry.mjs'));
 assert.equal(web.bindings.find(b=>b.name==='WORKBENCH_JOBS_ENABLED').text,'false');assert.deepEqual(web.observability,{enabled:false});
});
