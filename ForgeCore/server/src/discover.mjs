// ForgeCore Discover – TMDB catalog adapter inspired by StreamRadar v0.5.3.
// Fixed remote origin, no executable website content and no download functionality.
const API_BASE='https://api.themoviedb.org/3';
const POSTER_BASE='https://image.tmdb.org/t/p/w342';
const ALLOWED=new Set(['all','movie','tv']);
const cache=new Map();
const error=(message,status=400)=>Object.assign(new Error(message),{status});
export function discoverKind(value='all'){
 if(typeof value!=='string'||!ALLOWED.has(value))throw error('Ungültiger Katalogtyp');
 return value;
}
export function catalogRecord(item,fallback=''){
 if(!item||typeof item!=='object')return null;
 const kind=item.media_type==='movie'||item.media_type==='tv'?item.media_type:fallback;
 if(!['movie','tv'].includes(kind)||!Number.isSafeInteger(item.id)||item.id<1)return null;
 const title=String(kind==='movie'?(item.title||item.original_title||''):(item.name||item.original_name||'')).trim().slice(0,140);
 if(!title)return null;
 const date=String(kind==='movie'?item.release_date||'':item.first_air_date||'');
 const year=/^(18|19|20|21)\d{2}/.test(date)?Number(date.slice(0,4)):null;
 const poster=typeof item.poster_path==='string'&&/^\/[A-Za-z0-9_/-]+\.(?:jpg|jpeg|png|webp)$/i.test(item.poster_path)?POSTER_BASE+item.poster_path:null;
 return {id:item.id,kind,title,year,overview:String(item.overview||'').slice(0,1100),poster,
  rating:Number.isFinite(item.vote_average)?Math.round(item.vote_average*10)/10:null,
  releaseDate:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null,
  externalId:'tmdb:'+kind+':'+item.id};
}
export function hasDiscoverToken(token){return typeof token==='string'&&token.trim().length>0;}
export async function tmdb(path,{token,fetcher=fetch,params={}}={}){
 if(!hasDiscoverToken(token))throw error('TMDB nicht konfiguriert. FORGECORE_TMDB_TOKEN in .env eintragen.',503);
 const url=new URL(API_BASE+path);
 url.searchParams.set('language','de-DE');
 for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetcher(url.href,{headers:{accept:'application/json',authorization:'Bearer '+token.trim()},signal:controller.signal});
  if(!response.ok)throw error(response.status===429?'TMDB-Limit erreicht':'TMDB derzeit nicht erreichbar',response.status===429?429:502);
  if(Number(response.headers.get('content-length')||0)>1024*1024)throw error('TMDB-Antwort zu groß',502);
  const data=await response.json();
  if(!data||typeof data!=='object')throw error('Ungültige TMDB-Antwort',502);
  return data;
 }catch(e){
  if(e.status)throw e;
  throw error('TMDB-Abfrage fehlgeschlagen',502);
 }finally{clearTimeout(timer);}
}
export async function discoverCatalog({token=process.env.FORGECORE_TMDB_TOKEN,query='',kind='all',fetcher=fetch}={}){
 kind=discoverKind(kind);
 if(typeof query!=='string'||query.length>100)throw error('Suchtext zu lang');
 query=query.trim();
 if(query&&query.length<2)throw error('Mindestens zwei Zeichen eingeben');
 if(!hasDiscoverToken(token))return {configured:false,items:[],source:'TMDB',mode:query?'search':'trending'};
 const canCache=fetcher===fetch,key=kind+'|'+query.toLowerCase();
 if(canCache&&cache.get(key)?.until>Date.now())return cache.get(key).value;
 const path=query?'/search/'+(kind==='all'?'multi':kind):'/trending/'+kind+'/week';
 const payload=await tmdb(path,{token,fetcher,params:query?{query,include_adult:'false',page:1}:{page:1}});
 const items=(Array.isArray(payload.results)?payload.results:[]).map(item=>catalogRecord(item,kind==='all'?'':kind)).filter(Boolean).slice(0,20);
 const result={configured:true,items,source:'TMDB',mode:query?'search':'trending'};
 if(canCache){if(cache.size>=40)cache.clear();cache.set(key,{value:result,until:Date.now()+300000});}
 return result;
}
export async function discoverDetail({token=process.env.FORGECORE_TMDB_TOKEN,id,kind,fetcher=fetch}={}){
 if(!['movie','tv'].includes(kind)||!Number.isSafeInteger(id)||id<1)throw error('Ungültiger TMDB-Titel');
 const payload=await tmdb('/'+kind+'/'+id,{token,fetcher});
 const item=catalogRecord(payload,kind);
 if(!item)throw error('Titel nicht gefunden',404);
 return item;
}
