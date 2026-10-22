import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
import {normalizeSearchTerm,matchItems,validateSearchSite,detailCandidates} from '../src/site-search.mjs';
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

test('configured search template stays on originating site and encodes user input',()=>{
 assert.throws(()=>validateSearchSite({url:'https://example.org/catalog',searchTemplate:'https://evil.example/?q={query}'}),/selben Website/);
 assert.throws(()=>validateSearchSite({url:'https://example.org/catalog',searchTemplate:'https://example.org/search?q=foo'}),/\{query\}/);
 assert.equal(validateSearchSite({url:'https://example.org/catalog',searchTemplate:'https://example.org/search?q={query}'}).searchTemplate,'https://example.org/search?q={query}');
 assert.deepEqual(detailCandidates('<a href="/shows/slugterra">Slugterra</a><a href="https://evil.example/item">Slugterra</a>','https://example.org/search','Slugterra').map(x=>x.url),['https://example.org/shows/slugterra']);
});
test('site template searches same-origin detail page only, without queueing',async()=>{
 const requests=[];
 const fetcher=async url=>{
  requests.push(url);
  const body=url.includes('/search?q=')?'<a href="/shows/slugterra">Slugterra Staffel 1</a>':url.includes('/shows/slugterra')?'<a title="S01E01" href="/media/episode-1.mp4">Episode 1</a>':'';
  return {url,body:Buffer.from(body)};
 };
 const app=createApp({startWorker:false,staticFiles:false,sourceFetch:fetcher});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 let cookie='',csrf='';
 const req=async(path,method='GET',body)=>{
  const resp=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method,headers:{'x-forgecore-request':'1',...(cookie?{cookie}:{}),...(csrf?{'x-forgecore-csrf':csrf}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const c=resp.headers.get('set-cookie');if(c)cookie=c.split(';')[0];const x=await resp.json();if(x.csrf)csrf=x.csrf;return {status:resp.status,data:x};
 };
 try{
  await req('/api/setup','POST',{password:'safe-password-123456'});
  await req('/api/auth/login','POST',{password:'safe-password-123456'});
  const created=await req('/api/search-sites','POST',{url:'https://example.org/catalog',label:'Provider',searchTemplate:'https://example.org/search?q={query}'});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const result=await req('/api/site-search','POST',{query:'Slugterra'});
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.results.length,1,JSON.stringify(result.data));
  assert.ok(requests.includes('https://example.org/search?q=Slugterra'));
  assert.ok(requests.includes('https://example.org/shows/slugterra'));
  assert.equal((await req('/api/transfers')).data.items.length,0);
 }finally{await app.close()}
});
