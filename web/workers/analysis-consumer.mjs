/** Separate, disabled-by-default Queue consumer. This is not a Sites HTTP route.
 * A deployment, Queue + scheduler + same approved QA D1/secret bindings are still
 * required. No native REA, target execution, package install or credentials in jobs.
 */
import {createGitHubAppAuth} from '../lib/github-app-auth.mjs';
import {GitHubAppError} from '../lib/github-app-client.mjs';
import {resolveWorkspacePrincipal} from '../lib/github-auth.mjs';
import {createAnalysisJobs, recoverAnalysisJobs, AnalysisJobError} from '../lib/analysis-jobs.mjs';
import {inspectGitHubApp} from '../lib/scanner.mjs';
import {createQaGuard,qaFetchBudget} from '../lib/qa-guard.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function policy(env) {
  return {multiUserEnabled:env.WORKBENCH_MULTIUSER_ENABLED==='true',githubOwnerId:env.GITHUB_OWNER_ID,
    workbenchOwnerId:env.WORKBENCH_OWNER_ID,allowedGitHubIds:env.WORKBENCH_PILOT_GITHUB_IDS?env.WORKBENCH_PILOT_GITHUB_IDS.split(','):[]};
}
function appConfig(env) {
  return {enabled:env.GITHUB_APP_ENABLED==='true'&&env.WORKBENCH_MULTIUSER_ENABLED==='true',origin:env.WORKBENCH_ORIGIN,
    appId:env.GITHUB_APP_ID,slug:env.GITHUB_APP_SLUG,clientId:env.GITHUB_APP_CLIENT_ID,clientSecret:env.GITHUB_APP_CLIENT_SECRET,
    encryptionKey:env.GITHUB_APP_TOKEN_KEY,keyVersion:env.GITHUB_APP_KEY_VERSION||'1'};
}
export function createAnalysisConsumer({env,fetcher=fetch,now=()=>new Date(),appAuthFactory=createGitHubAppAuth,observe}={}) {
  const qaGuard=createQaGuard({env,now});
  const active=()=>env?.WORKBENCH_JOBS_ENABLED==='true'&&env.WORKBENCH_MULTIUSER_ENABLED==='true'&&env.GITHUB_APP_ENABLED==='true'&&env.DB?.batch;
  async function process(jobId) {
    if (!active()) throw new AnalysisJobError('worker_unavailable');
    if(typeof jobId!=='string'||!UUID.test(jobId)) throw new AnalysisJobError('invalid_request',400);
    const row=await env.DB.prepare('SELECT * FROM workbench_analysis_jobs WHERE id=?').bind(jobId).first();
    if(!row) return null;
    const window=qaGuard?await qaGuard.checkJob(row):null;
    const principal=resolveWorkspacePrincipal(policy(env),row.github_id);
    let phase='authorization_initial',assertRunning;
    const emit=event=>{if(event.phase)phase=event.phase;try{observe?.({...event,phase});}catch{/* diagnostic callbacks cannot affect work */}};
    const guardedTransport=async(input,init)=>{await assertRunning?.();return fetcher(input,init);};
    const transport=window?qaFetchBudget(fetcher,{now,endsAt:window.ends_at,observe:emit,beforeRequest:()=>assertRunning?.()}):guardedTransport;
    const app=appAuthFactory({config:appConfig(env),db:env.DB,fetcher:transport,now});
    if(!app.enabled) throw new AnalysisJobError('worker_unavailable');
    const user=principal?{...principal,provider:'github'}:null;
    const allowed=principal?.userId===row.owner_id;
    let execution,initialAuthorization,initialRepository,checks=0;
    const getClient=async(signal,job)=>{
      if(typeof app.createExecutionContext==='function') {
        execution??=app.createExecutionContext(user,{signal,jobId:job.id,leaseToken:job.lease_token});
        return execution.getClient();
      }
      return app.getClient(user,{signal});
    };
    const authorize=async(job,{signal,assertActive})=>{
      if(!allowed) return false;
      assertRunning=assertActive;
      emit({type:'phase',phase:checks===0?'authorization_initial':'authorization_final'});
      const client=await getClient(signal,job),options={installationId:job.installation_id,repositoryId:job.repository_id,revision:job.revision};
      let access;
      if(checks===0&&typeof client.authorizeForAcquisition==='function') {
        const prepared=await client.authorizeForAcquisition(options);
        access=prepared.access;initialAuthorization=prepared.ticket;
      } else access=await client.authorizeRepository(options);
      if(checks===0)initialRepository={private:access.repository.private,visibility:access.repository.visibility};
      checks++;
      // A rename/transfer requires a new explicit selection, preserving history.
      return access.repository.id===job.repository_id&&access.repository.full_name===job.repo&&access.revision===job.revision&&
        access.repository.private===initialRepository.private&&access.repository.visibility===initialRepository.visibility;
    };
    return createAnalysisJobs({db:env.DB,ownerId:row.owner_id,githubId:row.github_id,now,authorize,qaGuard,observe:emit,
      ...(typeof app.createExecutionContext==='function'?{persistenceProof:()=>execution?.persistenceProof()}:{}),
      ...(window?{timeoutMs:Math.max(1,Math.min(45000,window.ends_at-new Date(now()).valueOf()))}:{}),
      analyze:async(job,{signal,assertActive})=>{
        const client=await getClient(signal,job);
        // Reserve the cost actually observed for this installation/repository
        // pagination, twice: scanner exit and the job's final authorization.
        const cost=window?client.authorizationRequestCost?.():0;
        if(window&&(!Number.isSafeInteger(cost)||cost<3))throw new GitHubAppError('qa_consumption',403);
        const reserved=cost*2;
        return inspectGitHubApp({client,installationId:job.installation_id,repositoryId:job.repository_id,revision:job.revision,
          initialAuthorization,revalidateConnection:()=>getClient(signal,job),checkpoint:assertActive,observe:emit,
          ...(window?{acquisitionBudget:{reserved,canAcquire:()=>transport.canAcquire(reserved)}}:{}),
        });
      },
    }).process(jobId);
  }
  async function recover() {
    if(!active()||typeof env.ANALYSIS_QUEUE?.send!=='function') throw new AnalysisJobError('worker_unavailable');
    if(qaGuard) {try {await qaGuard.window();}catch(error){if(error.code==='qa_closed')return 0;throw error;}}
    const due=await recoverAnalysisJobs({db:env.DB,now,limit:20});
    let sent=0;
    for(const job of due) {
      if(qaGuard) {if(await qaGuard.dispatch(job.id,message=>env.ANALYSIS_QUEUE.send(message)))sent++;}
      else {await env.ANALYSIS_QUEUE.send({jobId:job.id});sent++;}
    }
    return sent;
  }
  return {process,recover};
}
const worker = {
  async fetch() {return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});},
  async queue(batch,env) {
    const consumer=createAnalysisConsumer({env});
    for(const message of batch.messages) {
      if(!message.body||typeof message.body.jobId!=='string'||!UUID.test(message.body.jobId)||Object.keys(message.body).join(',')!=='jobId') {message.ack();continue;}
      try {await consumer.process(message.body.jobId);message.ack();}
      catch(error) {
        if(['qa_closed','qa_scope','qa_consumption'].includes(error.code))message.ack();
        else message.retry({delaySeconds:60});
      }
    }
  },
  async scheduled(_event,env) {await createAnalysisConsumer({env}).recover();},
};

export default worker;
