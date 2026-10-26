import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {previewLibrary,resolveSeriesHome,mediaRelative,safeLibraryFolder} from '../src/library.mjs';
const media={kind:'series',title:'One Piece',year:1999};
const episode={season:1,episode:49};
const setup=async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-layout-'));
 return root;
};
test('v1.8.4 finds existing anime folder, German Staffel and existing episode without modifying files',async()=>{
 const root=await setup();
 try{
  const dest=join(root,'Animes','One Piece','Staffel 01');
  await mkdir(dest,{recursive:true});
  await mkdir(join(root,'TV shows'),{recursive:true});
  await writeFile(join(dest,'One Piece S01E49.mkv'),'fixture');
  const p=await previewLibrary(root,media,episode,{fallbackFolder:'TV shows'});
  assert.equal(p.directory,'Animes/One Piece/Staffel 01');
  assert.equal(p.exists,true);
  assert.deepEqual(p.files,['One Piece S01E49.mkv']);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('v1.8.4 reuses series folder named with release year and does not default to TV shows',async()=>{
 const root=await setup();
 try{
  await mkdir(join(root,'Animes','One Piece (1999)','Season 01'),{recursive:true});
  const p=await previewLibrary(root,media,episode,{fallbackFolder:'TV shows'});
  assert.equal(p.directory,'Animes/One Piece (1999)/Season 01');
  assert.equal(p.exists,false);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('v1.8.4 new series fall back only to the explicitly configured category',async()=>{
 const root=await setup();
 try{
  const p=await previewLibrary(root,{kind:'series',title:'New Series'},episode,{fallbackFolder:'TV shows'});
  assert.equal(p.directory,'TV shows/New Series/Season 01');
  const movie=await previewLibrary(root,{kind:'movie',title:'Example',year:2020});
  assert.equal(movie.directory,'Movies/Example (2020)');
  assert.equal(mediaRelative(media,episode),'Shows/One Piece/Season 01');
 }finally{await rm(root,{recursive:true,force:true})}
});
test('v1.8.4 refuses ambiguous duplicates and unsafe destination folder input',async()=>{
 const root=await setup();
 try{
  await mkdir(join(root,'Animes','One Piece'),{recursive:true});
  await mkdir(join(root,'Cartoon','One Piece'),{recursive:true});
  await assert.rejects(resolveSeriesHome(root,media),e=>e.status===409);
  for(const folder of ['../movies','', 'TV shows/../../something','.']){
   assert.throws(()=>safeLibraryFolder(folder));
  }
 }finally{await rm(root,{recursive:true,force:true})}
});
test('v1.8.4 excludes symlinked series directories from automatic category discovery',async()=>{
 const root=await setup();
 try{
  await mkdir(join(root,'Animes'),{recursive:true});
  await mkdir(join(root,'other'),{recursive:true});
  await symlink(join(root,'other'),join(root,'Animes','One Piece'));
  const outcome=await resolveSeriesHome(root,media,{fallbackFolder:'TV shows'});
  assert.deepEqual(outcome,{seriesFolder:'TV shows',seriesName:'One Piece'});
 }finally{await rm(root,{recursive:true,force:true})}
});
