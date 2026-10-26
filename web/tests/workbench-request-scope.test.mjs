import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { applyWorkbenchRequest, callWorkbenchCatalog, createWorkbenchCatalogRecovery, createWorkbenchRequestScope, downloadWorkbenchMarkdown, exportWorkbenchReport, invalidateWorkbenchAccess, workbenchFailureScope } from '../lib/workbench-request-scope.mjs';
import { createGitHubSessionMonitor } from '../lib/github-session-monitor.mjs';

function deferred() { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; }
const flush = () => new Promise(resolve => setImmediate(resolve));
const reportBody = { filename:'synthetic-review.md', markdown:'# Synthetic account A\n\nPrivate fixture only.' };
const response = () => Response.json(reportBody, {status:200});
function downloadFixture() {
  const clicks=[], blobs=[], revocations=[]; let notices=0, failures=0, settled=0;
  const browser = {
    document:{body:{appendChild(){}},createElement(tag) { assert.equal(tag,'a'); return {href:'',download:'',click(){clicks.push({href:this.href,filename:this.download});},remove(){}}; }},
    url:{createObjectURL(blob){blobs.push(blob);return 'blob:synthetic';},revokeObjectURL(value){revocations.push(value);}},setTimer(fn){fn();},
  };
  return {clicks,blobs,revocations,get notices(){return notices;},get failures(){return failures;},get settled(){return settled;},effects:{download:(content,filename)=>downloadWorkbenchMarkdown(content,filename,browser),notice(){notices++;},failure(){failures++;},settled(){settled++;}}};
}
function beginExport(scope) {
  const http=deferred(), effects=downloadFixture(), request=scope.begin();
  const done=exportWorkbenchReport(request,async current=>{ assert.equal(current.signal,request.signal); return (await http.promise).json(); },effects.effects);
  return {http,effects,request,done};
}

test('current HTTP 200 uses the real Markdown Blob/anchor adapter once, then releases its operation',async()=>{
  const scope=createWorkbenchRequestScope(), f=beginExport(scope);
  f.http.resolve(response()); await f.done;
  assert.equal(f.effects.clicks.length,1); assert.equal(f.effects.clicks[0].filename,'synthetic-review.md');
  assert.equal(await f.effects.blobs[0].text(),reportBody.markdown); assert.equal(f.effects.notices,1); assert.equal(f.effects.settled,1);
  assert.deepEqual(f.effects.revocations,['blob:synthetic']); assert.equal(f.request.signal.aborted,true);
});

test('deferred report HTTP 200 after login loss/logout cannot create a Blob, click an anchor or announce success',async()=>{
  for(const status of [401,403]) {
    const scope=createWorkbenchRequestScope(), f=beginExport(scope);
    assert.equal(invalidateWorkbenchAccess(scope,{status}),'login_session'); assert.equal(f.request.signal.aborted,true);
    f.http.resolve(response()); await f.done;
    assert.equal(f.effects.blobs.length,0); assert.equal(f.effects.clicks.length,0); assert.equal(f.effects.notices,0); assert.equal(f.effects.settled,0); assert.equal(f.effects.failures,0);
    assert.equal(scope.begin().isCurrent(),false);
  }
});

test('A→B and a renewed A session invalidate the actual pending export path before a late 200',async()=>{
  for(const displayName of ['fixture-member','fixture-owner']) {
    const now=Date.now(), initialSession={state:'authenticated',provider:'github',displayName:'fixture-owner',sessionKey:'a'.repeat(43),verifiedAt:now,expiresAt:now+120_000};
    const scope=createWorkbenchRequestScope({expiresAt:initialSession.expiresAt});
    let current=initialSession;
    const monitor=createGitHubSessionMonitor({initialSession,fetcher:async()=>Response.json({session:current}),onSessionLost:()=>invalidateWorkbenchAccess(scope,{status:401})});
    try {
      monitor.start(); await flush(); assert.equal(monitor.getSnapshot().state,'authenticated');
      const f=beginExport(scope); current={...initialSession,displayName,sessionKey:'b'.repeat(43)};
      await monitor.refresh(); assert.equal(monitor.getSnapshot().state,'changed');
      f.http.resolve(response()); await f.done;
      assert.equal(f.effects.blobs.length,0); assert.equal(f.effects.clicks.length,0); assert.equal(f.effects.notices,0); assert.equal(scope.isOpen(),false);
    } finally { monitor.stop(); }
  }
});

