import assert from 'node:assert/strict';
import {verifyLibraryWrite} from '../library-access-check.js';
class Folder{
  constructor(writeAllowed=true){this.writeAllowed=writeAllowed;this.children=new Map();}
  async queryPermission(){return this.writeAllowed?'granted':'denied'}
  async getDirectoryHandle(name,opts){if(!this.writeAllowed)throw Error('denied');if(!this.children.has(name))this.children.set(name,new Folder());return this.children.get(name)}
  async getFileHandle(){return {createWritable:async()=>({write:async()=>{},close:async()=>{},abort:async()=>{}})}}
  async removeEntry(name){this.children.delete(name)}
}
const writable=new Folder();
assert.equal(await verifyLibraryWrite(writable,{id:'one'}),true);
assert.equal(writable.children.size,0);
await assert.rejects(verifyLibraryWrite(new Folder(false)),/Schreibberechtigung/);
await assert.rejects(verifyLibraryWrite(null),/Kein nutzbarer/);
console.log('library write permission preflight tests passed');
