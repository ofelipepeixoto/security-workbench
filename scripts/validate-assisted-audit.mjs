/** Offline validation only. Never fetches a target, executes it or persists reviews. */
import {open,constants} from 'node:fs/promises';
import {parseEvidenceJson} from '../web/lib/rea-import.mjs';
import {validateAssistedAuditNotes,ASSISTED_LIMITS} from '../web/lib/assisted-audit.mjs';

async function readBounded(path,limit){
  if(!Number.isInteger(constants.O_NOFOLLOW))throw Error('Safe file reading unavailable');
  const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const before=await f.stat();
    if(!before.isFile()||before.nlink!==1||before.size<1||before.size>limit)throw Error('Invalid input');
    const data=Buffer.alloc(limit+1);let size=0;
    while(size<=limit){const {bytesRead}=await f.read(data,size,limit+1-size,null);if(!bytesRead)break;size+=bytesRead;}
    const after=await f.stat();
    if(size!==before.size||size>limit||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.nlink!==1)throw Error('Changed input');
    return new Uint8Array(data.subarray(0,size));
  }finally{await f.close();}
}
try{
  if(process.argv.length!==4)throw Error('Expected two local files');
  const run=parseEvidenceJson(await readBounded(process.argv[2],1024*1024));
  const result=await validateAssistedAuditNotes(await readBounded(process.argv[3],ASSISTED_LIMITS.input_bytes),run);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch{process.stderr.write('Validação assistida recusada: confira contrato, escopo atual, referências e limites. Nenhuma ação externa foi executada.\n');process.exitCode=1;}
