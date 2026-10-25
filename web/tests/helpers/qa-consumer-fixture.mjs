/** Own synthetic fixtures only. No provider, token or hosted D1 is contacted. */
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {migratedDatabase} from './d1-sqlite.mjs';
import {createAnalysisJobs} from '../../lib/analysis-jobs.mjs';
import {createQaGuard,QA_ALLOWED_GITHUB_IDS,QA_REPOSITORY_NAMESPACES} from '../../lib/qa-guard.mjs';
import {createAnalysisConsumer} from '../../workers/analysis-consumer.mjs';

// A live-relative anchor keeps SQL time constraints reproducible on later CI days.
export const START=Date.now(), REVISION='a'.repeat(40), TREE='b'.repeat(40);
// Identity/namespace are the published policy, never downloaded user records.
// Provider logins, repositories, installation IDs, credentials and files below
// are fabricated. Nothing authorizes contact with an actual repository.
export const ACTORS={
  A:{githubId:QA_ALLOWED_GITHUB_IDS[0],ownerId:'qa-primary',login:'fixture-a',namespace:QA_REPOSITORY_NAMESPACES[0],installationId:11,repositoryId:21},
  B:{githubId:QA_ALLOWED_GITHUB_IDS[1],ownerId:`github:${QA_ALLOWED_GITHUB_IDS[1]}`,login:'fixture-b',namespace:QA_REPOSITORY_NAMESPACES[1],installationId:12,repositoryId:22},
};
const encoder=new TextEncoder(),base64=bytes=>Buffer.from(bytes).toString('base64url');
const digest=bytes=>new Uint8Array(createHash('sha256').update(bytes).digest());
export function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

