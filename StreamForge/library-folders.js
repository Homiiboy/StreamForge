import {normalizeJellyfinCategory} from './jellyfin-categories.js';
import {validateNaming,buildMediaBasename,sanitizeBaseName} from './naming.js';
export const LIBRARY_PREF_KEY='sf_library_v180';
export function safeFolderPart(input){
  const value=sanitizeBaseName(input,'').replace(/^\.+|\.+$/g,'').trim();
  if(!value||value==='.'||value==='..'||value.includes('/')||value.includes('\\')) throw Error('Ungültiger Ordnername');
  return value;
}
export function libraryParts(naming, extension='.mp4', placement='library', category=''){
  const checked=validateNaming(naming);
  if(!checked.ok)throw Error(checked.error);
  const n=checked.value;
  if(!['.mp4','.ts','.webm','.mkv','.m4v','.mov','.avi','.mp3','.m4a','.aac','.ogg','.opus','.wav','.srt','.vtt'].includes(extension))throw Error('Dateityp nicht unterstützt');
  const basename=safeFolderPart(buildMediaBasename(n));
  const filename=basename+extension;
  const container=category?normalizeJellyfinCategory(category,n):n.type==='movie'?'Movies':'Shows';
  const folders=n.type==='movie'
    ?[safeFolderPart(basename)]
    :[safeFolderPart(n.title), 'Season '+String(Number(n.season)).padStart(2,'0')];
  if(placement==='series') {
    if(n.type!=='series')throw Error('Serienordner nur für Serien');
    return {folders:[folders[1]],filename};
  }
  if(placement==='season') {
    if(n.type!=='series')throw Error('Staffelordner nur für Serien');
    return {folders:[],filename};
  }
  if(placement==='category')return {folders,filename};
  return {folders:[container,...folders],filename};
}
export function downloadsRelativePath(naming,extension='.mp4'){
  const {folders,filename}=libraryParts(naming,extension,'library');
  return [...folders,filename].join('/');
}
export function normalizeLibraryOptions(opts){
  const mode=['ask','local','downloads','picked'].includes(opts?.mode)?opts.mode:'ask';
  const placement=['library','category','series','season'].includes(opts?.placement)?opts.placement:'library';
  const handleKey=typeof opts?.handleKey==='string' && /^job-[a-f0-9-]{36}$/i.test(opts.handleKey) ? opts.handleKey : '';
  const category=['Movies','Tv Shows','Animes','Anime Movies','Cartoon','Animation'].includes(opts?.category)?opts.category:'';
  const seasonFolder=typeof opts?.seasonFolder==='string' && /^(?:season|staffel)[\s._-]*0*\d{1,3}$|^specials$/i.test(opts.seasonFolder)
    ?opts.seasonFolder.slice(0,90):'';
  return {...(handleKey?{mode,placement,handleKey}:{mode,placement}),...(seasonFolder?{seasonFolder}:{}),...(category?{category}:{})};
}
