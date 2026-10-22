/** QA-only admission. Activation is an explicit operator action, never startup. */
import {AnalysisJobError} from './analysis-jobs.mjs';

export const QA_LIMITS=Object.freeze({days:7,jobsPerDay:50,dispatches:3,fetchesPerAttempt:16,bytesPerAttempt:2*1024*1024});
const ACTORS=new Set(['171351708','322086368']);
const deny=(code='qa_closed',status=403)=>new AnalysisJobError(code,status);
export function createQaGuard({env={},db=env.DB,now=()=>new Date()}={}) {
  if(env?.WORKBENCH_QA_ENABLED!=='true') return undefined;
  const time=()=>{const n=new Date(now()).valueOf();if(!Number.isSafeInteger(n))throw deny();return n;};
  async function window() {
    let row;
    try {row=await db.prepare('SELECT * FROM workbench_qa_window WHERE id=1').bind().first();}
    catch {throw deny('storage_unavailable',503);}
    const n=time();
    if(!row||row.closed_at!==null||n<row.starts_at||n>=row.ends_at||row.ends_at-row.starts_at!==604800000)throw deny();
    return {...row,day:Math.floor((n-row.starts_at)/86400000),time:n};
  }
  async function check({githubId,ownerId,repositoryId,installationId,repo}={}) {
    const w=await window(), actor=String(githubId);
    if(!ACTORS.has(actor)||typeof ownerId!=='string'||!ownerId||
      (actor==='171351708'?ownerId!==env.WORKBENCH_OWNER_ID:ownerId!==`github:${actor}`))throw deny('qa_scope');
    let fixtures;
    try {fixtures=JSON.parse(w.fixtures_json);}catch {throw deny('qa_scope');}
    if(!Array.isArray(fixtures)||!fixtures.some(f=>f.githubId===actor&&f.repositoryId===repositoryId&&f.installationId===installationId&&(repo===undefined||f.repo===repo)&&
      /^(ofelipepeixoto|radartech-news)\/[A-Za-z0-9_.-]+$/.test(f.repo)))throw deny('qa_scope');
    return w;
  }
  async function capacity(scope) {
    const w=await check(scope);
    const n=await db.prepare('SELECT count(*) AS n FROM workbench_qa_reservations WHERE day=?').bind(w.day).first();
    if(n.n>=QA_LIMITS.jobsPerDay)throw deny('qa_quota',429);
    return w;
  }
  async function reservation({jobId,ownerId,githubId,project,revision}) {
    const w=await capacity({ownerId,githubId,repositoryId:project.repository_id,installationId:project.installation_id,repo:project.repo});
    return db.prepare('INSERT INTO workbench_qa_reservations (job_id,owner_id,github_id,repository_id,installation_id,repo,revision,day,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(jobId,ownerId,String(githubId),project.repository_id,project.installation_id,project.repo,revision,w.day,w.time);
  }
  async function checkJob(job) {
    return check({ownerId:job.owner_id,githubId:job.github_id,repositoryId:job.repository_id,installationId:job.installation_id,repo:job.repo});
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
  return {window,check,capacity,reservation,checkJob,dispatch};
}

/** Per-attempt transport, shared by authorization, refresh and acquisition.
 * At most two attempts/job => 32 requests and 4 MiB of response bodies/job.
 * No credentials/response bodies are recorded. Never call a paid AI provider.
 */
export function qaFetchBudget(fetcher,{now=()=>new Date(),endsAt}={}) {
  let calls=0,bytes=0;
  return async(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(new Date(now()).valueOf()>=endsAt)throw deny();
    if(url.protocol!=='https:'||!(url.hostname==='api.github.com'||(url.hostname==='github.com'&&url.pathname==='/login/oauth/access_token'))||++calls>QA_LIMITS.fetchesPerAttempt)throw deny('qa_consumption');
    const response=await fetcher(input,{...init,redirect:'manual'}), reader=response.body?.getReader();
    if(!reader)return response;
    const chunks=[];
    try {
      while(true) {
        const {done,value}=await reader.read();if(done)break;
        bytes+=value.byteLength;
        if(bytes>QA_LIMITS.bytesPerAttempt||new Date(now()).valueOf()>=endsAt||init?.signal?.aborted)throw deny('qa_consumption');
        chunks.push(value);
      }
    }catch(error){void reader.cancel().catch(()=>{});throw error;}
    finally {reader.releaseLock();}
    const body=new Uint8Array(chunks.reduce((n,c)=>n+c.byteLength,0));let offset=0;
    for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
    return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  };
}
