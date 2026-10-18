import {directoryHandleStore} from './directory-handle-store.js';

// Verify writing *before* downloading a large HLS/DASH file. A stored handle
// alone does not imply Chrome has granted persistent write permission.
export async function verifyLibraryWrite(root,{id='probe'}={}){
  if(!root||typeof root.getDirectoryHandle!=='function')throw Error('Kein nutzbarer Medienordner gespeichert.');
  if(typeof root.queryPermission==='function' && await root.queryPermission({mode:'readwrite'})!=='granted')
    throw Error('Der ausgewählte Ordner hat keine Schreibberechtigung.');
  const folder='.streamforge-write-test-'+id.replace(/[^a-z0-9-]/gi,'').slice(0,48);
  let created=false;
  try {
    const temp=await root.getDirectoryHandle(folder,{create:true});
    created=true;
    const handle=await temp.getFileHandle('test.txt',{create:true});
    const writer=await handle.createWritable();
    try{await writer.write('StreamForge Schreibtest');await writer.close();}
    catch(error){try{await writer.abort();}catch{}throw error;}
  } catch(error){
    throw new Error('Der ausgewählte Ordner ist nicht beschreibbar ('+String(error?.message||error)+'). Bitte Ordnerzugriff und Browserberechtigung prüfen.');
  } finally {
    if(created)await root.removeEntry(folder,{recursive:true}).catch(()=>{});
  }
  return true;
}
export async function getSelectedLibraryHandle(key='destination'){
  return directoryHandleStore().get(key);
}