export async function qaConsumerFixture(t,options={}) {
  const db=migratedDatabase();t.after(()=>db.close());let clock=START;
  // Local SQL/API-call counts are not provider rows_read or CPU measurements.
  const d1={statements:0,apiCalls:0,reads:0,writes:0,batches:0};
  const prepare=db.prepare.bind(db),batch=db.batch.bind(db);let inBatch=false;
  db.prepare=query=>({bind(...values){
    const bound=prepare(query).bind(...values);
    return Object.fromEntries(['first','all','run'].map(method=>[method,async()=>{
      d1.statements++;d1[method==='run'?'writes':'reads']++;if(!inBatch)d1.apiCalls++;
      return bound[method]();
    }]));
  }});
  // D1 serializes transactions; serialize this async SQLite adapter as well.
  let transaction=Promise.resolve();
  db.batch=statements=>{
    const work=transaction.then(async()=>{d1.apiCalls++;d1.batches++;inBatch=true;try{return await batch(statements);}finally{inBatch=false;}});
    transaction=work.catch(()=>{});return work;
  };
  const state={files:options.files??1,installationPage:options.installationPage??1,repositoryPage:options.repositoryPage??1,
    revoked:false,suspended:false,contents:'read',pull:true,private:true,renamed:false,shaChanged:false,wrongIdentity:false};
  const env={DB:db,WORKBENCH_QA_ENABLED:'true',WORKBENCH_JOBS_ENABLED:'true',WORKBENCH_MULTIUSER_ENABLED:'true',
    GITHUB_APP_ENABLED:'true',GITHUB_OWNER_ID:ACTORS.A.githubId,WORKBENCH_OWNER_ID:ACTORS.A.ownerId,
    WORKBENCH_PILOT_GITHUB_IDS:ACTORS.B.githubId,WORKBENCH_ORIGIN:'https://synthetic.invalid',
    GITHUB_APP_ID:'123',GITHUB_APP_SLUG:'synthetic-app',GITHUB_APP_CLIENT_ID:'synthetic-client',
    GITHUB_APP_CLIENT_SECRET:'SYNTHETIC_ONLY_NEVER_VALID',GITHUB_APP_TOKEN_KEY:base64(crypto.getRandomValues(new Uint8Array(32))),GITHUB_APP_KEY_VERSION:'1'};
  const now=()=>new Date(clock),fixtures=Object.values(ACTORS).map(a=>({...a,repo:`${a.namespace}/synthetic-fixture` }));
  db.sql.prepare('INSERT INTO workbench_qa_window VALUES (1,?,?,?,NULL)').run(START,START+604800000,JSON.stringify(fixtures));
  const actors={};
  for(const [name,a] of Object.entries(ACTORS)) {
    const repo=`${a.namespace}/synthetic-fixture`,project={id:randomUUID(),repository_id:a.repositoryId,installation_id:a.installationId,repo};
    db.sql.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at,source,installation_id,visibility) VALUES (?,?,?,?,?,'github-app',?,'private')")
      .run(project.id,a.ownerId,repo,a.repositoryId,new Date(START).toISOString(),a.installationId);
    const token=`ghu_SYNTHETIC_ONLY_${name}_NEVER_VALID`;
    const configKey=base64(digest(encoder.encode(JSON.stringify([env.WORKBENCH_ORIGIN,123,env.GITHUB_APP_CLIENT_ID,'1']))));
    const expires=Math.floor(START/1000)+28800,iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await crypto.subtle.importKey('raw',Buffer.from(env.GITHUB_APP_TOKEN_KEY,'base64url'),{name:'AES-GCM'},false,['encrypt']);
    const aad=encoder.encode(JSON.stringify(['security-workbench.github-app/v1',a.ownerId,a.githubId,'1',configKey,expires]));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,encoder.encode(token));
    db.sql.prepare('INSERT INTO workbench_github_app_connections VALUES (?,?,?,?,?,?,?,?)').run(a.ownerId,a.githubId,
      JSON.stringify({v:1,iv:base64(iv),ciphertext:base64(new Uint8Array(ciphertext))}),'1',configKey,expires,START/1000,START/1000);
    const jobs=createAnalysisJobs({db,ownerId:a.ownerId,githubId:a.githubId,now,qaGuard:createQaGuard({env,now})});
    actors[name]={...a,project,jobs,user:{userId:a.ownerId,githubId:a.githubId,role:name==='A'?'admin':'member',provider:'github'},
      enqueue:(requestId=randomUUID())=>jobs.enqueue({project,requestId,revision:REVISION,confirmed:true})};
  }
  const calls=[],events=[];
  const bytes=Buffer.from('password="invalid_synthetic_marker"\n');
  const blobSha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const fetcher=async(input,init)=>{
    const url=new URL(input);assert.equal(url.origin,'https://api.github.com');assert.equal(init.redirect,'manual');
    assert.ok(init.signal);assert.equal(init.signal.aborted,false);
    const header=init.headers.Authorization;
    const name=Object.keys(actors).find(n=>header===`Bearer ghu_SYNTHETIC_ONLY_${n}_NEVER_VALID`);
    assert.ok(name,'only an actor-specific synthetic credential may reach the fake provider');
    const a=actors[name],path=url.pathname,page=Number(url.searchParams.get('page')||1);
    const stage=path==='/user'?'identity':path==='/user/installations'?'installations':path.includes('/user/')?'repositories':
      path.includes('/commits/')?'commit':path.includes('/trees/')?'tree':'blob';
    const entry={actor:name,stage,page};calls.push(entry);
    const intercepted=await options.onRequest?.({entry,state,db,actors,init,advance:ms=>{clock+=ms;},calls});
    if(intercepted instanceof Response)return intercepted;
    let value;
    const repository={id:a.repositoryId,name:state.renamed?'renamed':'synthetic-fixture',full_name:state.renamed?`${a.namespace}/renamed`:a.project.repo,
      owner:{id:Number(a.githubId),login:a.namespace,type:'User'},private:state.private,default_branch:'main',permissions:{pull:state.pull}};
    const installation={id:a.installationId,app_id:123,account:{id:Number(a.githubId),login:a.login,type:'User'},
      repository_selection:'selected',permissions:{contents:state.contents,metadata:'read'},suspended_at:state.suspended?'2026-10-25T12:00:00Z':null};
    if(stage==='identity')value={id:state.wrongIdentity?999:Number(a.githubId),login:a.login};
    else if(stage==='installations') {
      const filler=Array.from({length:100},(_,i)=>({...installation,id:1000+i}));
      value={total_count:state.revoked?0:state.installationPage===2?101:1,
        installations:state.revoked?[]:state.installationPage===2&&page===1?filler:[installation]};
    } else if(stage==='repositories') {
      assert.equal(path,`/user/installations/${a.installationId}/repositories`);
      const filler=Array.from({length:100},(_,i)=>({...repository,id:10000+i,name:`filler-${i}`,full_name:`${a.namespace}/filler-${i}`}));
      value={total_count:state.repositoryPage===2?101:1,repositories:state.repositoryPage===2&&page===1?filler:[repository]};
    } else {
      assert.ok(path.startsWith(`/repositories/${a.repositoryId}/`),'repo access cannot cross actors');
      if(stage==='commit')value={sha:state.shaChanged?'c'.repeat(40):REVISION,commit:{tree:{sha:TREE}}};
      else if(stage==='tree')value={sha:TREE,truncated:false,tree:Array.from({length:state.files},(_,i)=>({path:`fixture-${i}.js`,type:'blob',mode:'100644',size:bytes.length,sha:blobSha}))};
      else value={sha:blobSha,size:bytes.length,encoding:'base64',content:bytes.toString('base64')};
    }
    return Response.json(value);
  };
  const consumer=createAnalysisConsumer({env,now,fetcher,observe:e=>{events.push(e);options.observe?.(e);}});
  return {db,d1,env,state,actors,calls,events,fetcher,consumer,now,advance:ms=>{clock+=ms;},
    stored:job=>db.sql.prepare('SELECT status,result_json,failure_code FROM workbench_runs WHERE id=?').get(job.run_id),
    reservations:()=>db.sql.prepare('SELECT count(*) n FROM workbench_qa_reservations').get().n};
}
