import {backup} from 'node:sqlite';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
/**
 * Produce a SQLite-consistent binary snapshot, including authentication,
 * download state and history. Protect it like an admin credential.
 * Run off the shared transfer volume and remove the temporary file.
 */
export async function withDatabaseSnapshot(db,handler,{directory=process.env.FORGECORE_STAGING_ROOT||tmpdir()}={}){
 const folder=await mkdtemp(join(directory,'forgecore-backup-'));
 const path=join(folder,'forgecore.sqlite');
 try{
  await backup(db,path,{pagesPerStep:128});
  const file=await stat(path);
  if(file.size===0)throw Error('Empty database snapshot');
  return await handler(path,file.size);
 }finally{await rm(folder,{recursive:true,force:true})}
}
