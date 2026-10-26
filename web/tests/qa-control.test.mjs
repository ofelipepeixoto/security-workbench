import test from 'node:test';
import assert from 'node:assert/strict';
import {QA_NAMES,validateQaManifest,activationSql,canarySql,validateCompatibilityEvidence,qaFixtureDigest,closeSql} from '../../scripts/qa-control.mjs';
const now=Date.parse('2026-10-22T12:00:00Z');
const manifest=()=>{const m={owner:'ofelipepeixoto',repository:'ofelipepeixoto/security-workbench',accountId:'a'.repeat(32),
  confirmedAccount:true,workersPlan:'free',preflightAt:new Date(now).toISOString(),activationAt:new Date(now).toISOString(),
  zeroAdditionalCostVerified:true,compatibilityVerified:false,sourceRevision:'b'.repeat(40),canaryApproved:true,compatibilityEvidence:{kind:'hosted-canary/v1',sourceRevision:'b'.repeat(40),webVersionId:'synthetic-web-version',consumerVersionId:'synthetic-consumer-version',measuredAt:new Date(now).toISOString(),completedJobs:2,actorsCompleted:['171351708','322086368'],errors:0,canaryClosed:true,queueConsumerReal:true,d1Real:true,cpuMaxMs:9,durationMaxMs:2000,fetchesMax:14,bytesMax:1000,d1QueriesMax:40,queueOperations:6},names:QA_NAMES,databaseId:'synthetic-qa-db',restoreDatabaseId:'synthetic-restore-db',queueId:'synthetic-queue',
  productionResourceIds:['synthetic-production-db'],origin:'https://synthetic-qa.example',productionOrigin:'https://synthetic-production.example',
  remaining:{workers:2,databases:2,queues:1,cron:1,workerRequests:5000,d1ReadRows:1000000,d1WriteRows:20000,d1StorageBytes:20971520,queueOperations:8000},
  fixtures:[{githubId:'171351708',repositoryId:123,installationId:456,repo:'ofelipepeixoto/synthetic-fixture',revision:'a'.repeat(40)},{githubId:'322086368',repositoryId:124,installationId:457,repo:'radartech-news/synthetic-fixture',revision:'a'.repeat(40)}]};m.compatibilityEvidence.fixtureDigest=qaFixtureDigest(m.fixtures);return m;};
test('offline gate rejects paid/unknown budget, stale evidence and production resource/origin reuse',()=>{
  validateQaManifest(manifest(),{now});
  for(const patch of [{workersPlan:'paid'},{confirmedAccount:false},{zeroAdditionalCostVerified:false},
    {preflightAt:new Date(now-86400001).toISOString()},{databaseId:'synthetic-production-db'},
    {origin:'https://synthetic-production.example'},{remaining:{workerRequests:5000}}])assert.throws(()=>validateQaManifest({...manifest(),...patch},{now}));
});
test('activation is fresh, seven days, explicit INSERT only; closeout retains evidence and never reopens',()=>{
  const sql=activationSql(manifest(),{now});assert.match(sql,/INSERT INTO workbench_qa_window/);assert.doesNotMatch(sql,/ON CONFLICT|DELETE/);
  assert.equal(validateQaManifest(manifest(),{now}).endsAt-now,604800000);
  assert.match(sql,/julianday\('now'\)/);assert.doesNotMatch(sql,new RegExp(String(now)));
  assert.throws(()=>activationSql({...manifest(),activationAt:new Date(now-600000).toISOString()},{now}));
  assert.match(closeSql(),/COALESCE\(closed_at,unixepoch\(\)\*1000\)/);assert.doesNotMatch(closeSql(),/^DELETE /m);
});
test('Sites-managed production requires explicit empty-account evidence rather than invented provider IDs',()=>{
  const m={...manifest(),productionResourceIds:[],productionManagedBySites:true,qaAccountInitiallyEmptyVerified:true};
  validateQaManifest(m,{now});
  for(const patch of [{productionManagedBySites:false},{qaAccountInitiallyEmptyVerified:false},{productionResourceIds:undefined},
    {databaseId:m.restoreDatabaseId},{confirmedAccount:false},{workersPlan:'paid'}])
    assert.throws(()=>validateQaManifest({...m,...patch},{now}));
  assert.throws(()=>validateQaManifest({...m,productionResourceIds:[m.databaseId]},{now}));
});

test('preflight does not claim compatibility and canary is separately bounded; only measured evidence permits formal activation',()=>{
 const m=manifest();validateQaManifest({...m,compatibilityEvidence:undefined},{now});
 assert.throws(()=>activationSql({...m,compatibilityEvidence:undefined,compatibilityVerified:true},{now}));
 const sql=canarySql({...m,compatibilityEvidence:undefined},{now});
 assert.match(sql,/INSERT INTO workbench_qa_canary/);assert.match(sql,/stamp\+900000/);assert.doesNotMatch(sql,/workbench_qa_window/);
 for(const patch of [{canaryApproved:false},{sourceRevision:'bad'},{compatibilityVerified:true}])assert.throws(()=>canarySql({...m,...patch},{now}));
 for(const patch of [{cpuMaxMs:11},{errors:1},{completedJobs:1},{canaryClosed:false},{sourceRevision:'c'.repeat(40)},{cpuMaxMs:0},{queueConsumerReal:false},{actorsCompleted:['171351708','171351708']},{fixtureDigest:'f'.repeat(64)}])assert.throws(()=>validateCompatibilityEvidence({...m,compatibilityEvidence:{...m.compatibilityEvidence,...patch}},{now}));
});
