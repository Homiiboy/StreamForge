import {stat,access,readdir} from 'node:fs/promises';
import {join,resolve,relative,sep} from 'node:path';
import {constants} from 'node:fs';
export function safePart(value){
 const v=String(value||'').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').replace(/^[. ]+|[. ]+$/g,'').slice(0,120);
 if(!v||v==='.'||v==='..')throw Object.assign(Error('Invalid filename segment'),{status:400});
 return v;
}
export function mediaRelative(media,episode){
 if(media.kind==='movie'){
  const name=safePart(media.title)+(media.year?` (${media.year})`:'');
  return join('Movies',name);
 }
 const name=safePart(media.title);
 if(!episode)return join('Shows',name);
 return join('Shows',name,'Season '+String(episode.season).padStart(2,'0'));
}
export function mediaBaseName(media,episode){
 if(media.kind==='movie')return safePart(media.title)+(media.year?` (${media.year})`:'');
 if(!episode)throw Error('Episode required');
 return safePart(media.title)+' S'+String(episode.season).padStart(2,'0')+'E'+String(episode.episode).padStart(2,'0');
}
export function ensureWithin(root,target){const r=resolve(root),t=resolve(target),rel=relative(r,t);if(rel==='..'||rel.startsWith('..'+sep)||rel.startsWith(sep))throw Error('Path outside media root');return t;}
const extensions=new Set(['.mp4','.mkv','.ts','.webm','.m4v','.mov','.avi']);
export async function previewLibrary(root,media,episode=null){
 const base=mediaBaseName(media,episode);
 let target=ensureWithin(root,join(root,mediaRelative(media,episode)));
 // Respect existing German/Jellyfin season folders rather than assuming
 // every library uses English `Season NN` naming.
 if(episode&&media.kind==='series'){
  const seriesDir=ensureWithin(root,join(root,'Shows',safePart(media.title)));
  try{
   const seasonDirs=await readdir(seriesDir,{withFileTypes:true});
   const seasonCandidates=seasonDirs.filter(x=>x.isDirectory()).filter(x=>{
    const m=x.name.match(/^(?:Season|Staffel)[\s._-]*0*(\d{1,3})$/i);
    return m&&Number(m[1])===Number(episode.season);
   }).map(x=>x.name).sort((a,b)=>a.localeCompare(b,'de'));
   if(seasonCandidates.length)target=ensureWithin(root,join(seriesDir,seasonCandidates[0]));
  }catch(error){if(error.code!=='ENOENT')throw error;}
 }
 let exists=false;let matchingFiles=[];
 try{
  const entries=await readdir(target,{withFileTypes:true});
  const expected=base.toLocaleLowerCase();
  matchingFiles=entries.filter(x=>x.isFile()).map(x=>x.name).filter(name=>{
   const dot=name.lastIndexOf('.');return dot>0&&extensions.has(name.slice(dot).toLowerCase())&&name.slice(0,dot).toLocaleLowerCase()===expected;
  });
  exists=matchingFiles.length>0;
 }catch(err){if(err.code!=='ENOENT')throw err;}
 return {directory:relative(resolve(root),target).split(sep).join('/'),basename:base,exists,files:matchingFiles};
}
export async function checkMediaRoot(root){
 if(!root)return {configured:false,readable:false,writeable:false};
 try{const s=await stat(root);if(!s.isDirectory())return {configured:true,readable:false,writeable:false};await access(root,constants.R_OK);let writeable=false;try{await access(root,constants.W_OK);writeable=true;}catch{}return {configured:true,readable:true,writeable};}
 catch{return {configured:true,readable:false,writeable:false};}
}
