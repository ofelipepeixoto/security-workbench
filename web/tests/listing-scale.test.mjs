import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubAppClient} from '../lib/github-app-client.mjs';
import {handleWorkbenchRequest} from '../lib/workbench-service.mjs';
import {migratedDatabase} from './helpers/d1-sqlite.mjs';

const A={userId:'legacy-admin',githubId:'11',role:'admin',provider:'github',csrfToken:'c'.repeat(43)};
const B={userId:'github:22',githubId:'22',role:'member',provider:'github',csrfToken:'c'.repeat(43)};
const policy={multiUserEnabled:true,githubOwnerId:'11',workbenchOwnerId:A.userId,allowedGitHubIds:['22']};
const stamp='2026-10-22T01:00:00.000Z',sha='a'.repeat(40);
const json=value=>Response.json(value);
const installation=id=>({id,app_id:20,account:{id:11,login:'synthetic-org',type:'Organization'},permissions:{contents:'read',metadata:'read'},suspended_at:null});
const repository=id=>({id,name:'fixture-'+id,full_name:'synthetic-org/fixture-'+id,owner:{id:11,login:'synthetic-org',type:'Organization'},private:true,default_branch:'main',permissions:{pull:true}});
function fixture(t,{count=100,noise=0,latency=200,installations=[7],missing=new Set(),failPage,identity='11'}={}){
  t.mock.timers.enable({apis:['Date'],now:Date.parse(stamp)});
  const db=migratedDatabase(),calls=[],ids=[];
  const state={missing,failPage,identity,suspended:false,denied:false};
  for(const user of [A,B]) for(let i=0;i<count;i++){
    const id=crypto.randomUUID(),run=crypto.randomUUID(),repoId=(user===A?1000:2000)+i,install=installations[i%installations.length];
    db.sql.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at,source,installation_id,visibility) VALUES (?,?,?,?,?,'github-app',?,'private')").run(id,user.userId,repository(repoId).full_name,repoId,stamp,install);
    db.sql.prepare("INSERT INTO workbench_runs (id,owner_id,project_id,repo,repository_id,request_id,status,result_json,created_at,updated_at) VALUES (?,?,?,?,?,?,'complete',?,?,?)").run(run,user.userId,id,repository(repoId).full_name,repoId,crypto.randomUUID(),JSON.stringify({source:'github-app',findings:[],files_read:1,partial:true}),stamp,stamp);
    ids.push({user,id,run,repoId,install});
  }
  const queries=[],prepare=db.prepare.bind(db);
  db.prepare=sql=>{
    queries.push(sql);const statement=prepare(sql);
    return {bind(...values){assert.ok(values.length<=100,'D1 binding limit');return statement.bind(...values);}};
  };
  const fetcher=async(url,init)=>{
    const u=new URL(url),page=Number(u.searchParams.get('page')||1);
    calls.push(u.pathname+'?page='+page); t.mock.timers.tick(latency);
    assert.equal(init.headers.Authorization,'Bearer ghu_synthetic_access');
    if(u.pathname==='/user')return json({id:Number(state.identity),login:'fixture-user'});
    if(state.denied)return new Response('DO_NOT_EXPOSE_PROVIDER_BODY',{status:403});
    if(u.pathname==='/user/installations')return json({total_count:installations.length,installations:installations.map(id=>({...installation(id),suspended_at:state.suspended?stamp:null}))});
    const match=/^\/user\/installations\/(\d+)\/repositories$/.exec(u.pathname);
    if(match){
      if(state.failPage===page)return new Response('DO_NOT_EXPOSE_PROVIDER_BODY',{status:429,headers:{'Retry-After':'120'}});
      const list=[...Array.from({length:noise},(_,i)=>repository(9000+i)),...ids.filter(x=>x.user===A&&x.install===Number(match[1])&&!state.missing.has(x.repoId)).map(x=>repository(x.repoId))];
      return json({total_count:list.length,repositories:list.slice((page-1)*100,page*100)});
    }
    if(/\/commits\//.test(u.pathname))return json({sha,commit:{tree:{sha:'b'.repeat(40)}}});
    throw Error('Unexpected synthetic endpoint');
  };
  const app={enabled:true,getClient:async(user)=>createGitHubAppClient({accessToken:'ghu_synthetic_access',expectedGitHubId:user.githubId,appId:20,fetcher,random:()=>0})};
  const api=async(user=A,payload)=>{
    const req=new Request('https://workbench.example/api/workbench',payload?{method:'POST',headers:{Origin:'https://workbench.example','Content-Type':'application/json','X-Workbench-CSRF':user.csrfToken},body:JSON.stringify(payload)}:{});
    const r=await handleWorkbenchRequest(req,{getUser:async()=>user,getDb:()=>db,authorizedOwnerId:A.userId,accessPolicy:policy,githubApp:app});
    return{status:r.status,body:await r.json()};
  };
  return{db,calls,queries,ids,state,api,close:()=>db.close()};
}
for(const count of [90,100])test(`${count} projects revalidate in three provider calls with synthetic latency and no commit reads`,async t=>{
  const f=fixture(t,{count});
  try{
    const started=Date.now(),r=await f.api();
    t.diagnostic(JSON.stringify({projects:count,status:r.status,provider_calls:f.calls.length,simulated_ms:Date.now()-started,commit_reads:f.calls.filter(x=>x.includes('/commits/')).length}));
    assert.equal(r.status,200);assert.equal(r.body.projects.length,count);assert.equal(r.body.runs.length,count);
    assert.equal(f.calls.length,3);assert.equal(Date.now()-started,600);
    assert.ok(f.calls.every(x=>!x.includes('/commits/')));assert.doesNotMatch(JSON.stringify(r.body),/fixture-20\d\d/);
  }finally{f.close();}
});
test('100 projects over two installations and repository pages reuse only this operation inventory',async t=>{
  const f=fixture(t,{noise:100,installations:[7,8],latency:250});
  try{
    const r=await f.api();assert.equal(r.status,200);assert.equal(r.body.projects.length,100);
    assert.equal(f.calls.length,6);assert.equal(f.calls.filter(x=>x.startsWith('/user/installations?page')).length,1);
    assert.equal(f.calls.filter(x=>x.includes('/repositories?')).length,4);
    assert.ok(f.calls.every(x=>!x.includes('/commits/')));
  }finally{f.close();}
});
test('page two rate limit returns an explicit safe error and no partial private history',async t=>{
  const f=fixture(t,{noise:100,failPage:2});
  try{
    const r=await f.api();assert.equal(r.status,429);assert.equal(r.body.code,'rate_limited');assert.ok(r.body.retry_at);
    assert.equal(r.body.projects,undefined);assert.equal(r.body.runs,undefined);assert.doesNotMatch(JSON.stringify(r.body),/fixture-|DO_NOT_EXPOSE/);
    assert.equal(f.calls.length,4);
  }finally{f.close();}
});
test('a new request revalidates revocation; results absent from a completed inventory stay hidden',async t=>{
  const f=fixture(t);
  try{
    assert.equal((await f.api()).body.projects.length,100);f.calls.length=0;
    const revoked=f.ids.find(x=>x.user===A);f.state.missing.add(revoked.repoId);
    const r=await f.api();assert.equal(r.status,200);assert.equal(r.body.projects.length,99);assert.equal(r.body.access_restricted,true);
    assert.ok(r.body.runs.every(x=>x.id!==revoked.run));assert.ok(r.body.projects.every(x=>x.id!==revoked.id));assert.equal(f.calls.length,3);
    for(const action of ['run','report']){const denied=await f.api(A,{action,runId:revoked.run});assert.equal(denied.status,404);assert.doesNotMatch(JSON.stringify(denied.body),/fixture-/);}
  }finally{f.close();}
});
test('provider denial, identity mismatch and cross-user result lookup never disclose private content',async t=>{
  const f=fixture(t);
  try{
    f.state.denied=true;const denied=await f.api();assert.equal(denied.status,403);assert.equal(denied.body.projects,undefined);
    assert.doesNotMatch(JSON.stringify(denied.body),/fixture-|DO_NOT_EXPOSE/);
    f.state.denied=false;
    const other=f.ids.find(x=>x.user===B);f.calls.length=0;
    for(const action of ['run','report','review']){const r=await f.api(A,{action,runId:other.run});assert.equal(r.status,404);assert.doesNotMatch(JSON.stringify(r.body),/fixture-/);}
    assert.equal(f.calls.length,0);
    const wrongIdentity=await f.api(B);assert.equal(wrongIdentity.status,401);assert.equal(wrongIdentity.body.projects,undefined);
  }finally{f.close();}
});

