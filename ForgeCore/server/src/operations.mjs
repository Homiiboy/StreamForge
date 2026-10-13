import {statfs,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {freemem,totalmem,loadavg} from 'node:os';
import {one,rows} from './db.mjs';
const b=m=>Math.round(m/1024/1024);
async function diskStatus(path){
 if(!path)return {configured:false,readable:false,writable:false,freeMiB:null,totalMiB:null};
 try{
  const stats=await statfs(path);
  await access(path,constants.R_OK);
  let writable=false;try{await access(path,constants.W_OK);writable=true}catch{}
  return {configured:true,readable:true,writable,freeMiB:Math.floor(stats.bavail*stats.bsize/1048576),totalMiB:Math.floor(stats.blocks*stats.bsize/1048576)};
 }catch{return {configured:true,readable:false,writable:false,freeMiB:null,totalMiB:null}}
}
function count(db,sql){return Number(one(db,sql)?.n||0)}
export async function operationalStatus(db,{mediaRoot='',stagingRoot='',version='unknown'}={}){
 const [media,data]=await Promise.all([diskStatus(mediaRoot),diskStatus(stagingRoot)]);
 const runtime=process.memoryUsage();
 let integrity='unknown';
 try{const result=one(db,'PRAGMA quick_check');integrity=result?.quick_check==='ok'?'ok':'problem'}catch{integrity='error'}
 return {
  version,uptimeSeconds:Math.floor(process.uptime()),
  memory:{rssMiB:b(runtime.rss),heapUsedMiB:b(runtime.heapUsed),systemFreeMiB:b(freemem()),systemTotalMiB:b(totalmem())},
  systemLoad1min:Math.round(loadavg()[0]*100)/100,
  media,data,
  database:{schema:Number(one(db,'PRAGMA user_version')?.user_version||0),integrity},
  totals:{
   movies:count(db,"SELECT COUNT(*) n FROM media WHERE kind='movie'"),
   series:count(db,"SELECT COUNT(*) n FROM media WHERE kind='series'"),
   episodes:count(db,'SELECT COUNT(*) n FROM episodes'),
   queuedTransfers:count(db,"SELECT COUNT(*) n FROM transfer_jobs WHERE state='queued'"),
   runningTransfers:count(db,"SELECT COUNT(*) n FROM transfer_jobs WHERE state='running'"),
   failedTransfers:count(db,"SELECT COUNT(*) n FROM transfer_jobs WHERE state='failed'"),
   sourceMonitors:count(db,"SELECT COUNT(*) n FROM source_automation WHERE enabled=1")
  },
  checks:{
   databaseOk:integrity==='ok',
   mediaReadable:media.readable,
   mediaWritable:media.writable,
   dataWritable:data.writable,
   freeDataAtLeastGiB:data.freeMiB===null?false:data.freeMiB>=1024
  },
  warnings:[
   ...(!media.readable?['Medienverzeichnis nicht lesbar']:[]),
   ...(!media.writable?['Medienverzeichnis nicht schreibbar']:[]),
   ...(!data.writable?['Datenvolume nicht schreibbar']:[]),
   ...(data.freeMiB!==null&&data.freeMiB<1024?['Weniger als 1 GiB im Datenvolume frei']:[]),
   ...(integrity!=='ok'?['SQLite-Schnellprüfung fehlgeschlagen']:[])
  ]
 };
}
export function diagnosticEvents(db){
 const failed=rows(db,"SELECT id,error,updated_at FROM transfer_jobs WHERE state='failed' ORDER BY updated_at DESC LIMIT 12");
 const checks=rows(db,"SELECT source_id,last_error,failures FROM source_automation WHERE failures>0 ORDER BY failures DESC LIMIT 12");
 return {failedTransfers:failed,sourceErrors:checks};
}
