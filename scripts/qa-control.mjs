/** Offline preparation only. This program never calls an API or runs Wrangler. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const QA_NAMES=Object.freeze({web:'security-workbench-qa',consumer:'security-workbench-analysis-qa',
  database:'security-workbench-qa',restore:'security-workbench-qa-restore',queue:'security-workbench-analysis-qa'});
const fail=()=>{throw Error('QA manifest rejected; verify account, zero-cost preflight, resources, origin and selected fixtures.');};
export function validateQaManifest(m,{now=Date.now(),activation=false,canary=false}={}) {
  if(!m||m.owner!=='ofelipepeixoto'||m.repository!=='ofelipepeixoto/security-workbench'||
    !/^[a-f0-9]{32}$/.test(m.accountId??'')||m.confirmedAccount!==true||m.workersPlan!=='free'||
    !Number.isFinite(Date.parse(m.preflightAt))||now-Date.parse(m.preflightAt)>86400000||now<Date.parse(m.preflightAt)||
    m.zeroAdditionalCostVerified!==true)fail();
  // Paid account remaining inclusions are not a hard financial ceiling. Stop,
  // rather than treating an existing subscription as permission for overages.
  const required={workers:2,databases:2,queues:1,cron:1,workerRequests:5000,d1ReadRows:1000000,d1WriteRows:20000,d1StorageBytes:20*1024*1024,queueOperations:8000};
  for(const [key,n] of Object.entries(required))if(!Number.isFinite(m.remaining?.[key])||m.remaining[key]<n)fail();
  if(!Array.isArray(m.productionResourceIds))fail();
  // Sites does not expose its provider resource IDs. Do not invent them or
  // silently waive isolation: require the independently recorded empty-account
  // inventory while the existing Sites production was live, in addition to the
  // explicit managed-production boundary. This remains an offline attestation.
  if(!m.productionResourceIds.length&&!(m.productionManagedBySites===true&&m.qaAccountInitiallyEmptyVerified===true))fail();
  const ids=[m.databaseId,m.restoreDatabaseId,m.queueId];
  if(ids.some(x=>typeof x!=='string'||!x||x.includes('<')||m.productionResourceIds.includes(x))||new Set(ids).size!==3)fail();
  if(Object.entries(QA_NAMES).some(([k,v])=>m.names?.[k]!==v))fail();
  let url;try{url=new URL(m.origin);}catch{fail();}
  if(url.protocol!=='https:'||url.origin!==m.origin||m.origin===m.productionOrigin||!m.productionOrigin)fail();
  if(!Array.isArray(m.fixtures)||!m.fixtures.length||m.fixtures.length>10)fail();
  for(const f of m.fixtures)if(!['171351708','322086368'].includes(f.githubId)||!Number.isSafeInteger(f.repositoryId)||f.repositoryId<1||
    !Number.isSafeInteger(f.installationId)||f.installationId<1||!/^(ofelipepeixoto|radartech-news)\/[A-Za-z0-9_.-]+$/.test(f.repo)||!/^[a-f0-9]{40}$/.test(f.revision??'')||f.repo.split('/')[0]!==({ '171351708':'ofelipepeixoto','322086368':'radartech-news'}[f.githubId]))fail();
  if(activation)validateCompatibilityEvidence(m,{now});
  if(canary&&(!/^[a-f0-9]{40}$/.test(m.sourceRevision??'')||m.canaryApproved!==true||m.compatibilityVerified===true||m.fixtures.length!==2||!['171351708','322086368'].every(id=>m.fixtures.filter(f=>f.githubId===id).length===1)))fail();
  const start=Date.parse(m.activationAt);
  if((activation||canary)&&(!Number.isFinite(start)||Math.abs(start-now)>300000))fail();
  return {startsAt:start,endsAt:start+604800000};
}
export function qaFixtureDigest(fixtures) {
  const rows=fixtures.map(f=>[f.githubId,f.repositoryId,f.installationId,f.repo,f.revision]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
/** An attestation with measured, candidate-bound metrics; never a boolean. */
export function validateCompatibilityEvidence(m,{now=Date.now()}={}) {
  const e=m.compatibilityEvidence;
  if(!/^[a-f0-9]{40}$/.test(m.sourceRevision??'')||!e||e.sourceRevision!==m.sourceRevision||e.kind!=='hosted-canary/v1'||e.fixtureDigest!==qaFixtureDigest(m.fixtures)||
    typeof e.webVersionId!=='string'||!e.webVersionId||typeof e.consumerVersionId!=='string'||!e.consumerVersionId||
    !Number.isFinite(Date.parse(e.measuredAt))||now-Date.parse(e.measuredAt)>86400000||now<Date.parse(e.measuredAt)||
    e.completedJobs!==2||!Array.isArray(e.actorsCompleted)||e.actorsCompleted.length!==2||!['171351708','322086368'].every(id=>e.actorsCompleted.includes(id))||e.errors!==0||e.canaryClosed!==true||e.queueConsumerReal!==true||e.d1Real!==true)fail();
  for(const [key,max] of Object.entries({cpuMaxMs:10,durationMaxMs:45000,fetchesMax:16,bytesMax:2097152,d1QueriesMax:50,queueOperations:30})) {
    if(!Number.isFinite(e[key])||e[key]<0||e[key]>max)fail();
  }
  // Zero is a useful refusal value, not evidence that CPU/duration was measured.
  if(e.cpuMaxMs===0||e.durationMaxMs===0||e.d1QueriesMax===0||e.queueOperations===0)fail();
  return e;
}
export function canarySql(m,options) {
  validateQaManifest(m,{...options,canary:true});
  const fixtures=JSON.stringify(m.fixtures).replaceAll("'","''");
  return `INSERT INTO workbench_qa_canary (id,starts_at,ends_at,fixtures_json,source_sha) SELECT 1,stamp,stamp+900000,'${fixtures}','${m.sourceRevision}' FROM (SELECT CAST(round((julianday('now')-2440587.5)*86400000) AS INTEGER) AS stamp);`;
}
export function activationSql(m,options) {
  const {startsAt,endsAt}=validateQaManifest(m,{...options,activation:true});
  const fixtures=JSON.stringify(m.fixtures).replaceAll("'","''");
  // The reviewed timestamp is only a freshness request. The effective interval
  // starts from the database clock at INSERT, never a supplied/retrodated time.
  void startsAt;void endsAt;
  return `INSERT INTO workbench_qa_window (id,starts_at,ends_at,fixtures_json) SELECT 1,stamp,stamp+604800000,'${fixtures}' FROM (SELECT CAST(round((julianday('now')-2440587.5)*86400000) AS INTEGER) AS stamp);`;
}
export function closeSql() {
  return `-- QA DB only. Preserve ledger, runs, reviews and evidence. No DELETE.
UPDATE workbench_qa_window SET closed_at=COALESCE(closed_at,unixepoch()*1000) WHERE id=1;
UPDATE workbench_qa_canary SET closed_at=COALESCE(closed_at,unixepoch()*1000) WHERE id=1;
UPDATE workbench_runs SET status='failed',failure_code='qa_closed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='running' AND EXISTS (SELECT 1 FROM workbench_analysis_jobs j WHERE j.run_id=workbench_runs.id AND j.owner_id=workbench_runs.owner_id AND j.status IN ('queued','running'));
UPDATE workbench_analysis_jobs SET status='cancelled',failure_code='qa_closed',lease_token=NULL,retry_at=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status IN ('queued','running');
-- Then remove QA cron (PUT schedules []), disable QA dispatcher/jobs flag,
-- detach/pause QA consumer and verify no recurrence. Retain all evidence.
-- These control-plane actions require the approved QA account/resource IDs.`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [action,file]=process.argv.slice(2);
    if(action==='close-sql'&&!file)process.stdout.write(closeSql()+'\n');
    else if(['check','activate-sql','canary-sql'].includes(action)&&file) {
      const m=JSON.parse(readFileSync(file,'utf8'));
      if(action==='check'){validateQaManifest(m);process.stdout.write('QA manifest preflight passed; no resources changed.\n');}
      else process.stdout.write((action==='canary-sql'?canarySql(m):activationSql(m))+'\n');
    } else throw Error('Usage: qa-control.mjs check|canary-sql|activate-sql <private-manifest.json> OR close-sql. Offline only.');
  }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
