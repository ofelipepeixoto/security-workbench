import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAnalysisConsumer} from '../workers/analysis-consumer.mjs';
import {createAnalysisJobs} from '../lib/analysis-jobs.mjs';
import {createWorkbenchService} from '../lib/workbench-service.mjs';
import {migratedDatabase} from './helpers/d1-sqlite.mjs';
const SHA='a'.repeat(40), TREE='b'.repeat(40);
const USER={userId:'github:22',githubId:'22',role:'member',provider:'github'};
function project(db){
  const id=crypto.randomUUID();
  db.sql.prepare("INSERT INTO workbench_projects (id,owner_id,repo,repository_id,authorized_at,source,installation_id,visibility) VALUES (?,?,?,?,?,'github-app',?,'private')").run(id,USER.userId,'synthetic-org/private-fixture',202,'2026-10-22T01:30:00Z',8);
  return db.sql.prepare('SELECT * FROM workbench_projects WHERE id=?').get(id);
}
function environment(db){return {DB:db,WORKBENCH_JOBS_ENABLED:'true',WORKBENCH_MULTIUSER_ENABLED:'true',GITHUB_APP_ENABLED:'true',GITHUB_OWNER_ID:'11',WORKBENCH_OWNER_ID:'legacy-admin',WORKBENCH_PILOT_GITHUB_IDS:'22'};}
function provider({rename=false}={}){
  let reads=0;
  const text='password="synthetic_12345"\n', bytes=Buffer.from(text);
  const blobSha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const client={
    async authorizeRepository({repositoryId,installationId,revision}){
      assert.equal(repositoryId,202);assert.equal(installationId,8);
      return {repository:{id:202,full_name:rename?'synthetic-org/renamed':'synthetic-org/private-fixture',private:true},revision:revision??SHA,tree_sha:TREE};
    },
    async readTree(){reads++;return {sha:TREE,truncated:false,tree:[{path:'test/fixture.mjs',type:'blob',mode:'100644',size:bytes.length,sha:blobSha}]};},
    async readBlob(){reads++;return {sha:blobSha,size:bytes.length,encoding:'base64',content:bytes.toString('base64')};},
  };
  const app={enabled:true,async getClient(user){assert.equal(user.githubId,USER.githubId);return client;}};
  return {app,client,get reads(){return reads;},factory:()=>app};
}

test('disabled consumer cannot touch D1 or start a provider',async()=>{
  let touched=false;
  const consumer=createAnalysisConsumer({env:{},appAuthFactory(){touched=true;throw Error('must not run');}});
  await assert.rejects(consumer.process(crypto.randomUUID()),error=>error.code==='worker_unavailable');
  assert.equal(touched,false);
});

test('durable consumer runs shared scanner twice; persisted candidate review, comparison and opened export remain scoped',async()=>{
  const db=migratedDatabase();
  try{
    const scope=project(db),mock=provider(),env=environment(db);
    const consumer=createAnalysisConsumer({env,appAuthFactory:mock.factory});
    const jobs=createAnalysisJobs({db,ownerId:USER.userId,githubId:USER.githubId});
    const first=await jobs.enqueue({project:scope,revision:SHA,requestId:crypto.randomUUID(),confirmed:true});
    assert.equal(first.job.status,'queued');assert.equal(mock.reads,0);
    assert.equal((await consumer.process(first.job.id)).job.status,'complete');
    // Duplicate delivery cannot trigger another acquisition.
    await consumer.process(first.job.id);assert.equal(mock.reads,2);
    const second=await jobs.enqueue({project:scope,revision:SHA,requestId:crypto.randomUUID(),confirmed:true});
    assert.equal((await consumer.process(second.job.id)).job.status,'complete');assert.equal(mock.reads,4);
    const githubApp={enabled:true,async getClient(){return mock.client;}};
    const service=createWorkbenchService({db,ownerId:USER.userId,user:USER,githubApp});
    const result=await service.act({action:'run',runId:first.job.run_id});
    assert.equal(result.run.source,'github-app');assert.equal(result.run.verified_revision,true);assert.equal(result.run.findings.length,1);
    assert.equal(result.run.findings[0].confidence,'low');assert.equal(result.run.coverage.advisory_coverage,'unavailable');
    const fingerprint=result.run.findings[0].fingerprint;
    await service.act({action:'review',runId:first.job.run_id,fingerprint,decision:'false_positive'});
    const reopened=createWorkbenchService({db,ownerId:USER.userId,user:USER,githubApp});
    assert.equal((await reopened.act({action:'run',runId:first.job.run_id})).run.findings[0].status,'false_positive');
    assert.deepEqual((await reopened.act({action:'compare',before:first.job.run_id,after:second.job.run_id})).comparison.still_detected,[fingerprint]);
    const report=await reopened.act({action:'report',runId:first.job.run_id});
    const opened=Buffer.from(report.markdown,'utf8').toString('utf8');
    assert.match(opened,/false&#95;positive/);assert.match(opened,new RegExp(SHA));assert.ok(!opened.includes('synthetic_12345'));
    const stranger=createWorkbenchService({db,ownerId:'github:33',user:{...USER,userId:'github:33',githubId:'33'},githubApp});
    await assert.rejects(stranger.act({action:'report',runId:first.job.run_id}),error=>error.status===404);
  }finally{db.close();}
});

test('policy removal or rename before execution stops acquisition and stores only a safe failure',async()=>{
  for(const changed of ['policy','rename']){
    const db=migratedDatabase();
    try{
      const scope=project(db),mock=provider({rename:changed==='rename'}),env=environment(db);
      if(changed==='policy')env.WORKBENCH_PILOT_GITHUB_IDS='';
      const job=await createAnalysisJobs({db,ownerId:USER.userId,githubId:USER.githubId}).enqueue({project:scope,revision:SHA,requestId:crypto.randomUUID(),confirmed:true});
      const result=await createAnalysisConsumer({env,appAuthFactory:mock.factory}).process(job.job.id);
      assert.equal(result.job.status,'failed');assert.equal(result.job.failure_code,'access_revoked');assert.equal(mock.reads,0);
      assert.equal(db.sql.prepare('SELECT result_json FROM workbench_runs WHERE id=?').get(job.job.run_id).result_json,null);
    }finally{db.close();}
  }
});

test('recovery schedules only opaque job IDs; dispatch failure keeps durable work',async()=>{
  const db=migratedDatabase();
  try{
    const scope=project(db),mock=provider(),env=environment(db),sent=[];
    const job=await createAnalysisJobs({db,ownerId:USER.userId,githubId:USER.githubId}).enqueue({project:scope,revision:SHA,requestId:crypto.randomUUID(),confirmed:true});
    env.ANALYSIS_QUEUE={async send(value){sent.push(value);}};
    const consumer=createAnalysisConsumer({env,appAuthFactory:mock.factory});
    assert.equal(await consumer.recover(),1);assert.deepEqual(sent,[{jobId:job.job.id}]);assert.equal(mock.reads,0);
    env.ANALYSIS_QUEUE={async send(){throw Error('private provider error');}};
    await assert.rejects(consumer.recover());
    assert.equal(db.sql.prepare('SELECT status FROM workbench_analysis_jobs WHERE id=?').get(job.job.id).status,'queued');
  }finally{db.close();}
});