test('the original shared 45 second deadline still rejects a slow multi-page access snapshot',async t=>{
  const f=fixture(t,{noise:1900,latency:9000});
  try{
    const started=Date.now(),r=await f.api();assert.equal(r.status,504);assert.equal(r.body.code,'timeout');
    assert.equal(Date.now()-started,45000);assert.equal(f.calls.length,5);
    assert.equal(r.body.projects,undefined);assert.equal(r.body.runs,undefined);
  }finally{f.close();}
});

test('100 revoked and restored projects respect D1 bindings, bounded statements and owner isolation',async t=>{
  const f=fixture(t);
  try{
    f.ids.filter(x=>x.user===A).forEach(x=>f.state.missing.add(x.repoId));
    const denied=await f.api();assert.equal(denied.status,200);assert.equal(denied.body.access_restricted,true);assert.equal(denied.body.projects.length,0);
    assert.equal(f.queries.length,4);assert.equal(f.queries.filter(x=>x.startsWith('UPDATE')).length,2);
    assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM workbench_projects WHERE owner_id=? AND revoked_at IS NOT NULL').get(A.userId).n,100);
    assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM workbench_projects WHERE owner_id=? AND revoked_at IS NOT NULL').get(B.userId).n,0);
    f.queries.length=0;assert.equal((await f.api()).status,200);assert.equal(f.queries.length,2);assert.equal(f.queries.filter(x=>x.startsWith('UPDATE')).length,0);
    f.state.missing.clear();f.queries.length=0;
    assert.equal((await f.api()).body.projects.length,100);assert.equal(f.queries.length,4);
    assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM workbench_projects WHERE revoked_at IS NOT NULL').get().n,0);
  }finally{f.close();}
});

test('mixed revocation and restoration stays within five D1 statements and 100 bindings',async t=>{
  const f=fixture(t);
  try{
    const own=f.ids.filter(x=>x.user===A),restored=own[0];
    f.db.sql.prepare('UPDATE workbench_projects SET revoked_at=? WHERE id=?').run(stamp,restored.id);
    own.slice(1).forEach(x=>f.state.missing.add(x.repoId));
    const r=await f.api();assert.equal(r.status,200);assert.equal(r.body.projects.length,1);assert.equal(r.body.projects[0].id,restored.id);
    assert.equal(f.queries.length,5);assert.equal(f.queries.filter(x=>x.startsWith('UPDATE')).length,3);
    assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM workbench_projects WHERE owner_id=? AND revoked_at IS NOT NULL').get(B.userId).n,0);
  }finally{f.close();}
});
