// Shared extension-origin IndexedDB storage for File System Access handles.
// FileSystemDirectoryHandle is structured-cloneable in IndexedDB (not chrome.storage).
const DB_NAME='streamforge-destinations-v180';
const STORE='handles';
export function directoryHandleStore(){
  const open=()=>new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
    req.onerror=()=>reject(req.error||Error('IDB open failed'));
    req.onsuccess=()=>resolve(req.result);
  });
  const use=async(operation,mode='readonly')=>{
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      const req=operation(tx.objectStore(STORE));
      let result;
      req.onsuccess=()=>{result=req.result;};
      req.onerror=()=>reject(req.error||Error('IDB operation failed'));
      tx.oncomplete=()=>{db.close();resolve(result);};
      tx.onerror=()=>{db.close();reject(tx.error||Error('IDB transaction failed'));};
      tx.onabort=()=>{db.close();reject(tx.error||Error('IDB transaction aborted'));};
    });
  };
  return {
    get:(key='destination')=>use(store=>store.get(key)),
    put:(handle,key='destination')=>use(store=>store.put(handle,key),'readwrite'),
    clear:(key='destination')=>use(store=>store.delete(key),'readwrite')
  };
}
