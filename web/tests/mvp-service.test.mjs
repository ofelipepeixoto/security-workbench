import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWorkbenchRequest} from '../lib/workbench-service.mjs';
import {GitHubAppError} from '../lib/github-app-client.mjs';
import {migratedDatabase} from './helpers/d1-sqlite.mjs';

const ORIGIN = 'https://workbench.example';
const SHA = 'a'.repeat(40), CSRF = 'c'.repeat(43);
const A = {userId:'legacy-admin', githubId:'11', role:'admin', provider:'github', csrfToken:CSRF};
const B = {userId:'github:22', githubId:'22', role:'member', provider:'github', csrfToken:CSRF};
const POLICY = {multiUserEnabled:true, githubOwnerId:'11', workbenchOwnerId:A.userId, allowedGitHubIds:['22']};
const metadata = user => ({id:user === A ? 101 : 202, name:user === A ? 'private-a' : 'private-b', full_name:`synthetic-org/${user === A ? 'private-a' : 'private-b'}`, owner:{login:'synthetic-org'}, private:true, default_branch:'main', language:'JavaScript', archived:false, permissions:{pull:true}, installation_id:user === A ? 7 : 8});

function provider(user, state = {}) {
  const repo = metadata(user);
  return {enabled:true,
    async getConnection() { return {state:state.revoked ? 'revoked' : 'connected', validated_at:'2026-10-22T01:30:00Z'}; },
    async getClient() {
      if (state.revoked) throw new GitHubAppError('disconnected', 401);
      if (state.rateLimited) throw new GitHubAppError('rate_limited', 429, '2026-10-22T03:00:00Z');
      return {
        async listInstallations() { return {installations:[{id:repo.installation_id}], page:1, next_page:null, complete:true, total_count:1}; },
        async listRepositories({installationId}) { if (installationId !== repo.installation_id) throw new GitHubAppError('forbidden',403); return {repositories:[repo], page:1, next_page:null, complete:true, total_count:1}; },
        async checkRepositoryAccess({installationId,repositoryId}) { if (repositoryId !== repo.id || installationId !== repo.installation_id) throw new GitHubAppError('forbidden',403); return {repository:repo}; },
        async checkRepositoriesAccess(scopes) { return scopes.map(scope=>({...scope,repository:scope.repositoryId===repo.id&&scope.installationId===repo.installation_id?repo:null})); },
        async authorizeRepository({installationId,repositoryId,revision}) { if (repositoryId !== repo.id || installationId !== repo.installation_id) throw new GitHubAppError('forbidden',403); return {repository:repo, revision:revision ?? SHA, tree_sha:'b'.repeat(40)}; },
      };
    },
  };
}
function deps(db,user,extra={}) { return {getUser:async()=>user,getDb:()=>db,authorizedOwnerId:A.userId,accessPolicy:POLICY,githubApp:provider(user),jobsEnabled:true,dispatchJob:async()=>{},...extra}; }
async function api(db,user,payload,extra={}) {
  const request = payload ? new Request(ORIGIN+'/api/workbench',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json','X-Workbench-CSRF':CSRF},body:JSON.stringify(payload)}) : new Request(ORIGIN+'/api/workbench');
  const response = await handleWorkbenchRequest(request,deps(db,user,extra));
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  return {status:response.status,body:await response.json()};
}
async function select(db,user,extra={}) {
  const repo=metadata(user);
  const result=await api(db,user,{action:'catalog-authorize',installationId:repo.installation_id,repositoryId:repo.id},extra);
  assert.equal(result.status,200,JSON.stringify(result.body)); return result.body.project;
}
function seedRun(db,user,project) {
  const id=crypto.randomUUID(), request=crypto.randomUUID();
  const result={source:'github-app',revision:SHA,repository_id:project.repository_id,verified_revision:true,partial:true,files_read:1,bytes_read:20,snapshot_digest:'d'.repeat(64),omissions:['Fixture synthetic'],findings:[{fingerprint:'f'.repeat(20),kind:'possible-secret',path:'fixture.mjs',line:1,status:'candidate',confidence:'low',evidence:'[REDACTED]',impact:'Synthetic potential',recommendation:'Review'}],dependencies:[]};
  db.sql.prepare("INSERT INTO workbench_runs (id,owner_id,project_id,repo,repository_id,request_id,requested_revision,revision,status,result_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'complete',?,?,?)").run(id,user.userId,project.id,project.repo,project.repository_id,request,SHA,SHA,JSON.stringify(result),'2026-10-22T01:30:00Z','2026-10-22T01:30:00Z');
  return id;
}

test('pilot remains off by default and admits only server-derived stable principals when enabled', async()=>{
  let touched=false;
  const denied=await api(null,B,null,{accessPolicy:undefined,getDb(){touched=true;throw Error('must not touch');}});
  assert.equal(denied.status,403); assert.equal(touched,false);
  for(const user of [null,{...B,githubId:'33'},{...B,userId:A.userId},{...B,role:'admin'}]){
    const result=await api(null,user,{action:'catalog-status',ownerId:A.userId,role:'admin'},{getDb(){touched=true;throw Error('must not touch');}});
    assert.equal(result.status,user?403:401);
  }
  assert.equal(touched,false);
});

test('catalog is a distinct authorized inventory; selecting a pinned commit never queues or scans',async()=>{
  const db=migratedDatabase();
  try{
    const a=await select(db,A),b=await select(db,B);
    assert.notEqual(a.id,b.id); assert.equal(b.source,'github-app'); assert.equal(b.visibility,'private');
    assert.equal(db.sql.prepare('SELECT count(*) AS n FROM workbench_runs').get().n,0);
    const list=await api(db,B,null);
    assert.equal(list.status,200); assert.deepEqual(list.body.projects.map(p=>p.repo),['synthetic-org/private-b']);
    assert.equal(JSON.stringify(list.body).includes('private-a'),false);
    const wrong=await api(db,B,{action:'catalog-authorize',installationId:7,repositoryId:101,ownerId:A.userId});
    assert.equal(wrong.status,403);
    for(const action of ['inspect','authorize','scan']) assert.equal((await api(db,B,{action,repo:'ofelipepeixoto/rea',projectId:b.id,requestId:crypto.randomUUID()})).status,403);
  }finally{db.close();}
});

test('A cannot read, review, import, export, compare, enqueue or delete B objects by changing IDs',async()=>{
  const db=migratedDatabase();
  try{
    const a=await select(db,A),b=await select(db,B),left=seedRun(db,A,a),right=seedRun(db,B,b);
    const attacks=[
      {action:'run',runId:right},{action:'review',runId:right,fingerprint:'f'.repeat(20),decision:'confirmed'},
      {action:'report',runId:right},{action:'compare',before:left,after:right},
      {action:'import-rea',projectId:b.id,requestId:crypto.randomUUID(),revision:SHA,evidence:'{}'},
      {action:'enqueue-job',projectId:b.id,requestId:crypto.randomUUID(),revision:SHA,confirmed:true},
      {action:'delete-project',projectId:b.id,confirmed:true},
    ];
    for(const attack of attacks){
      const result=await api(db,A,{...attack,ownerId:B.userId,githubId:B.githubId,role:'admin'});
      assert.equal(result.status,404,attack.action); assert.equal(JSON.stringify(result.body).includes('private-b'),false);
    }
    const findings=await api(db,A,{action:'findings'});
    assert.equal(findings.status,200); assert.deepEqual(findings.body.findings.map(f=>f.run_id),[left]);
    assert.equal(db.sql.prepare('SELECT count(*) AS n FROM workbench_reviews').get().n,0);
  }finally{db.close();}
});

test('revoked App access hides its projects/results immediately while quota errors remain errors',async()=>{
  const db=migratedDatabase();
  try{
    const state={},app=provider(B,state),b=await select(db,B,{githubApp:app}),id=seedRun(db,B,b);
    state.revoked=true;
    const list=await api(db,B,null,{githubApp:app});
    assert.equal(list.status,401); assert.equal(list.body.code,'disconnected'); assert.equal(list.body.projects,undefined); assert.equal(list.body.runs,undefined);
    for(const action of ['run','report','review']) assert.equal((await api(db,B,{action,runId:id},{githubApp:app})).status,404);
    assert.ok(db.sql.prepare('SELECT revoked_at FROM workbench_projects WHERE id=?').get(b.id).revoked_at);
    const findings=await api(db,B,{action:'findings'},{githubApp:app});
    assert.equal(findings.body.access_restricted,true); assert.equal(findings.body.runs_considered,0);
    state.revoked=false;
    assert.equal((await api(db,B,{action:'run',runId:id},{githubApp:app})).status,200);
    assert.equal(db.sql.prepare('SELECT revoked_at FROM workbench_projects WHERE id=?').get(b.id).revoked_at,null);
    state.rateLimited=true;
    const limited=await api(db,B,null,{githubApp:app});
    assert.equal(limited.status,429); assert.equal(limited.body.code,'rate_limited'); assert.equal(limited.body.retry_at,'2026-10-22T03:00:00Z'); assert.equal(limited.body.projects,undefined);
  }finally{db.close();}
});

test('synthetic two-user journey persists review across service reopen, comparison and opened Markdown',async()=>{
  const db=migratedDatabase();
  try{
    const b=await select(db,B),first=seedRun(db,B,b),second=seedRun(db,B,b);
    const reviewed=await api(db,B,{action:'review',runId:first,fingerprint:'f'.repeat(20),decision:'false_positive'});
    assert.equal(reviewed.status,200);
    const reopened=await api(db,B,{action:'run',runId:first}); assert.equal(reopened.body.run.findings[0].status,'false_positive');
    const compared=await api(db,B,{action:'compare',before:first,after:second}); assert.equal(compared.status,200); assert.deepEqual(compared.body.comparison.still_detected,['f'.repeat(20)]);
    const report=await api(db,B,{action:'report',runId:first}); assert.equal(report.status,200);
    // This is a parsed/opened in-memory synthetic export, not browser download QA.
    const opened=new TextDecoder().decode(new TextEncoder().encode(report.body.markdown));
    assert.match(opened,/false&#95;positive/); assert.match(opened,/Aquisição GitHub App/); assert.match(opened,/Ausência de achados não comprova segurança/);
    assert.equal((await api(db,A,{action:'report',runId:first})).status,404);
  }finally{db.close();}
});

test('jobs require dispatcher, preserve durable enqueue after send failure and deny cross-user status/cancel',async()=>{
  const db=migratedDatabase();
  try{
    const b=await select(db,B),requestId=crypto.randomUUID();
    const payload={action:'enqueue-job',projectId:b.id,revision:SHA,requestId,confirmed:true};
    assert.equal((await api(db,B,payload,{dispatchJob:undefined})).status,503);
    const failed=await api(db,B,payload,{dispatchJob:async()=>{throw Error('PRIVATE dispatch body');}});
    assert.equal(failed.status,200,JSON.stringify(failed.body)); assert.equal(failed.body.job.status,'queued'); assert.equal(failed.body.dispatch_pending,true);
    const repeat=await api(db,B,payload); assert.equal(repeat.status,200); assert.equal(repeat.body.job.id,failed.body.job.id);
    for(const action of ['job','cancel-job']) assert.equal((await api(db,A,{action,jobId:failed.body.job.id,ownerId:B.userId})).status,404);
    assert.equal((await api(db,B,{action:'cancel-job',jobId:failed.body.job.id})).body.job.status,'cancelled');
    assert.equal(db.sql.prepare('SELECT count(*) AS n FROM workbench_runs').get().n,1);
  }finally{db.close();}
});

test('enqueue revalidates the exact commit and refuses revoked or renamed access before durable writes',async()=>{
  for (const failure of ['revoked-commit','renamed','different-commit']) {
    const db=migratedDatabase();
    try {
      const b=await select(db,B), base=provider(B);
      const app={...base,async getClient(){
        const client=await base.getClient();
        return {...client,async authorizeRepository(input){
          const access=await client.authorizeRepository(input);
          if (!input.revision) return access;
          if (failure==='revoked-commit') throw new GitHubAppError('forbidden',403);
          if (failure==='renamed') return {...access,repository:{...access.repository,full_name:'synthetic-org/renamed'}};
          return {...access,revision:'c'.repeat(40)};
        }};
      }};
      let dispatched=false;
      const result=await api(db,B,{action:'enqueue-job',projectId:b.id,revision:SHA,requestId:crypto.randomUUID(),confirmed:true},{githubApp:app,dispatchJob:async()=>{dispatched=true;}});
      assert.equal(result.status,failure==='revoked-commit'?403:409);
      assert.equal(dispatched,false);
      for(const table of ['workbench_runs','workbench_analysis_jobs']) assert.equal(db.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
    } finally {db.close();}
  }
});

test('project deletion preserves running and cancelled leases until consumer reservation expires',async()=>{
  for(const status of ['running','cancelled']) {
    const db=migratedDatabase();
    try {
      const b=await select(db,B);
      const queued=await api(db,B,{action:'enqueue-job',projectId:b.id,revision:SHA,requestId:crypto.randomUUID(),confirmed:true});
      db.sql.prepare('UPDATE workbench_analysis_jobs SET status=?,lease_expires_at=? WHERE id=?').run(status,'2099-01-01T00:00:00.000Z',queued.body.job.id);
      const blocked=await api(db,B,{action:'delete-project',projectId:b.id,confirmed:true});
      assert.equal(blocked.status,409);
      for(const table of ['workbench_projects','workbench_runs','workbench_analysis_jobs']) assert.equal(db.sql.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,1);
      db.sql.prepare('UPDATE workbench_analysis_jobs SET lease_expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',queued.body.job.id);
      assert.equal((await api(db,B,{action:'delete-project',projectId:b.id,confirmed:true})).status,200);
      assert.equal(db.sql.prepare('SELECT count(*) AS n FROM workbench_analysis_jobs').get().n,0);
    } finally {db.close();}
  }
});

test('own private project can be erased atomically even after GitHub disconnection',async()=>{
  const db=migratedDatabase();
  try{
    const state={},app=provider(B,state),b=await select(db,B,{githubApp:app}),id=seedRun(db,B,b);
    await api(db,B,{action:'review',runId:id,fingerprint:'f'.repeat(20),decision:'false_positive'},{githubApp:app});
    state.revoked=true;
    assert.equal((await api(db,B,{action:'delete-project',projectId:b.id,confirmed:true},{githubApp:app})).status,200);
    for(const table of ['workbench_projects','workbench_runs','workbench_reviews']) assert.equal(db.sql.prepare(`SELECT count(*) AS n FROM ${table} WHERE owner_id=?`).get(B.userId).n,0);
    assert.equal((await api(db,A,{action:'delete-project',projectId:b.id,confirmed:true})).status,404);
  }finally{db.close();}
});

 test('a negative D1 batch result never claims a project was deleted',async()=>{
  const db=migratedDatabase();
  try {
    const b=await select(db,B);
    const broken={...db,batch:async()=>[{success:false}]};
    const result=await api(broken,B,{action:'delete-project',projectId:b.id,confirmed:true});
    assert.equal(result.status,503); assert.equal(result.body.deleted,undefined);
    assert.ok(db.sql.prepare('SELECT id FROM workbench_projects WHERE id=?').get(b.id));
  } finally {db.close();}
});
