/** QA-only admission. Activation is an explicit operator action, never startup. */
import {AnalysisJobError} from './analysis-jobs.mjs';
import {GitHubAppError} from './github-app-client.mjs';

export const QA_LIMITS=Object.freeze({days:7,jobsPerDay:50,dispatches:3,fetchesPerAttempt:16,bytesPerAttempt:2*1024*1024,canaryJobs:2,canaryDurationMs:900000});
const ACTORS=new Set(['171351708','322086368']);
// Read-only views of the already-public pilot policy, not an override. Tests
// reuse these constants with fabricated provider data instead of copying IDs.
export const QA_ALLOWED_GITHUB_IDS=Object.freeze([...ACTORS]);
export const QA_REPOSITORY_NAMESPACES=Object.freeze(['ofelipepeixoto','radartech-news']);
const REPOSITORY_SCOPE=new RegExp(`^(?:${QA_REPOSITORY_NAMESPACES.join('|')})/[A-Za-z0-9_.-]+$`);
const deny=(code='qa_closed',status=403)=>new AnalysisJobError(code,status);
export function createQaGuard({env={},db=env.DB,now=()=>new Date()}={}) {
  if(env?.WORKBENCH_QA_ENABLED!=='true') return undefined;
  const time=()=>{const n=new Date(now()).valueOf();if(!Number.isSafeInteger(n))throw deny();return n;};
  // Private operator configuration; never inferred from a browser-supplied repo.
  // This enables closed-state checks only, not admission or a pilot period.
  function closedCheckFixture({githubId,ownerId,provider}={}) {
    const actor=String(githubId);
    if(provider!=='github'||!ACTORS.has(actor)||
      ownerId!==(actor===QA_ALLOWED_GITHUB_IDS[0]?env.WORKBENCH_OWNER_ID:`github:${actor}`))throw deny('qa_scope');
    let fixtures;try{fixtures=JSON.parse(env.WORKBENCH_QA_CHECK_FIXTURES);}catch{throw deny('qa_scope');}
    if(!Array.isArray(fixtures)||fixtures.length!==2||new Set(fixtures.map(f=>f?.githubId)).size!==2||fixtures.some(f=>
      !f||Object.keys(f).sort().join(',')!=='githubId,installationId,repo,repositoryId'||!ACTORS.has(f.githubId)||
      !Number.isSafeInteger(f.repositoryId)||f.repositoryId<1||!Number.isSafeInteger(f.installationId)||f.installationId<1||
      typeof f.repo!=='string'||!REPOSITORY_SCOPE.test(f.repo)||f.repo.split('/')[0]!==QA_REPOSITORY_NAMESPACES[QA_ALLOWED_GITHUB_IDS.indexOf(f.githubId)]))throw deny('qa_scope');
    return {...fixtures.find(f=>f.githubId===actor)};
  }
  function closedCheckAvailable(scope) {try{closedCheckFixture(scope);return true;}catch{return false;}}
  async function closedCheck(scope) {
    const fixture=closedCheckFixture(scope);
    if(!/^https:\/\/security-workbench-qa\.[a-z0-9-]+\.workers\.dev$/.test(env.WORKBENCH_ORIGIN??''))throw deny('qa_scope');
    if(env.WORKBENCH_JOBS_ENABLED!=='false'||!/^[a-f0-9]{40}$/.test(env.WORKBENCH_QA_SOURCE_SHA??''))throw deny('qa_scope',409);
    let row;try{row=await db.prepare('SELECT * FROM workbench_qa_active_window WHERE id=1').bind().first();}catch{throw deny('storage_unavailable',503);}
    const n=time();
    if(row) {
      const duration=row.mode==='canary'?QA_LIMITS.canaryDurationMs:row.mode==='window'?604800000:null;
      if(duration===null||!Number.isSafeInteger(row.starts_at)||!Number.isSafeInteger(row.ends_at)||row.ends_at-row.starts_at!==duration||
        (row.closed_at!==null&&(!Number.isSafeInteger(row.closed_at)||row.closed_at<row.starts_at||row.closed_at>n)))throw deny('storage_unavailable',503);
      // A future opening is not accepted as a closed test environment either.
      if(row.closed_at===null&&n<row.ends_at)throw deny('qa_scope',409);
    }
    return {fixture,origin:env.WORKBENCH_ORIGIN,source_revision:env.WORKBENCH_QA_SOURCE_SHA,checked_at:new Date(n).toISOString()};
  }
  async function window() {
    let row;
    try {row=await db.prepare('SELECT * FROM workbench_qa_active_window WHERE id=1').bind().first();}
    catch {throw deny('storage_unavailable',503);}
    const n=time();
    if(!row||row.closed_at!==null||n<row.starts_at||n>=row.ends_at||row.ends_at-row.starts_at!==(row.mode==='canary'?QA_LIMITS.canaryDurationMs:604800000))throw deny();
    if(row.mode==='canary'&&row.source_sha!==env.WORKBENCH_QA_SOURCE_SHA)throw deny('qa_scope');
    return {...row,day:Math.floor((n-row.starts_at)/86400000),time:n};
  }
  async function check({githubId,ownerId,repositoryId,installationId,repo,revision}={}) {
    const w=await window(), actor=String(githubId);
    if(!ACTORS.has(actor)||typeof ownerId!=='string'||!ownerId||
      (actor==='171351708'?ownerId!==env.WORKBENCH_OWNER_ID:ownerId!==`github:${actor}`))throw deny('qa_scope');
    let fixtures;
    try {fixtures=JSON.parse(w.fixtures_json);}catch {throw deny('qa_scope');}
    if(!Array.isArray(fixtures)||!fixtures.some(f=>f.githubId===actor&&f.repositoryId===repositoryId&&f.installationId===installationId&&(repo===undefined||f.repo===repo)&&(revision===undefined||f.revision===revision)&&
      REPOSITORY_SCOPE.test(f.repo)))throw deny('qa_scope');
    return w;
  }
  async function capacity(scope) {
    const w=await check(scope);
    const n=await db.prepare('SELECT count(*) AS n,sum(CASE WHEN github_id=? THEN 1 ELSE 0 END) AS actor_n FROM workbench_qa_reservations WHERE day=?').bind(String(scope.githubId),w.day).first();
    if(n.n>=(w.mode==='canary'?QA_LIMITS.canaryJobs:QA_LIMITS.jobsPerDay)||(w.mode==='canary'&&n.actor_n>=1))throw deny('qa_quota',429);
    return w;
  }
  async function reservation({jobId,ownerId,githubId,project,revision}) {
    const w=await capacity({ownerId,githubId,repositoryId:project.repository_id,installationId:project.installation_id,repo:project.repo,revision});
    return db.prepare('INSERT INTO workbench_qa_reservations (job_id,owner_id,github_id,repository_id,installation_id,repo,revision,day,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(jobId,ownerId,String(githubId),project.repository_id,project.installation_id,project.repo,revision,w.day,w.time);
  }
  async function checkJob(job) {
    const w=await check({ownerId:job.owner_id,githubId:job.github_id,repositoryId:job.repository_id,installationId:job.installation_id,repo:job.repo,revision:job.revision});
    const created=Date.parse(job.created_at);
    if(!Number.isFinite(created)||created<w.starts_at||created>=w.ends_at)throw deny('qa_closed');
    return w;
  }
  async function dispatch(jobId,send) {
    const job=await db.prepare('SELECT * FROM workbench_analysis_jobs WHERE id=?').bind(jobId).first();
    if(!job)throw deny('not_found',404);
    const w=await checkJob(job);
    // Reserve before send. An ambiguous failure consumes a dispatch, never an
    // unlimited loop of writes. D1 serialization resolves UI/cron races.
    const result=await db.prepare('UPDATE workbench_qa_reservations SET dispatches=dispatches+1,next_dispatch_at=? WHERE job_id=? AND owner_id=? AND dispatches<3 AND next_dispatch_at<=?')
      .bind(w.time+60000,jobId,job.owner_id,w.time).run();
    if(result.meta?.changes!==1)return false;
    await send({jobId});return true;
  }
  async function catalogPolicies({ownerId,githubId,repositories=[]}={}) {
    if(!Array.isArray(repositories)||repositories.length>100)throw deny('invalid_request',400);
    let w;
    try {w=await window();}catch(error){if(error.code==='qa_closed')return repositories.map(()=>({can_analyze:false,reason:'qa_not_activated'}));throw error;}
    const actor=String(githubId);
    let fixtures;try {fixtures=JSON.parse(w.fixtures_json);}catch {throw deny('qa_scope');}
    const principal=ACTORS.has(actor)&&typeof ownerId==='string'&&ownerId&&(actor==='171351708'?ownerId===env.WORKBENCH_OWNER_ID:ownerId===`github:${actor}`);
    return repositories.map(repository=>({can_analyze:Boolean(principal&&Array.isArray(fixtures)&&fixtures.some(f=>f.githubId===actor&&f.repositoryId===repository.repositoryId&&f.installationId===repository.installationId&&f.repo===repository.repo&&REPOSITORY_SCOPE.test(f.repo))),reason:'qa_fixture_only'})).map(p=>p.can_analyze?{can_analyze:true,reason:null}:p);
  }
  async function catalogPolicy(scope={}) {return (await catalogPolicies({...scope,repositories:[scope]}))[0];}
  return {window,check,capacity,reservation,checkJob,dispatch,catalogPolicy,catalogPolicies,closedCheckFixture,closedCheckAvailable,closedCheck};
}

/** Per-attempt transport, shared by authorization, refresh and acquisition.
 * At most two attempts/job => 32 requests and 4 MiB of response bodies/job.
 * No credentials/response bodies are recorded. Never call a paid AI provider.
 */
export function qaFetchBudget(fetcher,{now=()=>new Date(),endsAt,observe,beforeRequest}={}) {
  let attempted=0,admitted=0,sent=0,bytes=0;
  const stats=()=>({attempted,sent,remaining:QA_LIMITS.fetchesPerAttempt-admitted,bytes});
  const emit=event=>{try{observe?.({...event,...stats()});}catch{/* diagnostics cannot affect authorization */}};
  const fail=(code='qa_consumption',status=403)=>{emit({type:'failure',code,status});throw new GitHubAppError(code,status);};
  const transport=async(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    const stage=url.pathname==='/user'?'identity':url.pathname==='/user/installations'?'installations':/^\/user\/installations\/\d+\/repositories$/.test(url.pathname)?'repositories':/\/commits\//.test(url.pathname)?'commit':/\/trees\//.test(url.pathname)?'tree':/\/blobs\//.test(url.pathname)?'blob':'other';
    attempted++;
    if(new Date(now()).valueOf()>=endsAt)fail('qa_closed');
    if(init?.signal?.aborted) {if(init.signal.reason instanceof GitHubAppError)throw init.signal.reason;fail('timeout',504);}
    if(url.protocol!=='https:'||!(url.hostname==='api.github.com'||(url.hostname==='github.com'&&url.pathname==='/login/oauth/access_token'))||admitted>=QA_LIMITS.fetchesPerAttempt)fail();
    // Reserve synchronously before the async liveness query so parallel calls
    // cannot both take the last slot. A denied dispatch never refunds a slot.
    admitted++;
    await beforeRequest?.();
    if(new Date(now()).valueOf()>=endsAt)fail('qa_closed');
    if(init?.signal?.aborted) {
      if(init.signal.reason instanceof GitHubAppError)throw init.signal.reason;
      fail('timeout',504);
    }
    sent++;emit({type:'request',stage});
    const response=await fetcher(input,{...init,redirect:'manual'}), reader=response.body?.getReader();
    emit({type:'response',stage,status:response.status});
    if(!reader)return response;
    const chunks=[];
    try {
      while(true) {
        const {done,value}=await reader.read();if(done)break;
        bytes+=value.byteLength;
        if(new Date(now()).valueOf()>=endsAt)fail('qa_closed');
        if(init?.signal?.aborted) {if(init.signal.reason instanceof GitHubAppError)throw init.signal.reason;fail('timeout',504);}
        if(bytes>QA_LIMITS.bytesPerAttempt)fail();
        chunks.push(value);
      }
    }catch(error){void reader.cancel().catch(()=>{});throw error;}
    finally {reader.releaseLock();}
    const body=new Uint8Array(chunks.reduce((n,c)=>n+c.byteLength,0));let offset=0;
    for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
    return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  };
  transport.stats=stats;
  transport.canAcquire=reserve=>Number.isSafeInteger(reserve)&&reserve>=0&&stats().remaining>reserve;
  return transport;
}