test('App revocation fences a deferred report without invalidating the independent valid login',async()=>{
  const now=Date.now(), initialSession={state:'authenticated',provider:'github',displayName:'fixture-owner',sessionKey:'a'.repeat(43),verifiedAt:now,expiresAt:now+120_000};
  const scope=createWorkbenchRequestScope(), monitor=createGitHubSessionMonitor({initialSession,fetcher:async()=>Response.json({session:initialSession})});
  try {
    monitor.start(); await flush(); const f=beginExport(scope), previewGuard=scope.capture();
    assert.equal(invalidateWorkbenchAccess(scope,{status:401,code:'revoked'}),'repository_access');
    assert.equal(monitor.getSnapshot().state,'authenticated'); assert.equal(scope.isOpen(),true); assert.equal(previewGuard(),false);
    f.http.resolve(response()); await f.done; assert.equal(f.effects.clicks.length,0); assert.equal(f.effects.notices,0);
    const fresh=beginExport(scope); fresh.http.resolve(response()); await fresh.done; assert.equal(fresh.effects.clicks.length,1);
  } finally { monitor.stop(); }
});

test('expiry gate prevents a late response even before a throttled monitor timer can run',async()=>{
  let now=1000; const scope=createWorkbenchRequestScope({expiresAt:2000,now:()=>now}), f=beginExport(scope);
  now=2000; f.http.resolve(response()); await f.done;
  assert.equal(f.effects.blobs.length,0); assert.equal(f.effects.notices,0); assert.equal(scope.isOpen(),false);
});

test('all real response-application callbacks, errors and finally effects are fenced after invalidation',async()=>{
  for(const rejects of [false,true]) {
    const scope=createWorkbenchRequestScope(), request=scope.begin(), http=deferred(), effects=[];
    const done=applyWorkbenchRequest(request,()=>http.promise,{success(){effects.push('state','navigation','notice');},failure(){effects.push('error');},settled(){effects.push('settled');}});
    scope.invalidate();
    if(rejects)http.reject(new Error('old synthetic request')); else http.resolve({run:{id:'synthetic-run'}});
    await done; assert.deepEqual(effects,[]);
  }
});

test('effect cleanup or caller abort suppresses responses even if the transport ignores AbortSignal',async()=>{
  for(const method of ['finish','external']) {
    const scope=createWorkbenchRequestScope(), external=new AbortController(), request=scope.begin(external.signal), http=deferred(), effects=[];
    const done=applyWorkbenchRequest(request,()=>http.promise,{success:()=>effects.push('private-state'),failure:()=>effects.push('error'),settled:()=>effects.push('settled')});
    if(method==='finish')request.finish(); else external.abort();
    http.resolve(reportBody); await done; assert.deepEqual(effects,[]); assert.equal(request.signal.aborted,true);
  }
});

test('known repository loss stays separate from login and rate limiting never revokes the session',()=>{
  for(const code of ['disconnected','not_connected','expired','revoked','access_revoked','forbidden','suspended','insufficient_permission','not_found']) assert.equal(workbenchFailureScope({status:403,code}),'repository_access');
  for(const cause of [{status:429},{status:403,code:'rate_limited'},{status:401,code:'rate_limited'}]) {
    const scope=createWorkbenchRequestScope(), current=scope.capture();
    assert.equal(invalidateWorkbenchAccess(scope,cause),'other'); assert.equal(current(),true); assert.equal(scope.isOpen(),true);
  }
});

test('an access generation captured by a preview or modal cannot become valid again after recovery',()=>{
  const scope=createWorkbenchRequestScope(), old=scope.capture(), request=scope.begin(); scope.close(); scope.open();
  assert.equal(old(),false); assert.equal(request.isCurrent(),false); assert.equal(scope.capture()(),true);
});

