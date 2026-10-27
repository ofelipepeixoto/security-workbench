/** Opt-in QA numbers only. No SQL, URL, names, bodies, credentials or raw IDs. */
const CODES=new Set(['qa_closed','qa_scope','qa_consumption','access_revoked','cancelled','acquisition_timeout','rate_limited','provider_unavailable','storage_unavailable']);
const OUTCOMES=new Set(['complete','failed','queued','running','cancelled','not_found','error']);
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(value,1e12):0;
export async function createQaMetrics({env={},jobId,transportAttempt,emit=record=>console.info(JSON.stringify(record)),clock=()=>Date.now()}={}) {
 if(env.WORKBENCH_QA_ENABLED!=='true'||env.WORKBENCH_QA_METRICS_ENABLED!=='true'||typeof jobId!=='string'||!/^[a-f0-9-]{36}$/i.test(jobId))return undefined;
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`security-workbench.qa-metrics/v1:${jobId}`));
 const jobRef=[...new Uint8Array(hash)].slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('');
 const started=clock(),counts={github_attempts:0,github_sent:0,github_bytes:0,d1_api_attempts:0,d1_statement_attempts:0,d1_meta_responses:0,d1_meta_missing:0,d1_rows_read_observed:0,d1_rows_written_observed:0};
 const sourceRevision=typeof env.WORKBENCH_QA_SOURCE_SHA==='string'&&/^[a-f0-9]{40}$/.test(env.WORKBENCH_QA_SOURCE_SHA)?env.WORKBENCH_QA_SOURCE_SHA:null;
 const delivery=Number.isSafeInteger(transportAttempt)&&transportAttempt>=1&&transportAttempt<=101?transportAttempt:null;
 let finished=false,analysisAttempt=null;
 function observe(event) {
  if(analysisAttempt===null&&event?.type==='attempt'&&Number.isSafeInteger(event.attempt)&&event.attempt>=1&&event.attempt<=2)analysisAttempt=event.attempt;
  for(const [key,field] of [['github_attempts','attempted'],['github_sent','sent'],['github_bytes','bytes']])counts[key]=Math.max(counts[key],number(event?.[field]));
 }
 function meta(result) {
  try {
  const m=result?.meta;
  if(m&&Number.isFinite(m.rows_read)&&Number.isFinite(m.rows_written)) {
   counts.d1_meta_responses++;counts.d1_rows_read_observed+=number(m.rows_read);counts.d1_rows_written_observed+=number(m.rows_written);
  }else counts.d1_meta_missing++;
  }catch{counts.d1_meta_missing++;}
 }
 function wrapDb(db) {
  const raw=new WeakMap();
  function wrap(statement) {
   const out=new Proxy(statement,{get(target,property){
    if(property==='bind')return (...values)=>wrap(target.bind(...values));
    const method=Reflect.get(target,property);
    if(['first','all','run','raw'].includes(property)&&typeof method==='function')return async(...values)=>{
     counts.d1_api_attempts++;counts.d1_statement_attempts++;
     try {const result=await method.apply(target,values);meta(['first','raw'].includes(property)?null:result);return result;}
     catch(error){counts.d1_meta_missing++;throw error;}
    };
    return typeof method==='function'?method.bind(target):method;
   }});
   raw.set(out,statement);return out;
  }
  return new Proxy(db,{get(target,property){
   if(property==='prepare')return (...values)=>wrap(target.prepare(...values));
   if(property==='batch')return async statements=>{
    counts.d1_api_attempts++;counts.d1_statement_attempts+=Array.isArray(statements)?statements.length:0;
    try {const result=await target.batch(Array.isArray(statements)?statements.map(s=>raw.get(s)??s):statements);for(const item of result)meta(item);return result;}
    catch(error){counts.d1_meta_missing++;throw error;}
   };
   const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }});
 }
 function finish(outcome='error',code) {
  if(finished)return;finished=true;
  const record={event:'swb.qa.metrics/v1',job_ref:jobRef,source_revision:sourceRevision,analysis_attempt:analysisAttempt,transport_attempt:delivery,
   ...Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,number(v)])),
   wall_ms:number(clock()-started),cpu_ms:null,cpu_source:'cloudflare_trace_required',outcome:OUTCOMES.has(outcome)?outcome:'error',
   error_count:code||['failed','error'].includes(outcome)?1:0,error_code:code?(CODES.has(code)?code:'other'):outcome==='error'?'other':null};
  try {emit(record);}catch{/* Observability cannot alter product behavior. */}
 }
 return {observe,wrapDb,finish};
}
