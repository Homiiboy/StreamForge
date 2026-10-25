import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
import {catalogRecord,discoverCatalog,discoverDetail,discoverKind} from '../src/discover.mjs';

const tmdbResponse=(payload,status=200)=>new Response(JSON.stringify(payload),{
 status,headers:{'content-type':'application/json'}
});
function fakeTmdb(url,options){
 const u=new URL(url);
 assert.equal(u.origin,'https://api.themoviedb.org');
 assert.equal(options.headers.authorization,'Bearer test-token');
 assert.equal(u.searchParams.get('language'),'de-DE');
 if(u.pathname.endsWith('/search/multi'))return Promise.resolve(tmdbResponse({results:[
  {id:1,media_type:'person',name:'not a movie'},
  {id:319,media_type:'tv',name:'One Piece',first_air_date:'1999-10-20',poster_path:'/poster_1.jpg',vote_average:8.9},
  {id:222,media_type:'movie',title:'Beispiel',release_date:'2025-03-17'}
 ]}));
 if(u.pathname.endsWith('/tv/319'))return Promise.resolve(tmdbResponse({id:319,name:'One Piece',first_air_date:'1999-10-20'}));
 return Promise.resolve(tmdbResponse({results:[{id:319,media_type:'tv',name:'One Piece'}]}));
}
test('Discover: normalize only TMDB movie and series, reject unsafe poster paths',()=>{
 assert.equal(catalogRecord({id:1,media_type:'person',name:'Actor'}),null);
 assert.equal(catalogRecord({id:2,media_type:'tv',name:'Test',poster_path:'//evil.example/x.jpg'}).poster,null);
 assert.equal(catalogRecord({id:3,media_type:'movie',title:'Sample',release_date:'2023-05-15'}).externalId,'tmdb:movie:3');
 assert.throws(()=>discoverKind('person'),/Ungültig/);
});
test('Discover: missing secret yields safe empty catalog without network',async()=>{
 const result=await discoverCatalog({token:'',fetcher:()=>{throw Error('Unexpected request');}});
 assert.equal(result.configured,false);
 assert.deepEqual(result.items,[]);
});
test('Discover: search, trending, poster allowlist and detail use fixed TMDB host',async()=>{
 const result=await discoverCatalog({token:'test-token',query:'One Piece',kind:'all',fetcher:fakeTmdb});
 assert.equal(result.mode,'search');
 assert.equal(result.items.length,2);
 assert.equal(result.items[0].kind,'tv');
 assert.equal(result.items[0].poster,'https://image.tmdb.org/t/p/w342/poster_1.jpg');
 const trending=await discoverCatalog({token:'test-token',kind:'tv',fetcher:fakeTmdb});
 assert.equal(trending.items.length,1);
 const d=await discoverDetail({token:'test-token',kind:'tv',id:319,fetcher:fakeTmdb});
 assert.equal(d.externalId,'tmdb:tv:319');
 await assert.rejects(()=>discoverCatalog({token:'test-token',kind:'all',query:'x',fetcher:fakeTmdb}),/Mindestens/);
 await assert.rejects(()=>discoverDetail({token:'test-token',kind:'person',id:319,fetcher:fakeTmdb}),/Ungültig/);
});
test('Discover API: protected catalog and idempotent, user-approved library import',async()=>{
 const app=createApp({dbPath:':memory:',startWorker:false,staticFiles:false,tmdbToken:'test-token',discoverFetch:fakeTmdb});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='',csrf='';
 const req=async(path,method='GET',body)=>{
  const headers={'x-forgecore-request':'1'};
  if(body!==undefined)headers['content-type']='application/json';
  if(cookie)headers.cookie=cookie;
  if(csrf)headers['x-forgecore-csrf']=csrf;
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const data=await r.json();
  if(data.csrf)csrf=data.csrf;
  return {status:r.status,data};
 };
 try{
  assert.equal((await req('/api/discover')).status,401);
  assert.equal((await req('/api/setup','POST',{password:'very long secure test password'})).status,201);
  assert.equal((await req('/api/auth/login','POST',{password:'very long secure test password'})).status,200);
  assert.equal((await req('/api/discover/status')).data.configured,true);
  const search=await req('/api/discover?q=One%20Piece');
  assert.equal(search.status,200);
  assert.equal(search.data.items.length,2);
  assert.equal(JSON.stringify(search.data).includes('test-token'),false);
  const first=await req('/api/discover/add','POST',{id:319,kind:'tv'});
  assert.equal(first.status,201);
  assert.equal(first.data.item.kind,'series');
  assert.equal(first.data.item.external_id,'tmdb:tv:319');
  const again=await req('/api/discover/add','POST',{id:319,kind:'tv'});
  assert.equal(again.status,200);
  assert.equal(again.data.alreadyAdded,true);
  assert.equal((await req('/api/media')).data.items.length,1);
  assert.equal((await req('/api/discover/add','POST',{id:'319',kind:'tv'})).status,400);
 }finally{await app.close();}
});