test('persistent App revocation and denied deep-link jobs stop automatic catalog reads until explicit recovery',async()=>{
  for(const denial of [{status:401,code:'revoked'},{status:404,code:'not_found'}]) {
    const scope=createWorkbenchRequestScope(), recovery=createWorkbenchCatalogRecovery(), calls=[];
    const fail=cause=>invalidateWorkbenchAccess(scope,cause,recovery);
    const call=action=>callWorkbenchCatalog(scope.begin(),recovery,async()=>{
      calls.push(action);
      if(action==='job' || denial.code==='revoked') throw Object.assign(new Error('Synthetic access denied'),denial);
      return {synthetic:true};
    },fail);
    const open=async()=>{ for(const action of ['catalog-status','catalog-installations','catalog-repositories','job']) await call(action); };
    await assert.rejects(open(),/Synthetic access denied/);
    const first=calls.length; assert.equal(first,denial.code==='revoked'?1:4);
    assert.equal(recovery.isBlocked(),true); assert.equal(scope.isOpen(),true);
    for(let i=0;i<10;i++)await assert.rejects(open(),{name:'AbortError'});
    assert.equal(calls.length,first);
    recovery.resume(); await assert.rejects(open(),/Synthetic access denied/);
    assert.equal(calls.length,first*2); assert.equal(recovery.isBlocked(),true);
  }
});

test('catalog wrapper rejects a late successful job after access changes, before callback/navigation',async()=>{
  const scope=createWorkbenchRequestScope(), recovery=createWorkbenchCatalogRecovery(), http=deferred(), effects=[];
  const done=callWorkbenchCatalog(scope.begin(),recovery,()=>http.promise,()=>effects.push('failure'),()=>effects.push('job-navigation'));
  invalidateWorkbenchAccess(scope,{status:401},recovery); http.resolve({job:{id:'synthetic-job'}});
  await assert.rejects(done,{name:'AbortError'}); assert.deepEqual(effects,[]);
});

test('the actual parent scope lifecycle uses layout setup/cleanup before child passive requests',()=>{
  const source=ts.createSourceFile('workbench.tsx',readFileSync(new URL('../app/workbench.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const lifecycles=[];
  function visit(node) {
    if(ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['useEffect','useLayoutEffect'].includes(node.expression.text)) {
      const callback=node.arguments[0];
      if(callback?.getText(source).includes('accessRequests.open()')) lifecycles.push({hook:node.expression.text,callback:callback.getText(source)});
    }
    ts.forEachChild(node,visit);
  }
  visit(source); assert.equal(lifecycles.length,1); assert.equal(lifecycles[0].hook,'useLayoutEffect'); assert.match(lifecycles[0].callback,/return\s*\(\)\s*=>\s*accessRequests\.close\(\)/);
});

// These are lifecycle-order contract tests of the real request scope. They do
// not simulate React or claim a DOM mount: actual React/StrictMode rendering is
// a separate preview/browser check. The child captures the same external guard
// used by createCatalogRequestScope, then crosses the real microtask boundary.
test('layout-before-passive ordering admits the first catalog read; the old passive-parent ordering reproduces the stall',async()=>{
  const scope=createWorkbenchRequestScope(); let reads=0;
  const childPassive=()=>{const current=scope.capture();return Promise.resolve().then(()=>{if(current())reads++;});};
  const oldChild=childPassive(); scope.open(); await oldChild; assert.equal(reads,0);
  scope.close(); scope.open(); const mountedChild=childPassive(); await mountedChild; assert.equal(reads,1);
});

test('StrictMode layout cleanup/reopening rejects old child tickets and admits fresh child requests without extending expiry',async()=>{
  let now=1000; const scope=createWorkbenchRequestScope({expiresAt:2000,now:()=>now}); let reads=0;
  scope.open(); const first=scope.begin(), firstGuard=scope.capture();
  const oldResponse=Promise.resolve().then(()=>{if(first.isCurrent())reads++;});
  scope.close(); assert.equal(first.signal.aborted,true); scope.open();
  const second=scope.begin(), secondGuard=scope.capture();
  const freshResponse=Promise.resolve().then(()=>{if(second.isCurrent())reads++;});
  await Promise.all([oldResponse,freshResponse]); assert.equal(reads,1); assert.equal(firstGuard(),false); assert.equal(secondGuard(),true);
  scope.close(); now=2000; scope.open(); assert.equal(scope.isOpen(),false); assert.equal(scope.begin().isCurrent(),false); assert.equal(secondGuard(),false);
});
