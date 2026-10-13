import {libraryParts} from './library-folders.js';
export async function writeIntoLibrary(rootHandle, file, naming, extension, placement='library', progress=()=>{}){
  if(!rootHandle || typeof rootHandle.getDirectoryHandle!=='function')throw Error('Kein gültiger Bibliotheksordner');
  if(!file || typeof file.size!=='number' || file.size<=0 || typeof file.slice!=='function')throw Error('Keine gültige Mediendatei');
  if(typeof rootHandle.queryPermission==='function'){
    const permission=await rootHandle.queryPermission({mode:'readwrite'});
    if(permission!=='granted')throw Error('Schreibzugriff auf den ausgewählten Ordner nicht erteilt. Bitte den Ordner erneut auswählen.');
  }
  const {folders,filename}=libraryParts(naming,extension,placement);
  let dir=rootHandle;
  for(const part of folders)dir=await dir.getDirectoryHandle(part,{create:true});
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
