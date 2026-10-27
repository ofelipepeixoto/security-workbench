import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGitHubAppClient} from '../lib/github-app-client.mjs';

const SHA='a'.repeat(40),ROOT='b'.repeat(40),GITHUB='c'.repeat(40),WORKFLOWS='d'.repeat(40);
const PATH='.github/workflows/check.yml', TEXT='permissions: write-all\nname: synthetic-fixture\n';
const BLOB=createHash('sha1').update(`blob ${TEXT.length}\0${TEXT}`).digest('hex');
const json=data=>Response.json(data);
const options={installationId:10,repositoryId:300,revision:SHA,path:PATH};
function fixture(override) {
  const calls=[];
  const fetcher=async(url,init)=>{
    calls.push({url,init});const u=new URL(url);
    const replacement=await override?.(u,init);if(replacement)return replacement;
    if(u.pathname==='/user')return json({id:101,login:'fixture-owner'});
    if(u.pathname==='/user/installations')return json({total_count:1,installations:[{id:10,app_id:20,account:{id:101,login:'fixture-owner',type:'User'},repository_selection:'selected',permissions:{metadata:'read',contents:'read'},suspended_at:null}]});
    if(u.pathname==='/user/installations/10/repositories')return json({total_count:1,repositories:[{id:300,name:'fixture',full_name:'fixture-owner/fixture',owner:{id:101,login:'fixture-owner',type:'User'},private:true,permissions:{pull:true}}]});
    if(u.pathname===`/repositories/300/git/commits/${SHA}`)return json({sha:SHA,tree:{sha:ROOT}});
    if(u.pathname===`/repositories/300/git/trees/${ROOT}`)return json({sha:ROOT,truncated:false,tree:[{path:'.github',type:'tree',mode:'040000',sha:GITHUB}]});
    if(u.pathname===`/repositories/300/git/trees/${GITHUB}`)return json({sha:GITHUB,truncated:false,tree:[{path:'workflows',type:'tree',mode:'040000',sha:WORKFLOWS}]});
    if(u.pathname===`/repositories/300/git/trees/${WORKFLOWS}`)return json({sha:WORKFLOWS,truncated:false,tree:['check.yml','other.yaml','third.yml'].map(path=>({path,type:'blob',mode:'100644',sha:BLOB,size:TEXT.length}))});
    if(u.pathname===`/repositories/300/git/blobs/${BLOB}`)return json({sha:BLOB,size:TEXT.length,encoding:'base64',content:btoa(TEXT)});
    throw new Error('Unexpected synthetic endpoint');
  };
  return {calls,client:createGitHubAppClient({accessToken:'ghu_inert_context_fixture_not_a_credential',expectedGitHubId:'101',appId:20,fetcher})};
}

