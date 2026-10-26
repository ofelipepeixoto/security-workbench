/** Offline packaging for the two approved QA Workers. Never uploads or calls APIs.
 * The private output includes the existing compiled server and static assets.
 * No Cloudflare administrative token or additional storage binding is needed.
 */
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,lstat,realpath,chmod,rename} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const RESOURCE=/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const MIME=Object.freeze({'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon',
  '.woff':'font/woff','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'});
export const QA_WORKER_NAMES=Object.freeze({web:'security-workbench-qa',consumer:'security-workbench-analysis-qa',queue:'security-workbench-analysis-qa'});
const reject=()=>{throw Error('QA packaging rejected: verify the approved account, distinct QA resources, origin and source revision.');};
const PRESERVED_FLAGS=new Set(['GITHUB_LOGIN_ENABLED','GITHUB_APP_ENABLED','WORKBENCH_MULTIUSER_ENABLED']);
const PRESERVED_SCOPE=Object.freeze({GITHUB_OWNER_ID:'171351708',WORKBENCH_OWNER_ID:'qa:ofelipepeixoto'});
const APP_SCOPE_NAMES=Object.freeze({GITHUB_APP_ID:'appId',GITHUB_APP_SLUG:'slug',GITHUB_APP_KEY_VERSION:'keyVersion'});
const PRESERVED_NAMES=new Set([...PRESERVED_FLAGS,...Object.keys(PRESERVED_SCOPE),...Object.keys(APP_SCOPE_NAMES),'GITHUB_LOGIN_CLIENT_ID','GITHUB_APP_CLIENT_ID','WORKBENCH_ORIGIN','WORKBENCH_PILOT_GITHUB_IDS','GITHUB_SESSION_VERSION']);
const REQUIRED_SNAPSHOT=['GITHUB_LOGIN_ENABLED','GITHUB_APP_ENABLED','WORKBENCH_MULTIUSER_ENABLED','GITHUB_OWNER_ID','WORKBENCH_OWNER_ID','WORKBENCH_ORIGIN','WORKBENCH_PILOT_GITHUB_IDS'];
function approvedAppScope(m) {
  const app=m.approvedGitHubApp;
  if(app===undefined)return null;
  if(!app||typeof app!=='object'||Array.isArray(app)||Object.keys(app).length!==3||Object.keys(app).some(k=>!['appId','slug','keyVersion'].includes(k))||
    typeof app.appId!=='string'||!/^[1-9][0-9]{0,11}$/.test(app.appId)||
    typeof app.slug!=='string'||!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(app.slug)||
    typeof app.keyVersion!=='string'||!/^[1-9][0-9]{0,11}$/.test(app.keyVersion))reject();
  return app;
}
/** A reviewed read-only snapshot, never a request to activate authentication.
 * Offline validation cannot prove its remote provenance: the caller must bind
 * this exact snapshot to the confirmed account/Workers in the private review.
 */
