import test from 'node:test';
import assert from 'node:assert/strict';
import {QA_NAMES,validateQaManifest,activationSql,closeSql} from '../../scripts/qa-control.mjs';
const now=Date.parse('2026-10-22T12:00:00Z');
const manifest=()=>({owner:'ofelipepeixoto',repository:'ofelipepeixoto/security-workbench',accountId:'a'.repeat(32),
  confirmedAccount:true,workersPlan:'free',preflightAt:new Date(now).toISOString(),activationAt:new Date(now).toISOString(),
  zeroAdditionalCostVerified:true,compatibilityVerified:true,names:QA_NAMES,databaseId:'synthetic-qa-db',restoreDatabaseId:'synthetic-restore-db',queueId:'synthetic-queue',
  productionResourceIds:['synthetic-production-db'],origin:'https://synthetic-qa.example',productionOrigin:'https://synthetic-production.example',
  remaining:{workers:2,databases:2,queues:1,cron:1,workerRequests:5000,d1ReadRows:1000000,d1WriteRows:20000,d1StorageBytes:20971520,queueOperations:8000},
  fixtures:[{githubId:'171351708',repositoryId:123,installationId:456,repo:'ofelipepeixoto/synthetic-fixture'}]});
test('offline gate rejects paid/unknown budget, stale evidence and production resource/origin reuse',()=>{
  validateQaManifest(manifest(),{now});
  for(const patch of [{workersPlan:'paid'},{confirmedAccount:false},{zeroAdditionalCostVerified:false},{compatibilityVerified:false},
    {preflightAt:new Date(now-86400001).toISOString()},{databaseId:'synthetic-production-db'},
    {origin:'https://synthetic-production.example'},{remaining:{workerRequests:5000}}])assert.throws(()=>validateQaManifest({...manifest(),...patch},{now}));
});
test('activation is fresh, seven days, explicit INSERT only; closeout retains evidence and never reopens',()=>{
  const sql=activationSql(manifest(),{now});assert.match(sql,/INSERT INTO workbench_qa_window/);assert.doesNotMatch(sql,/ON CONFLICT|DELETE/);
  assert.equal(validateQaManifest(manifest(),{now}).endsAt-now,604800000);
  assert.throws(()=>activationSql({...manifest(),activationAt:new Date(now-600000).toISOString()},{now}));
  assert.match(closeSql(),/COALESCE\(closed_at,unixepoch\(\)\*1000\)/);assert.doesNotMatch(closeSql(),/^DELETE /m);
});
