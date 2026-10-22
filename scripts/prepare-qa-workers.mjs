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
export function validatePackagingManifest(m) {
  if(!m||!/^[a-f0-9]{32}$/.test(m.accountId??'')||!UUID.test(m.databaseId??'')||!UUID.test(m.restoreDatabaseId??'')||
    (m.queuePending===true?m.queueId!==undefined:!RESOURCE.test(m.queueId??''))||m.queueName!==QA_WORKER_NAMES.queue||
    !/^https:\/\/security-workbench-qa\.[a-z0-9-]+\.workers\.dev$/.test(m.origin??''))reject();
  const ids=[m.databaseId,m.restoreDatabaseId,...(m.queuePending===true?[]:[m.queueId])];
  const production=m.productionResourceIds??(m.productionManagedBySites===true?[]:null);
  if(new Set(ids).size!==ids.length||!Array.isArray(production)||ids.some(id=>production.includes(id)))reject();
  if(m.sourceRevision!==undefined&&!/^[a-f0-9]{40}$/.test(m.sourceRevision))reject();
  return m;
}
export function qaMetadata(m,mainModule,compatibility={}) {
  validatePackagingManifest(m);
  const vars={WORKBENCH_QA_ENABLED:'true',WORKBENCH_JOBS_ENABLED:'false',WORKBENCH_MULTIUSER_ENABLED:'false',
    GITHUB_APP_ENABLED:'false',GITHUB_LOGIN_ENABLED:'false',WORKBENCH_OWNER_ID:'qa:ofelipepeixoto',
    GITHUB_OWNER_ID:'171351708',WORKBENCH_PILOT_GITHUB_IDS:'171351708,322086368',WORKBENCH_ORIGIN:m.origin,
    ...(m.sourceRevision?{WORKBENCH_QA_SOURCE_SHA:m.sourceRevision}:{})};
  return {main_module:mainModule,compatibility_date:compatibility.date??'2026-05-15',
    compatibility_flags:compatibility.flags??['nodejs_compat'],
    bindings:[{type:'d1',name:'DB',id:m.databaseId},
      ...(m.queuePending===true?[]:[{type:'queue',name:'ANALYSIS_QUEUE',queue_name:m.queueName}]),
      ...Object.entries(vars).map(([name,text])=>({type:'plain_text',name,text}))],
    observability:{enabled:false},logpush:false,
    tags:['security-workbench-qa','preactivation',...(m.sourceRevision?[`source:${m.sourceRevision}`]:[])]};
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
    summary:{serverModules:modules.length,assetFiles:Object.keys(assets).length,assetBytes:bytes,
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