function existingAuthSettings(m) {
  const app=approvedAppScope(m);
  if(m.existingPlainBindings===undefined)return null;
  if(!app)reject();
  const snapshot=m.existingPlainBindings;
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||Object.keys(snapshot).length!==2||Object.keys(snapshot).some(k=>!['web','consumer'].includes(k)))reject();
  const all={};
  for(const role of ['web','consumer']) {
    const rows=snapshot[role];
    if(!Array.isArray(rows)||rows.length>13)reject();
    const values={};
    for(const binding of rows) {
      if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).some(k=>!['name','type','text'].includes(k))||
        binding.type!=='plain_text'||!PRESERVED_NAMES.has(binding.name)||Object.hasOwn(values,binding.name)||typeof binding.text!=='string'||!binding.text||binding.text.length>200||/[\r\n\0]/.test(binding.text))reject();
      const {name,text}=binding;
      if(PRESERVED_FLAGS.has(name)&&!['true','false'].includes(text))reject();
      if(Object.hasOwn(PRESERVED_SCOPE,name)&&text!==PRESERVED_SCOPE[name])reject();
      if(Object.hasOwn(APP_SCOPE_NAMES,name)&&text!==app[APP_SCOPE_NAMES[name]])reject();
      if(name==='GITHUB_SESSION_VERSION'&&!/^[1-9][0-9]{0,11}$/.test(text))reject();
      if(name==='WORKBENCH_ORIGIN'&&text!==m.origin)reject();
      if(name==='WORKBENCH_PILOT_GITHUB_IDS') {
        const actors=text.split(',');
        if(!actors.length||new Set(actors).size!==actors.length||actors.some(id=>!['171351708','322086368'].includes(id)))reject();
      }
      if(['GITHUB_LOGIN_CLIENT_ID','GITHUB_APP_CLIENT_ID'].includes(name)&&(!/^[A-Za-z0-9._-]{3,100}$/.test(text)||/^(?:github_pat_|gh[pousr]_|sk-)/i.test(text)))reject();
      values[name]=text;
    }
    if(REQUIRED_SNAPSHOT.some(name=>!Object.hasOwn(values,name)))reject();
    if(values.GITHUB_LOGIN_ENABLED==='true'&&!values.GITHUB_LOGIN_CLIENT_ID)reject();
    if(values.GITHUB_APP_ENABLED==='true'&&['GITHUB_APP_ID','GITHUB_APP_SLUG','GITHUB_APP_CLIENT_ID','GITHUB_APP_KEY_VERSION'].some(name=>!values[name]))reject();
    all[role]=values;
  }
  return all;
}
export function validatePackagingManifest(m) {
  if(!m||!/^[a-f0-9]{32}$/.test(m.accountId??'')||!UUID.test(m.databaseId??'')||!UUID.test(m.restoreDatabaseId??'')||
    (m.queuePending===true?m.queueId!==undefined:!RESOURCE.test(m.queueId??''))||m.queueName!==QA_WORKER_NAMES.queue||
    !/^https:\/\/security-workbench-qa\.[a-z0-9-]+\.workers\.dev$/.test(m.origin??''))reject();
  const ids=[m.databaseId,m.restoreDatabaseId,...(m.queuePending===true?[]:[m.queueId])];
  const production=m.productionResourceIds??(m.productionManagedBySites===true?[]:null);
  if(new Set(ids).size!==ids.length||!Array.isArray(production)||ids.some(id=>production.includes(id)))reject();
  if(!/^[a-f0-9]{40}$/.test(m.sourceRevision??''))reject();
  existingAuthSettings(m);
  return m;
}
export function qaMetadata(m,mainModule,compatibility={}) {
  validatePackagingManifest(m);
  const role=mainModule==='qa-entry.mjs'?'web':mainModule==='analysis-worker.mjs'?'consumer':null;
  if(!role)reject();
  const preserved=existingAuthSettings(m)?.[role]??{};
  const vars={WORKBENCH_MULTIUSER_ENABLED:'false',
    GITHUB_APP_ENABLED:'false',GITHUB_LOGIN_ENABLED:'false',WORKBENCH_OWNER_ID:'qa:ofelipepeixoto',
    GITHUB_OWNER_ID:'171351708',WORKBENCH_PILOT_GITHUB_IDS:'171351708,322086368',WORKBENCH_ORIGIN:m.origin,
    ...preserved,
    // Code publication/deployment never activates jobs, telemetry or a model.
    WORKBENCH_JOBS_ENABLED:'false',WORKBENCH_CONTEXTUAL_ENABLED:'false',WORKBENCH_QA_METRICS_ENABLED:'false',WORKBENCH_QA_ENABLED:'true',WORKBENCH_QA_SOURCE_SHA:m.sourceRevision};
  return {main_module:mainModule,compatibility_date:compatibility.date??'2026-05-15',
    compatibility_flags:compatibility.flags??['nodejs_compat'],
    bindings:[{type:'d1',name:'DB',id:m.databaseId},
      ...(m.queuePending===true?[]:[{type:'queue',name:'ANALYSIS_QUEUE',queue_name:m.queueName}]),
      ...Object.entries(vars).map(([name,text])=>({type:'plain_text',name,text}))],
    keep_bindings:['secret_text'],observability:{enabled:false},logpush:false,
    tags:['security-workbench-qa','preactivation',...(m.sourceRevision?[`source:${m.sourceRevision}`]:[])]};
}
/** Stable private review digests; neither module contents nor secrets are logged. */
export function qaPackageDigests(payload) {
  const sha=value=>createHash('sha256').update(value).digest('hex');
  const worker=key=>({name:payload[key].name,metadataSha256:sha(JSON.stringify(payload[key].metadata)),
    modules:payload[key].modules.map(m=>({name:m.name,bytes:Buffer.byteLength(m.content),sha256:sha(m.content)})).sort((a,b)=>a.name.localeCompare(b.name))});
  return {sourceRevision:payload.sourceRevision,web:worker('web'),consumer:worker('consumer'),payloadSha256:sha(JSON.stringify(payload))};
}
export function createQaEntryModule(assets,origin,handlerImport='./index.js') {
  // Static paths are exact own-property matches. No network fallback, arbitrary
  // file read, source map, manifest-directory listing or callback interception.
  return `import app from ${JSON.stringify(handlerImport)};
const assets=${JSON.stringify(assets)};
const origin=${JSON.stringify(origin)};
function assetResponse(request) {
 const url=new URL(request.url);
 if(url.origin!==origin)return new Response('Not found',{status:404});
 const item=Object.hasOwn(assets,url.pathname)?assets[url.pathname]:null;
 if(!item)return null;
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 const headers={'Content-Type':item.type,'Cache-Control':url.pathname.startsWith('/_next/static/')?'public, max-age=31536000, immutable':'public, max-age=3600','ETag':item.etag,'X-Content-Type-Options':'nosniff'};
 if(request.headers.get('If-None-Match')===item.etag)return new Response(null,{status:304,headers});
 const data=request.method==='HEAD'?null:Uint8Array.from(atob(item.base64),c=>c.charCodeAt(0));
 return new Response(data,{headers});
}
export default {async fetch(request,env,ctx) {
 const asset=assetResponse(request);if(asset)return asset;
 const bindings={...env,ASSETS:{async fetch(input,init){const r=input instanceof Request?input:new Request(input,init);return assetResponse(r)??new Response('Not found',{status:404});}}};
 return app.fetch(request,bindings,ctx);
}};
`;
}
async function files(directory,prefix='') {
  const out=[];
  for(const name of (await readdir(path.join(directory,prefix))).sort()) {
    if(name.startsWith('.'))continue;
    const relative=prefix?`${prefix}/${name}`:name;
    const stat=await lstat(path.join(directory,relative));
    if(stat.isSymbolicLink())throw Error('QA packaging refuses symlinks.');
    if(stat.isDirectory())out.push(...await files(directory,relative));
    else if(stat.isFile())out.push(relative);
  }
  return out;
}
export async function prepareQaWorkers(m,{root=ROOT}={}) {
  validatePackagingManifest(m);
  const server=path.join(root,'web/dist/server'),client=path.join(root,'web/dist/client');
  const config=JSON.parse(await readFile(path.join(server,'wrangler.json'),'utf8'));
  if(config.main!=='index.js'||config.services?.length||config.kv_namespaces?.length||config.r2_buckets?.length)throw Error('Unexpected compiled server binding: review before QA packaging.');
  const modules=[];
  for(const name of await files(server)) {
    if(!/\.(?:js|mjs)$/.test(name))continue;
    if(!/^[A-Za-z0-9_./@~:%+-]+$/.test(name))throw Error('Unsafe module filename.');
    modules.push({name,content:await readFile(path.join(server,name),'utf8'),type:'application/javascript+module'});
  }
  if(!modules.some(m=>m.name===config.main))throw Error('Compiled server entry missing.');
  const assets={};let bytes=0;
  for(const name of await files(client)) {
    if(name==='_headers'||name==='_redirects'||name.endsWith('.map'))continue;
    const type=MIME[path.extname(name)];if(!type)throw Error('Unreviewed static asset type.');
    const data=await readFile(path.join(client,name));bytes+=data.length;
    if(data.length>1024*1024||bytes>8*1024*1024||Object.keys(assets).length>=200)throw Error('QA static asset budget exceeded.');
    assets[`/${name}`]={base64:data.toString('base64'),type,etag:`"${createHash('sha256').update(data).digest('hex')}"`};
  }
  modules.push({name:'qa-entry.mjs',content:createQaEntryModule(assets,m.origin),type:'application/javascript+module'});
  const dependency=createRequire(await realpath(path.join(root,'web/node_modules/wrangler/package.json')));
  const bundled=await dependency('esbuild').build({entryPoints:[path.join(root,'web/workers/analysis-consumer.mjs')],bundle:true,
    format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:workers'],minify:true,write:false,sourcemap:false,legalComments:'inline',logLevel:'silent'});
  if(bundled.outputFiles.length!==1)throw Error('Unexpected consumer bundle output.');
  const metadata=(entry)=>qaMetadata(m,entry,{date:config.compatibility_date,flags:config.compatibility_flags});
  const payload={accountId:m.accountId,sourceRevision:m.sourceRevision??null,
    web:{name:QA_WORKER_NAMES.web,metadata:metadata('qa-entry.mjs'),modules},
    consumer:{name:QA_WORKER_NAMES.consumer,metadata:metadata('analysis-worker.mjs'),modules:[{name:'analysis-worker.mjs',content:bundled.outputFiles[0].text,type:'application/javascript+module'}]},
    summary:{sourceRevision:m.sourceRevision,existingAuthSettingsPreserved:m.existingPlainBindings!==undefined,contextualAiEnabled:false,serverModules:modules.length,assetFiles:Object.keys(assets).length,assetBytes:bytes,
      restoreDatabaseBound:false,cronConfigured:false,queueBindingConfigured:m.queuePending!==true,queueConsumerAttached:false,networkUsed:false}};
  const serialized=JSON.stringify(payload);
  if(Buffer.byteLength(serialized)>8*1024*1024)throw Error('QA upload payload budget exceeded.');
  return payload;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const manifestPath=process.argv[2];
    if(!manifestPath||process.argv.length!==3)throw Error('Usage: node scripts/prepare-qa-workers.mjs <private-resource-manifest.json>. Offline only.');
    const payload=await prepareQaWorkers(JSON.parse(await readFile(manifestPath,'utf8')));
    const directory=path.join(ROOT,'.qa-local');await mkdir(directory,{recursive:true,mode:0o700});
    if((await lstat(directory)).isSymbolicLink())throw Error('QA output directory must not be a symlink.');
    await chmod(directory,0o700);
    const temporary=path.join(directory,`deploy-payloads.${randomUUID()}.tmp`);
    await writeFile(temporary,JSON.stringify(payload),{mode:0o600,flag:'wx'});
    await rename(temporary,path.join(directory,'deploy-payloads.json'));
    process.stdout.write(JSON.stringify({status:'prepared_locally',...payload.summary})+'\n');
  }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
