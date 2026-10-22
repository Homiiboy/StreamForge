import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
import {normalizeSearchTerm,matchItems} from '../src/site-search.mjs';
test('site search matches media titles without unrelated results',()=>{
 assert.equal(normalizeSearchTerm(' Slugterra '),'Slugterra');
 assert.equal(matchItems([{url:'https://example.org/Slugterra-S01E01.mp4',title:'Slugterra S01E01'},{url:'https://example.org/other.mp4',title:'Other'}],'Slugterra').length,1);
 assert.throws(()=>normalizeSearchTerm('a'),/Suchbegriff/);
});
test('site catalog requires login and search remains read-only',async()=>{
 const fetcher=async url=>({url,body:Buffer.from('<a href="/Slugterra-S01E01.mp4" title="Slugterra S01E01">Folge</a><a href="/other.mp4" title="Other">Other</a>')});
 const app=createApp({startWorker:false,staticFiles:false,sourceFetch:fetcher});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 let cookie='',csrf='';
 const request=async(path,method='GET',body)=>{
  const r=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method,headers:{'x-forgecore-request':'1',...(cookie?{cookie}:{}),...(csrf?{'x-forgecore-csrf':csrf}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const data=await r.json();if(data.csrf)csrf=data.csrf;return {status:r.status,data};
 };
 try{
  assert.equal((await request('/api/search-sites')).status,401);
  assert.equal((await request('/api/setup','POST',{password:'safe-password-123456'})).status,201);
  assert.equal((await request('/api/auth/login','POST',{password:'safe-password-123456'})).status,200);
  const made=await request('/api/search-sites','POST',{url:'https://example.org/episodes',label:'Quelle'});
  assert.equal(made.status,201,JSON.stringify(made.data));
  const found=await request('/api/site-search','POST',{query:'Slugterra'});
  assert.equal(found.status,200,JSON.stringify(found.data));
  assert.equal(found.data.results.length,1);
  assert.equal((await request('/api/transfers')).data.items.length,0);
  const backup=await request('/api/backup/export');
  assert.equal(backup.data.search_sites.length,1);
  assert.equal((await request('/api/search-sites/'+made.data.item.id,'PATCH',{enabled:false})).status,200);
  assert.equal((await request('/api/site-search','POST',{query:'Slugterra'})).data.checked,0);
  assert.equal((await request('/api/search-sites/'+made.data.item.id,'DELETE')).status,200);
 }finally{await app.close();}
});
