// Shared StreamRadar-inspired TMDB/TVmaze metadata bridge for ForgeCore Discover.
// Fixed hosts only; no arbitrary HTTP URLs, no media stream extraction.
import {catalogRecord,discoverDetail,hasDiscoverToken,tmdb} from './discover.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const validKind=k=>{if(!['movie','tv'].includes(k))fail('Ungültiger Medientyp');return k};
const validId=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1||n>2147483647)fail('Ungültige TMDB-ID');return n};
const validSeason=v=>{const n=Number(v);if(!Number.isInteger(n)||n<0||n>999)fail('Ungültige Staffel');return n};
const titleText=(v,max=140)=>String(v||'').trim().slice(0,max);
function airDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?v:null}
function tvEpisode(v){
 if(!v||!Number.isInteger(v.episode_number)||v.episode_number<1||v.episode_number>9999)return null;
 return {episode:v.episode_number,title:titleText(v.name),airDate:airDate(v.air_date),overview:titleText(v.overview,700)};
}
async function tvmazeRequest(path,{fetcher=fetch}={}){
 // Path is constructed only from a valid TMDB-provided IMDB ID or numeric TVmaze ID.
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),9000);
 try{
  const res=await fetcher('https://api.tvmaze.com'+path,{headers:{accept:'application/json'},signal:controller.signal});
  if(res.status===404)return null;
  if(!res.ok)throw Error('TVmaze '+res.status);
  if(Number(res.headers.get('content-length')||0)>700000)throw Error('TVmaze response too large');
  return await res.json();
 }catch(e){if(e.name==='AbortError')throw fail('TVmaze Zeitüberschreitung',502);throw fail('TVmaze momentan nicht erreichbar',502)}
 finally{clearTimeout(timer)}
}
function providerInfo(payload){
 const region=payload?.results?.AT;
 if(!region)return {region:'AT',items:[],available:false};
 const chosen=new Map();
 for(const [type,list] of [['flatrate',region.flatrate],['free',region.free],['ads',region.ads],['rent',region.rent],['buy',region.buy]]){
  for(const p of Array.isArray(list)?list:[]){
   if(!Number.isSafeInteger(p.provider_id)||!titleText(p.provider_name))continue;
   const existing=chosen.get(p.provider_id);
   if(!existing)chosen.set(p.provider_id,{id:p.provider_id,name:titleText(p.provider_name,80),type});
  }
 }
 return {region:'AT',items:[...chosen.values()].slice(0,30),available:chosen.size>0};
}
export async function discoverMetadata({token=process.env.FORGECORE_TMDB_TOKEN,kind,id,fetcher=fetch,tvmazeFetch=fetch}={}){
 validKind(kind);id=validId(id);
 const base=await tmdb('/'+kind+'/'+id,{token,fetcher});
 const item=catalogRecord(base,kind);
 if(!item)fail('TMDB-Titel nicht gefunden',404);
 const providerData=await tmdb('/'+kind+'/'+id+'/watch/providers',{token,fetcher,params:{}});
 const result={...item,genres:(Array.isArray(base.genres)?base.genres:[]).map(g=>titleText(g.name,70)).filter(Boolean).slice(0,20),
  providers:providerInfo(providerData),seasons:[],nextEpisode:null,tvmaze:{matched:false,available:false,notice:null}};
 if(kind==='tv'){
  result.seasons=(Array.isArray(base.seasons)?base.seasons:[]).filter(s=>Number.isInteger(s.season_number)&&s.season_number>=0&&s.season_number<=999)
   .map(s=>({season:s.season_number,title:titleText(s.name)||'Staffel '+s.season_number,
    episodes:Number.isInteger(s.episode_count)?s.episode_count:null,airDate:airDate(s.air_date)})).slice(0,140);
  result.nextEpisode=base.next_episode_to_air?{season:base.next_episode_to_air.season_number,...tvEpisode(base.next_episode_to_air)}:null;
  // Use a confirmed TMDB->IMDb->TVmaze identity, never name-only fallback.
  try{
   const external=await tmdb('/tv/'+id+'/external_ids',{token,fetcher});
   const imdb=String(external.imdb_id||'');
   if(/^tt\d{5,12}$/.test(imdb)){
    const show=await tvmazeRequest('/lookup/shows?imdb='+encodeURIComponent(imdb),{fetcher:tvmazeFetch});
    if(show&&Number.isSafeInteger(show.id)){
     const schedule=await tvmazeRequest('/shows/'+show.id+'?embed[]=nextepisode',{fetcher:tvmazeFetch});
     const next=schedule?._embedded?.nextepisode;
     result.tvmaze={matched:true,available:true,notice:null};
     if(next&&Number.isInteger(next.season)&&Number.isInteger(next.number)&&next.season>=0&&next.number>=1)
      result.nextEpisode={season:next.season,episode:next.number,title:titleText(next.name),
       airDate:airDate(next.airdate),source:'TVmaze'};
    }else result.tvmaze.notice='Keine eindeutige TVmaze-ID gefunden';
   }else result.tvmaze.notice='Keine IMDb-ID für TVmaze-Abgleich vorhanden';
  }catch{result.tvmaze.notice='TVmaze derzeit nicht verfügbar; TMDB-Daten werden weiterhin angezeigt';}
 }
 return result;
}
export async function discoverSeason({token=process.env.FORGECORE_TMDB_TOKEN,id,season,fetcher=fetch}={}){
 id=validId(id);season=validSeason(season);
 const payload=await tmdb('/tv/'+id+'/season/'+season,{token,fetcher});
 const episodes=(Array.isArray(payload.episodes)?payload.episodes:[]).map(tvEpisode).filter(Boolean).slice(0,300);
 return {id,season,episodes,count:episodes.length,source:'TMDB',
  note:'TMDB-Folgenlisten können unvollständig sein. Fehlende TMDB-Einträge bedeuten nicht automatisch fehlende Medien.'};
}
export {validKind,validId,validSeason};
