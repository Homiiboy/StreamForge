import {validateNaming,buildMediaBasename,sanitizeBaseName} from './naming.js';
export function jellyfinRelativePath(naming,extension='.mp4'){
  const checked=validateNaming(naming);
  if(!checked.ok)throw Error(checked.error);
  const n=checked.value;
  const ext=['.mp4','.ts','.mkv','.webm','.srt','.vtt'].includes(extension)?extension:'.mp4';
  const base=buildMediaBasename(n).replace(/\.\.+/g,'.');
  // The resulting path is relative, never a full network or filesystem path.
  if(n.type==='movie'){
    const folder=sanitizeBaseName(base);
    return 'Movies/'+folder+'/'+base+ext;
  }
  const title=sanitizeBaseName(n.title.replace(/\s+S\d{1,3}E\d{1,3}\s*$/i,'').trim()).replace(/\.\.+/g,'.');
  const season=String(Number(n.season)).padStart(2,'0');
  return 'Shows/'+title+'/Season '+season+'/'+base+ext;
}
export function jellyfinFolder(naming){
  const path=jellyfinRelativePath(naming);
  return path.slice(0,path.lastIndexOf('/'));
}
