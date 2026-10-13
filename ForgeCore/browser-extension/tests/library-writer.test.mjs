import assert from 'node:assert/strict';
import {writeIntoLibrary} from '../library-writer.js';
class MockDirectory{
  constructor(name){this.name=name;this.dirs=new Map();this.files=new Map();}
  async queryPermission(){return 'granted'}
  async getDirectoryHandle(name,{create}={}){if(!this.dirs.has(name)){if(!create)throw Object.assign(Error('not found'),{name:'NotFoundError'});this.dirs.set(name,new MockDirectory(name))}return this.dirs.get(name)}
  async getFileHandle(name,{create}={}){if(!this.files.has(name)){if(!create)throw Object.assign(Error('not found'),{name:'NotFoundError'});this.files.set(name,new Uint8Array(0))}
    return {createWritable:async()=>({write:async blob=>{const b=new Uint8Array(await blob.arrayBuffer());this.files.set(name,b)},close:async()=>{},abort:async()=>{}}),getFile:async()=>new Blob([this.files.get(name)])}}
  async removeEntry(name){this.files.delete(name)}
}
const root=new MockDirectory('library');
const movie={type:'movie',title:'Interstellar',year:'2014'};
const result=await writeIntoLibrary(root,new Blob(['hello']),movie,'.mp4');
assert.equal(result.relativePath,'Movies/Interstellar (2014)/Interstellar (2014).mp4');
assert.equal(result.bytes,5);
await assert.rejects(writeIntoLibrary(root,new Blob(['hello']),movie,'.mp4'),/existiert bereits/);
const shows=new MockDirectory('Slugterra');
const ep={type:'series',title:'Slugterra',season:2,episode:8};
const saved=await writeIntoLibrary(shows,new Blob(['episode']),ep,'.mp4','series');
assert.equal(saved.relativePath,'Season 02/Slugterra S02E08.mp4');
const season=shows.dirs.get('Season 02');
const nested=await writeIntoLibrary(season,new Blob(['next']),{...ep,episode:9},'.mp4','season');
assert.equal(nested.relativePath,'Slugterra S02E09.mp4');
console.log('library writer tests passed');
