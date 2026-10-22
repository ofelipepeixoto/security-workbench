/** Allowlist-only CI diagnostics. Never inspect/clone a response body, emit a
 * URL, raw header, message, stack, cause, token or repository content. */
const number=value=>/^\d{1,12}$/.test(value??'')?Number(value):null;
function stage(input) {
  try {
    const url=new URL(typeof input==='string'?input:input.url);
    if(url.origin!=='https://api.github.com')return 'other';
    if(/\/git\/commits\//.test(url.pathname))return 'commit';
    if(/\/git\/trees\//.test(url.pathname))return 'tree';
    if(/\/git\/blobs\//.test(url.pathname))return 'blob';
    if(/^\/repos\/[^/]+\/[^/]+$/.test(url.pathname))return 'metadata';
  }catch {/* Do not reflect invalid URLs. */}
  return 'other';
}
export function createSmokeDiagnostics(fetcher,{now=()=>performance.now()}={}) {
  const requests=[];
  return {
    async fetcher(input,init) {
      const entry={stage:stage(input),status:null,elapsed_ms:0,rate_limit:null,rate_remaining:null,rate_reset:null,retry_after:null,transport_failed:false};
      if(requests.length<32)requests.push(entry);
      const started=now();
      try {
        const response=await fetcher(input,init);
        entry.status=Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null;
        for(const [field,header] of [['rate_limit','x-ratelimit-limit'],['rate_remaining','x-ratelimit-remaining'],['rate_reset','x-ratelimit-reset'],['retry_after','retry-after']])entry[field]=number(response.headers?.get(header));
        return response;
      }catch(error){entry.transport_failed=true;throw error;}
      finally {entry.elapsed_ms=Math.max(0,Math.min(45000,Math.round(now()-started)));}
    },
    snapshot(error,check='acquisition') {
      const last=requests.at(-1);
      const category=last&&[403,429].includes(last.status)&&last.rate_remaining===0?'external_rate_limit':
        last?.status>=300?'external_http_response':last?.transport_failed?'transport_failure':
        error?.name==='GitHubAcquisitionTimeoutError'?'acquisition_timeout':
        error?.name==='AssertionError'?'smoke_assertion':'acquisition_or_integrity_failure';
      const checks=new Set(['acquisition','verified_revision','revision','repository_id','files_read','bytes_read','snapshot_digest','files_limit','bytes_limit','partial_coverage','candidate_status']);
      return {category,check:checks.has(check)?check:'acquisition',requests:requests.map(x=>({...x}))};
    },
  };
}
