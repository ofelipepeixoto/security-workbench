import test from 'node:test';
import assert from 'node:assert/strict';
import {createSmokeDiagnostics} from './live-smoke-diagnostics.mjs';

test('diagnostic records rate-limit evidence while preserving the same unconsumed response and init',async()=>{
  const response=new Response('PRIVATE_BODY',{status:403,headers:{'x-ratelimit-remaining':'0','x-ratelimit-limit':'60','x-ratelimit-reset':'1792641000','x-not-allowed':'PRIVATE_HEADER'}});
  const init={headers:{Authorization:'PRIVATE_AUTH'},redirect:'manual'};
  const d=createSmokeDiagnostics(async(_url,received)=>{assert.equal(received,init);return response;});
  assert.equal(await d.fetcher('https://api.github.com/repos/other/private',init),response);
  assert.equal(response.bodyUsed,false);
  const result=d.snapshot(Error('PRIVATE_MESSAGE'));
  assert.equal(result.category,'external_rate_limit');assert.equal(result.requests[0].stage,'metadata');
  assert.equal(result.requests[0].rate_remaining,0);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|other|private|Authorization|stack|cause/);
});
test('diagnostics distinguish external HTTP, transport and local assertion without guessing historic causes',async()=>{
  const d=createSmokeDiagnostics(async()=>new Response('{}',{status:404,headers:{'retry-after':'PRIVATE_VALUE','x-ratelimit-limit':'PRIVATE_VALUE'}}));
  await d.fetcher('https://api.github.com/repos/owner/private/git/commits/opaque');
  assert.equal(d.snapshot(Error()).category,'external_http_response');
  assert.equal(d.snapshot(Error()).requests[0].retry_after,null);
  const original=Error('SECRET https://private.example');
  const broken=createSmokeDiagnostics(async()=>{throw original;});
  await assert.rejects(broken.fetcher('https://private.example'),e=>e===original);
  assert.equal(broken.snapshot(original).category,'transport_failure');
  assert.doesNotMatch(JSON.stringify(broken.snapshot(original,'SECRET')),/SECRET|private\.example/);
  const local=createSmokeDiagnostics(async()=>new Response('{}'));
  await local.fetcher('https://api.github.com/repos/owner/fixture/git/blobs/opaque');
  const assertion=new assert.AssertionError({message:'SECRET',actual:'PRIVATE'});
  assert.equal(local.snapshot(assertion,'snapshot_digest').category,'smoke_assertion');
  assert.equal(local.snapshot(assertion,'snapshot_digest').check,'snapshot_digest');
});
test('bounded diagnostics do not add requests or read request/body content',async()=>{
  let calls=0;const d=createSmokeDiagnostics(async()=>{calls++;return new Response('{}');});
  for(let n=0;n<40;n++)await d.fetcher('https://api.github.com/repos/owner/fixture/git/trees/opaque');
  assert.equal(calls,40);assert.equal(d.snapshot().requests.length,32);
});
