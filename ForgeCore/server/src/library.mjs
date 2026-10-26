import {stat,lstat,access,readdir} from 'node:fs/promises';
import {join,resolve,relative,sep} from 'node:path';
import {constants} from 'node:fs';
// Per-title destination chosen by the owner. Only fixed, proven library
// categories can be selected; never accept absolute/relative user paths.
export const DESTINATIONS=Object.freeze({
 series:Object.freeze(['auto','TV shows','Animes','Animation','Cartoon']),
 movie:Object.freeze(['auto','Movies','Anime Movies'])
});
export function validateDestination(kind,value='auto'){
 const dest=String(value??'auto');
 if(!Object.hasOwn(DESTINATIONS,kind)||!DESTINATIONS[kind].includes(dest))
  throw Object.assign(Error('Zielordner für diesen Medientyp nicht erlaubt'),{status:400});
 return dest;
}
export function safePart(value){
 const v=String(value||'').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').replace(/^[. ]+|[. ]+$/g,'').slice(0,120);
 if(!v||v==='.'||v==='..')throw Object.assign(Error('Invalid filename segment'),{status:400});
 return v;
}
export function mediaRelative(media,episode,{seriesFolder='Shows',seriesName=null}={}){
 if(media.kind==='movie'){
  const destination=validateDestination('movie',media.destination);
  const folder=destination==='auto'?'Movies':destination;
  const name=safePart(media.title)+(media.year?` (${media.year})`:'');
  return join(folder,name);
 }
 const folder=safeLibraryFolder(seriesFolder);
 const name=seriesName?safePart(seriesName):safePart(media.title);
 if(!episode)return join(folder,name);
 return join(folder,name,'Season '+String(episode.season).padStart(2,'0'));
}
// Jellyfin installations often separate anime, animation, cartoons and TV series.
// Reuse exactly one existing series directory instead of creating a new /Shows
// tree that Jellyfin might not monitor. Never infer a category from the title.
export const SERIES_LIBRARY_FOLDERS=Object.freeze(['Animes','Animation','Cartoon','TV shows','Shows','Series','Serien']);
export function safeLibraryFolder(raw){
 const name=String(raw??'').trim();
 if(!name||name==='.'||name==='..'||name!==safePart(name)||/[\\/]/.test(name))
  throw Object.assign(Error('Ungültiger Jellyfin-Serienordner'),{status:400});
 return name;
}
export async function resolveSeriesHome(root,media,{folders=SERIES_LIBRARY_FOLDERS,
 fallbackFolder=process.env.FORGECORE_SERIES_DEFAULT_FOLDER||'Shows'}={}){
 const title=safePart(media.title),defaultFolder=safeLibraryFolder(fallbackFolder);
 const selected=validateDestination('series',media.destination);
 if(selected!=='auto'){
  // Respect a user's explicit library choice, and do not search or write
  // into other categories. Preserve the existing title (year) folder if found.
  const category=ensureWithin(root,join(root,selected));
  const names=[title,...(Number.isInteger(Number(media.year))&&Number(media.year)>=1888&&Number(media.year)<=2200?[title+' ('+Number(media.year)+')']:[])];
  const existing=[];
  try{
   const s=await lstat(category);
   if(!s.isDirectory()||s.isSymbolicLink())throw Error('Unsicherer Medienkategorie-Ordner');
   for(const name of names){
    try{
     const info=await lstat(ensureWithin(root,join(category,name)));
     if(info.isDirectory()&&!info.isSymbolicLink())existing.push(name);
    }catch(e){if(e.code!=='ENOENT')throw e}
   }
  }catch(e){if(e.code!=='ENOENT')throw e}
  if(existing.length>1)throw Object.assign(Error('Mehrere gleichnamige Serienordner in dieser Kategorie'),{status:409});
  return {seriesFolder:selected,seriesName:existing[0]||title};
 }
 const year=Number(media.year);
 const seriesNames=[title,...(Number.isInteger(year)&&year>=1888&&year<=2200?[title+' ('+year+')']:[])];
 const matches=[];
 for(const raw of [...new Set([...folders,defaultFolder])]){
  const folder=safeLibraryFolder(raw);
  const category=ensureWithin(root,join(root,folder));
  let categoryStat;
  try{categoryStat=await lstat(category)}catch(error){if(error.code==='ENOENT')continue;throw error}
  if(!categoryStat.isDirectory()||categoryStat.isSymbolicLink())continue;
  for(const name of seriesNames){
   const candidate=ensureWithin(root,join(category,name));
   try{
    const info=await lstat(candidate);
    if(info.isDirectory()&&!info.isSymbolicLink())matches.push({seriesFolder:folder,seriesName:name});
   }catch(error){if(error.code!=='ENOENT')throw error}
  }
 }
 if(matches.length>1)throw Object.assign(
  Error('Serie ist in mehreren Medienordnern vorhanden. Speicherziel vor dem Download eindeutig festlegen.'),{status:409});
 return matches[0]||{seriesFolder:defaultFolder,seriesName:title};
}
export function mediaBaseName(media,episode){
 if(media.kind==='movie')return safePart(media.title)+(media.year?` (${media.year})`:'');
 if(!episode)throw Error('Episode required');
 return safePart(media.title)+' S'+String(episode.season).padStart(2,'0')+'E'+String(episode.episode).padStart(2,'0');
}
export function ensureWithin(root,target){const r=resolve(root),t=resolve(target),rel=relative(r,t);if(rel==='..'||rel.startsWith('..'+sep)||rel.startsWith(sep))throw Error('Path outside media root');return t;}
const extensions=new Set(['.mp4','.mkv','.ts','.webm','.m4v','.mov','.avi']);
export async function previewLibrary(root,media,episode=null,options={}){
 const base=mediaBaseName(media,episode);
 const home=media.kind==='series'?await resolveSeriesHome(root,media,options):null;
 let target=ensureWithin(root,join(root,mediaRelative(media,episode,home||{})));
 // Respect existing German/Jellyfin season folders rather than assuming
 // every library uses English `Season NN` naming.
 if(episode&&media.kind==='series'){
  const seriesDir=ensureWithin(root,join(root,home.seriesFolder,home.seriesName));
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
