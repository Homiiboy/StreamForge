import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
import {inspectCatalogHtml,episodeFromUrl,compareCatalogWithJellyfin} from '../src/catalog-inspect.mjs';

test('catalog episode parsing is URL-based and stays same origin',()=>{
 const html='<a href="/staffel/2">Staffel 2</a><a href="/staffel/2/folge/8">E8</a><a href="/season/3/episode/2">E2</a><a href="/forum/slugterra">Bei Slugterra s03e02 steht Fehler</a><a href="https://elsewhere.example/season/1/episode/1">External</a>';
 const result=inspectCatalogHtml(html,'https://example.org/serie/slugterra');
 assert.deepEqual(result.seasons,[2,3]);
 assert.deepEqual(result.episodes.map(x=>[x.season,x.episode]),[[2,8],[3,2]]);
 assert.equal(episodeFromUrl('https://example.org/forum/slugterra-s03e02'),null);
});
test('Jellyfin comparison is conservative and does not confuse series titles',()=>{
 const result=compareCatalogWithJellyfin('Slugterra',[{season:2,episode:8},{season:2,episode:9}],[
  {Type:'Episode',SeriesName:'Slugterra',ParentIndexNumber:2,IndexNumber:8},
  {Type:'Episode',SeriesName:'Unrelated',ParentIndexNumber:2,IndexNumber:9}
 ]);
 assert.equal(result.matched,1);
 assert.equal(result.foundInJellyfin,1);
 assert.equal(result.items[1].inJellyfin,false);
});
test('catalog inspection requires login, saved site, same origin, and never mutates episodes',async()=>{
 const requests=[];
 const sourceFetch=async url=>{requests.push(url);return {url,body:Buffer.from('<a href="/season/2/episode/8">Episode 8</a><a href="https://other.example/season/2/episode/9">External</a>')}};
 const app=createApp({startWorker:false,staticFiles:false,sourceFetch});
 await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
 let cookie='',csrf='';
 const req=async(path,method='GET',body)=>{
  const result=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method,headers:{'x-forgecore-request':'1',...(cookie?{cookie}:{}),...(csrf?{'x-forgecore-csrf':csrf}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const setCookie=result.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
  const data=await result.json();if(data.csrf)csrf=data.csrf;
  return {status:result.status,data};
 };
 try{
  const request={siteId:'',url:'https://example.org/series/slugterra',title:'Slugterra'};
  assert.equal((await req('/api/catalog/inspect','POST',request)).status,401);
  assert.equal((await req('/api/setup','POST',{password:'safe-password-123456'})).status,201);
  assert.equal((await req('/api/auth/login','POST',{password:'safe-password-123456'})).status,200);
  const site=(await req('/api/search-sites','POST',{label:'Demo',url:'https://example.org/'})).data.item;
  request.siteId=site.id;
  assert.equal((await req('/api/catalog/inspect','POST',{...request,url:'https://other.example/series/slugterra'})).status,400);
  assert.equal((await req('/api/catalog/inspect','POST',{...request,url:'https://example.org/comments/foo'})).status,400);
  const result=await req('/api/catalog/inspect','POST',request);
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.episodes.length,1);
  assert.equal(result.data.episodes[0].forgecoreStatus,'not-tracked');
  assert.equal(result.data.episodes[0].season,2);
  assert.equal(requests.every(url=>url.startsWith('https://example.org/')),true);
  assert.equal((await req('/api/media')).data.items.length,0);
  const preview=await req('/api/catalog/jellyfin-preview','POST',{title:'Slugterra',episodes:[{season:2,episode:8}]});
  assert.equal(preview.status,409);
 }finally{await app.close()}
});
