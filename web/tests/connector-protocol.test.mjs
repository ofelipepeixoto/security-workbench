import test from 'node:test';
import assert from 'node:assert/strict';
import {invocationSchema,driverMessageSchema} from '../scripts/connector-preview/protocol.mjs';

test('connector protocol preserves string-keyed JSON argument/result records with Zod 4',()=>{
  const invocation={connectorId:'fixture',actionName:'read',arguments:{id:'synthetic',limit:2,nested:{allowed:true}}};
  assert.deepEqual(invocationSchema.parse(invocation),invocation);
  assert.equal(invocationSchema.safeParse({...invocation,arguments:[]}).success,false);
  assert.equal(invocationSchema.safeParse({...invocation,account:'foreign'}).success,false);
  const result={jsonrpc:'2.0',id:'11111111-1111-4111-8111-111111111111',result:{content:[{type:'text',text:'synthetic'}]}};
  assert.deepEqual(driverMessageSchema.parse(result),result);
  assert.equal(driverMessageSchema.safeParse({...result,result:[]}).success,false);
});