test('context file walks regular tree modes at the exact existing SHA, never resolving a moving branch',async()=>{
  const f=fixture(),result=await f.client.readContextFile(options);
  assert.equal(result.revision,SHA);assert.equal(result.path,PATH);assert.equal(result.blob_sha,BLOB);assert.equal(result.bytes,TEXT.length);assert.equal(result.text,TEXT);
  assert.equal(f.calls.length,8);assert.ok(f.calls.filter(call=>call.url.includes('/git/')).every(call=>!new URL(call.url).search));
  assert.ok(f.calls.every(call=>!call.url.includes('/contents/')&&!/\/repositories\/300\/commits\//.test(call.url)));
  assert.equal(f.calls.filter(call=>call.url.includes('/git/commits/'))[0].url,`https://api.github.com/repositories/300/git/commits/${SHA}`);
  assert.ok(f.calls.every(call=>call.init.method==='GET'&&call.init.cache==='no-store'));
});

test('two context files reuse only immutable tree metadata and freshly revalidate user permissions',async()=>{
  const f=fixture();await f.client.readContextFile(options);
  await f.client.readContextFile({...options,path:'.github/workflows/other.yaml'});
  assert.equal(f.calls.length,11);
  assert.equal(f.calls.filter(call=>call.url.includes('/user/installations/10/repositories')).length,2);
  assert.equal(f.calls.filter(call=>call.url.includes('/git/commits/')).length,1);
  assert.equal(f.calls.filter(call=>call.url.includes('/git/trees/')).length,3);
  assert.equal(f.calls.filter(call=>call.url.includes('/git/blobs/')).length,2);
  const before=f.calls.length;
  await assert.rejects(f.client.readContextFile({...options,path:'.github/workflows/third.yml'}),{code:'incomplete'});
  assert.equal(f.calls.length,before);
});

test('invalid context paths, revisions and byte budgets are rejected before any GitHub read',async()=>{
  const f=fixture();
  for(const change of [{path:'.env'},{path:'.github/workflows/../.env'},{path:'.github/workflows/nested/file.yml'},{path:'.github/workflows/test..yml'},{path:'https://evil.invalid'},{revision:'main'},{maxBytes:32769},{maxBytes:0}])await assert.rejects(f.client.readContextFile({...options,...change}),{code:'invalid_request'});
  assert.equal(f.calls.length,0);
});

test('context reads fail closed for content denial, cross-user identity and revocation without source acquisition',async()=>{
  for(const [path,response,code] of [
    ['/user',json({id:202,login:'other-user'}),'disconnected'],
    ['/user/installations',json({total_count:1,installations:[{id:10,app_id:20,account:{id:101,login:'fixture-owner',type:'User'},permissions:{metadata:'read'}}]}),'forbidden'],
    ['/user/installations/10/repositories',new Response(null,{status:403}),'forbidden'],
  ]){
    const f=fixture(u=>u.pathname===path?response:null);
    await assert.rejects(f.client.readContextFile(options),{code});
    assert.ok(f.calls.every(call=>!call.url.includes('/git/')));
  }
  let revoked=false;
  const f=fixture(u=>revoked&&u.pathname==='/user/installations/10/repositories'?new Response(null,{status:403}):null);
  await f.client.readContextFile(options);const before=f.calls.filter(call=>call.url.includes('/git/')).length;revoked=true;
  await assert.rejects(f.client.readContextFile({...options,path:'.github/workflows/other.yaml'}),{code:'forbidden'});
  assert.equal(f.calls.filter(call=>call.url.includes('/git/')).length,before);
});

test('symlinks, submodules, oversized blobs and truncated trees never become model context',async()=>{
  for(const [replacement,code] of [
    [{sha:WORKFLOWS,truncated:false,tree:[{path:'check.yml',type:'blob',mode:'120000',sha:BLOB,size:TEXT.length}]},'forbidden'],
    [{sha:WORKFLOWS,truncated:false,tree:[{path:'check.yml',type:'commit',mode:'160000',sha:BLOB,size:TEXT.length}]},'forbidden'],
    [{sha:WORKFLOWS,truncated:false,tree:[{path:'check.yml',type:'blob',mode:'100644',sha:BLOB,size:32769}]},'forbidden'],
    [{sha:WORKFLOWS,truncated:true,tree:[]},'incomplete'],
  ]){
    const f=fixture(u=>u.pathname===`/repositories/300/git/trees/${WORKFLOWS}`?json(replacement):null);
    await assert.rejects(f.client.readContextFile(options),{code});
    assert.ok(f.calls.every(call=>!call.url.includes('/git/blobs/')));
  }
});

test('corrupt commit/blob identities, base64, length and UTF8 fail instead of fabricating a snippet',async()=>{
  const variants=[{sha:'f'.repeat(40),size:TEXT.length,encoding:'base64',content:btoa(TEXT)},
    {sha:BLOB,size:TEXT.length,encoding:'base64',content:'!!!!'},
    {sha:BLOB,size:TEXT.length,encoding:'base64',content:btoa('x'.repeat(TEXT.length))},
    {sha:BLOB,size:TEXT.length,encoding:'base64',content:btoa('short')},
    {sha:BLOB,size:TEXT.length,encoding:'base64',content:btoa('\xff'.repeat(TEXT.length))}];
  for(const blob of variants){const f=fixture(u=>u.pathname===`/repositories/300/git/blobs/${BLOB}`?json(blob):null);await assert.rejects(f.client.readContextFile(options),{code:'unavailable'});}
  const f=fixture(u=>u.pathname===`/repositories/300/git/commits/${SHA}`?json({sha:'f'.repeat(40),tree:{sha:ROOT}}):null);
  await assert.rejects(f.client.readContextFile(options),{code:'unavailable'});
  assert.ok(f.calls.every(call=>!call.url.includes('/git/trees/')));
});

test('context request budget narrows cumulative reads and denies request17 before fetching',async()=>{
  const f=fixture();
  assert.equal(f.client.requestMetrics().limit,null);
  assert.equal(f.client.restrictRequestBudget(16).limit,16);
  for(let i=0;i<15;i++)await f.client.listInstallations();
  assert.equal(f.calls.length,16);assert.equal(f.client.requestMetrics().requests,16);
  await assert.rejects(f.client.listInstallations(),{code:'budget_exceeded'});
  assert.equal(f.calls.length,16);
  assert.ok(f.client.requestMetrics().response_bytes>0);
  f.client.restrictRequestBudget(8);f.client.restrictRequestBudget(16);
  assert.equal(f.client.requestMetrics().limit,8);
  for(const invalid of [0,17,1.5,'16'])assert.throws(()=>f.client.restrictRequestBudget(invalid),{code:'invalid_request'});
});

test('context transport has a cumulative two MiB response ceiling including earlier reads',async()=>{
  const f=fixture(u=>u.pathname==='/user'?new Response('{}',{headers:{'Content-Length':String(2*1024*1024+1)}}):null);
  assert.equal(f.client.requestMetrics().response_limit,null);
  f.client.restrictRequestBudget(16);
  assert.equal(f.client.requestMetrics().response_limit,2*1024*1024);
  await assert.rejects(f.client.listInstallations(),{code:'budget_exceeded'});
  assert.equal(f.calls.length,1);
  const large='x'.repeat(800000);
  const second=fixture(u=>u.pathname==='/user/installations'?json({total_count:0,installations:[],ignored:large}):null);
  await second.client.listInstallations();
  const earlier=second.client.requestMetrics().response_bytes;
  assert.ok(earlier>800000);second.client.restrictRequestBudget(16);
  await second.client.listInstallations();
  await assert.rejects(second.client.listInstallations(),{code:'budget_exceeded'});
  const before=second.calls.length;
  await assert.rejects(second.client.listInstallations(),{code:'budget_exceeded'});
  assert.equal(second.calls.length,before);assert.ok(second.client.requestMetrics().response_bytes>earlier);
});
