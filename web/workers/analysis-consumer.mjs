/** Separate, disabled-by-default Queue consumer. This is not a Sites HTTP route.
 * A deployment, Queue + scheduler + same approved QA D1/secret bindings are still
 * required. No native REA, target execution, package install or credentials in jobs.
 */
import {createGitHubAppAuth} from '../lib/github-app-auth.mjs';
import {resolveWorkspacePrincipal} from '../lib/github-auth.mjs';
import {createAnalysisJobs, recoverAnalysisJobs, AnalysisJobError} from '../lib/analysis-jobs.mjs';
import {inspectGitHubApp} from '../lib/scanner.mjs';

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
export function createAnalysisConsumer({env,fetcher=fetch,now=()=>new Date(),appAuthFactory=createGitHubAppAuth}={}) {
  const active=()=>env?.WORKBENCH_JOBS_ENABLED==='true'&&env.WORKBENCH_MULTIUSER_ENABLED==='true'&&env.GITHUB_APP_ENABLED==='true'&&env.DB?.batch;
  async function process(jobId) {
    if (!active()) throw new AnalysisJobError('worker_unavailable');
    if(typeof jobId!=='string'||!UUID.test(jobId)) throw new AnalysisJobError('invalid_request',400);
    const row=await env.DB.prepare('SELECT owner_id,github_id FROM workbench_analysis_jobs WHERE id=?').bind(jobId).first();
    if(!row) return null;
    const principal=resolveWorkspacePrincipal(policy(env),row.github_id);
    const app=appAuthFactory({config:appConfig(env),db:env.DB,fetcher,now});
    if(!app.enabled) throw new AnalysisJobError('worker_unavailable');
    const user=principal?{...principal,provider:'github'}:null;
    const allowed=principal?.userId===row.owner_id;
    const authorize=async(job,{signal})=>{
      if(!allowed) return false;
      const client=await app.getClient(user,{signal});
      const access=await client.authorizeRepository({installationId:job.installation_id,repositoryId:job.repository_id,revision:job.revision});
      // A rename/transfer requires a new explicit selection, preserving history.
      return access.repository.id===job.repository_id&&access.repository.full_name===job.repo&&access.revision===job.revision;
    };
    return createAnalysisJobs({db:env.DB,ownerId:row.owner_id,githubId:row.github_id,now,authorize,
      analyze:async(job,{signal})=>inspectGitHubApp({client:await app.getClient(user,{signal}),installationId:job.installation_id,repositoryId:job.repository_id,revision:job.revision}),
    }).process(jobId);
  }
  async function recover() {
    if(!active()||typeof env.ANALYSIS_QUEUE?.send!=='function') throw new AnalysisJobError('worker_unavailable');
    const due=await recoverAnalysisJobs({db:env.DB,now,limit:20});
    for(const job of due) await env.ANALYSIS_QUEUE.send({jobId:job.id});
    return due.length;
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
      catch {message.retry({delaySeconds:60});}
    }
  },
  async scheduled(_event,env) {await createAnalysisConsumer({env}).recover();},
};

export default worker;
