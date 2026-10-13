import {mkdir,open,readFile,rename,rm,stat,lstat,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve,relative,sep} from 'node:path';
import {safeFetch,safeStream} from './source-security.mjs';

const MAX_SEGMENT=48*1024*1024;
const MAX_MEDIA=12*1024*1024*1024;
const MAX_SEGMENTS=4001;
function aborted(signal){if(signal?.aborted)throw Object.assign(Error('Transfer cancelled'),{code:'ABORT_ERR'});}
function digest(b){return createHash('sha256').update(b).digest('hex');}
function safeId(id){if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))throw Error('Unsafe transfer identifier');return id;}
async function regular(path){try{const s=await lstat(path);return s.isFile()&&!s.isSymbolicLink()?s:null}catch(e){if(e.code==='ENOENT')return null;throw e}}
export async function prepareStaging(root,jobId){
 const folder=join(resolve(root),'forgecore-job-'+safeId(jobId));
 await mkdir(folder,{recursive:true,mode:0o700});
 const s=await lstat(folder);
 if(!s.isDirectory()||s.isSymbolicLink())throw Error('Unsafe staging directory');
 return folder;
}
async function verifiedCached(file,maxBytes){
 const info=await regular(file),checksum=await regular(file+'.sha256');
 if(!info||!checksum||info.size===0||info.size>maxBytes)return null;
 const expected=(await readFile(file+'.sha256','utf8')).trim();
 if(!/^[a-f0-9]{64}$/.test(expected))return null;
 const hash=createHash('sha256'),fd=await open(file,'r');
 try{
  const data=Buffer.allocUnsafe(1024*1024);
  while(true){const {bytesRead}=await fd.read(data,0,data.length,null);if(!bytesRead)break;hash.update(data.subarray(0,bytesRead));}
 }finally{await fd.close()}
 return hash.digest('hex')===expected?info.size:null;
}
async function safelyWrite(file,url,{fetcher,signal,maxBytes,onBytes,rateLimitBytesPerSecond,startTime,consumed}){
 const part=file+'.partial-'+randomUUID();
 let bytes=0;const hash=createHash('sha256');
 const fd=await open(part,'wx',0o600);
 try{
  const write=async buffer=>{
   aborted(signal);
   bytes+=buffer.length;if(bytes>maxBytes)throw Error('Segment exceeds size limit');
   const projected=consumed()+buffer.length;
   if(projected>12*1024*1024*1024)throw Error('Media exceeds size limit');
   await fd.writeFile(buffer);hash.update(buffer);
   onBytes(buffer.length);
   if(rateLimitBytesPerSecond>0){
    const {setTimeout:sleep}=await import('node:timers/promises');
    while(true){
     aborted(signal);const delay=Math.ceil(consumed()/rateLimitBytesPerSecond*1000-(Date.now()-startTime));
     if(delay<=0)break;await sleep(Math.min(20000,delay),undefined,{signal});
    }
   }
  };
  if(fetcher===safeFetch)await safeStream(url,{maxBytes,signal,onChunk:write});
  else{const result=await fetcher(url,{maxBytes,signal});if(result.body?.length)await write(result.body);}
  if(bytes===0)throw Error('Empty media segment');
  await fd.sync();
 }finally{await fd.close()}
 try{
  await rename(part,file);
  const shaFile=file+'.sha256';
  const out=await open(shaFile,'w',0o600);
  try{await out.writeFile(hash.digest('hex')+'\n');await out.sync();}finally{await out.close()}
 }catch(error){await rm(part,{force:true}).catch(()=>{});throw error}
 return bytes;
}
export async function cacheSegments({staging,track,urls,fetcher=safeFetch,signal,onProgress=()=>{},rateLimitBytesPerSecond=0,onRecover=()=>{}}){
 if(!Array.isArray(urls)||!urls.length||urls.length>MAX_SEGMENTS)throw Error('Invalid segment count');
 const manifestHash=digest(Buffer.from(JSON.stringify(urls)));
 const manifestPath=join(staging,track+'.manifest');
 const previous=await regular(manifestPath);
 let matches=false;
 if(previous){matches=(await readFile(manifestPath,'utf8')).trim()===manifestHash;}
 if(!matches){
  for(const name of await readdir(staging))if(name.startsWith(track+'-')||name===track+'.manifest')await rm(join(staging,name),{force:true});
  const fd=await open(manifestPath,'w',0o600);try{await fd.writeFile(manifestHash);await fd.sync();}finally{await fd.close()}
 }
 let done=0,bytes=0;const started=Date.now();
 const destination=join(staging,track+'.data');
 const output=await open(destination,'w',0o600);
 try{
  for(let i=0;i<urls.length;i++){
   aborted(signal);
   const file=join(staging,track+'-'+String(i).padStart(5,'0')+'.bin');
   const maxBytes=urls.length===1?12*1024*1024*1024:MAX_SEGMENT;
   let cached=await verifiedCached(file,maxBytes);
   if(cached){onRecover(cached);}
   else{
    await rm(file,{force:true}).catch(()=>{});
    await rm(file+'.sha256',{force:true}).catch(()=>{});
    cached=await safelyWrite(file,urls[i],{fetcher,signal,maxBytes,rateLimitBytesPerSecond,startTime:started,consumed:()=>bytes,onBytes:n=>{bytes+=n;}});
    // bytes includes streamed new bytes; account separately below.
    bytes-=cached;
   }
   const fd=await open(file,'r');
   try{
    const buffer=Buffer.allocUnsafe(1024*1024);
    while(true){
     aborted(signal);
     const {bytesRead}=await fd.read(buffer,0,buffer.length,null);if(!bytesRead)break;
     await output.writeFile(buffer.subarray(0,bytesRead));
    }
   }finally{await fd.close()}
   bytes+=cached;done++;
   if(bytes>12*1024*1024*1024)throw Error('Media exceeds size limit');
   await onProgress({segments:done,total:urls.length,bytes,reused:!!cached&&matches});
  }
  await output.sync();
 }finally{await output.close()}
 return {filename:destination,bytes,segments:done};
}
export async function cleanupTransferStaging(root,jobId){await rm(join(resolve(root),'forgecore-job-'+safeId(jobId)),{recursive:true,force:true})}
