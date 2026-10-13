import {parseSeasonFolder,checkedSeasonFolder} from './season-discovery.js';
import {libraryParts} from './library-folders.js';
export async function writeIntoLibrary(rootHandle, file, naming, extension, placement='library', progress=()=>{}, options={}){
  if(!rootHandle || typeof rootHandle.getDirectoryHandle!=='function')throw Error('Kein gültiger Bibliotheksordner');
  if(!file || typeof file.size!=='number' || file.size<=0 || typeof file.slice!=='function')throw Error('Keine gültige Mediendatei');
  if(typeof rootHandle.queryPermission==='function'){
    const permission=await rootHandle.queryPermission({mode:'readwrite'});
    if(permission!=='granted')throw Error('Schreibzugriff auf den ausgewählten Ordner nicht erteilt. Bitte den Ordner erneut auswählen.');
  }
  const {folders,filename}=libraryParts(naming,extension,placement);
  let dir=rootHandle;
  for(let i=0;i<folders.length;i++){
    let part=folders[i];
    const last=i===folders.length-1;
    if(last && naming?.type==='series'){
      if(options.seasonFolder){
        part=checkedSeasonFolder(options.seasonFolder,naming.season);
        // A user-selected season folder must already exist.
        dir=await dir.getDirectoryHandle(part,{create:false});
        folders[i]=part;
        continue;
      }
      // Prefer an existing recognized season directory, even if it is called
      // "Staffel 2" instead of the canonical "Season 02".
      if(typeof dir.entries==='function'){
        const matches=[];
        for await(const [name,handle] of dir.entries())
          if(handle.kind==='directory'&&parseSeasonFolder(name)===Number(naming.season))
            matches.push(name);
        if(matches.length){
          part=matches.includes(part)?part:matches.sort((a,b)=>a.localeCompare(b,'de'))[0];
          folders[i]=part;
        }
      }
    }
    dir=await dir.getDirectoryHandle(part,{create:true});
  }
  try{
    await dir.getFileHandle(filename,{create:false});
    throw Error('Datei existiert bereits: '+filename+'. Bitte vorhandene Episode prüfen.');
  }catch(error){if(error?.name!=='NotFoundError')throw error;}
  const handle=await dir.getFileHandle(filename,{create:true});
  let stream;
  try{
    stream=await handle.createWritable({keepExistingData:false});
    const chunkSize=8*1024*1024;
    for(let offset=0;offset<file.size;offset+=chunkSize){
      await stream.write(file.slice(offset,Math.min(offset+chunkSize,file.size)));
      await progress(Math.min(file.size,offset+chunkSize),file.size);
    }
    await stream.close();
    stream=null;
    const result=await handle.getFile();
    if(result.size!==file.size)throw Error('Zieldatei hat nach dem Schreiben eine unerwartete Größe.');
    return {relativePath:[...folders,filename].join('/'),bytes:result.size};
  }catch(error){
    try{await stream?.abort();}catch{}
    try{await dir.removeEntry(filename);}catch{}
    throw error;
  }
}
