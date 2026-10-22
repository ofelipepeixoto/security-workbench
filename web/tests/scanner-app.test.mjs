import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectGitHub,inspectGitHubApp,renderReport,COVERAGE_POLICY} from '../lib/scanner.mjs';
const REPO='ofelipepeixoto/rea', ID=1234, REVISION='a'.repeat(40), TREE='b'.repeat(40);
function fixture(files){
  const entries=[],blobs=new Map();
  for(const [path,text] of Object.entries(files)){
    const bytes=Buffer.from(text),sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    entries.push({path,mode:'100644',type:'blob',size:bytes.length,sha});
    blobs.set(sha,{sha,size:bytes.length,encoding:'base64',content:bytes.toString('base64')});
  }
  return {listing:{sha:TREE,tree:entries,truncated:false},blobs};
}
test('coverage 1.1 reads mjs/cjs and counts unsupported files without fetching excluded sources',async()=>{
  const f=fixture({'module.mjs':'password="synthetic_12345"','module.cjs':'exports.ok=true;','.env':'NEVER_FETCH','node_modules/a.js':'NEVER_FETCH','view.go':'NEVER_FETCH','../outside.py':'NEVER_FETCH'}),calls=[];
  const fetcher=async(url)=>{
    calls.push(url);const prefix=`https://api.github.com/repos/${REPO}`;
    const value=url===prefix?{id:ID,full_name:REPO,private:false,default_branch:'main'}:url===`${prefix}/git/commits/${REVISION}`?{sha:REVISION,tree:{sha:TREE}}:url.includes('/git/trees/')?f.listing:f.blobs.get(url.split('/').at(-1));
    assert.ok(value);return Response.json(value);
  };
  const result=await inspectGitHub(REPO,ID,REVISION,{fetcher});
  assert.equal(result.files_read,2);assert.equal(result.partial,true);assert.equal(result.findings.length,1);
  assert.equal(result.coverage.policy,COVERAGE_POLICY);assert.equal(result.coverage.files_excluded,4);
  assert.deepEqual(result.coverage.exclusions_by_reason,{excluded_environment:1,excluded_directory:1,unsupported_extension:1,invalid_path:1});
  assert.equal(result.coverage.advisory_coverage,'unavailable');assert.equal(calls.filter(url=>url.includes('/git/blobs/')).length,2);assert.ok(!JSON.stringify(result).includes('NEVER_FETCH'));
});
function appFixture(options={}){
  const f=fixture({'test/fixture.mjs':'password="synthetic_12345"'}),calls=[];let checks=0;
  return {calls,client:{
    async authorizeRepository(){checks++;calls.push('authorize');if(options.denied)throw Error('denied');return{repository:{id:ID,full_name:'synthetic-org/private-repo',private:!(options.changed&&checks>1)},revision:REVISION,tree_sha:TREE};},
    async readTree(){calls.push('tree');return f.listing;},
    async readBlob(args){calls.push('blob');const value=f.blobs.get(args.blobSha);return options.tampered?{...value,content:btoa('tampered')}:value;},
  }};
}
test('App scanner pins private identity before and after acquisition with shared masked rules and report',async()=>{
  const f=appFixture(),r=await inspectGitHubApp({client:f.client,installationId:7,repositoryId:ID,revision:REVISION});
  assert.equal(r.source,'github-app');assert.equal(r.verified_revision,true);assert.equal(r.repository_id,ID);assert.equal(r.findings[0].confidence,'low');
  assert.deepEqual(f.calls,['authorize','tree','blob','authorize']);assert.ok(!JSON.stringify(r).includes('synthetic_12345'));
  const report=renderReport({...r,id:'synthetic',repo:'synthetic-org/private-repo'});
  assert.match(report,/Aquisição GitHub App/);assert.match(report,/SWB&#45;TEXT&#45;001\/1/);assert.ok(!report.includes('apenas repositórios públicos de ofelipepeixoto'));
});
test('App scanner refuses revoked access before reads and refuses changed identity or tampered blobs',async()=>{
  const f=appFixture({denied:true});await assert.rejects(inspectGitHubApp({client:f.client,installationId:7,repositoryId:ID,revision:REVISION}));assert.deepEqual(f.calls,['authorize']);
  for(const options of [{changed:true},{tampered:true}])await assert.rejects(inspectGitHubApp({client:appFixture(options).client,installationId:7,repositoryId:ID,revision:REVISION}));
});
