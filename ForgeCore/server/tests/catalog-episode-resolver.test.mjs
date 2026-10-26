import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveExactCatalogEpisodes} from '../src/catalog-episode-resolver.mjs';
const root='https://example.org/anime/stream/one-piece';
const season=root+'/staffel-1';
const episode=root+'/staffel-1/episode-49';
const misses=root+'/staffel-1/episode-48';
const catalog=[{kind:'catalog',mediaType:'series',siteId:'site-1',siteLabel:'Demo',url:root,title:'One Piece'}];
function fetchWith(htmls){
 const calls=[];
 const fetcher=async url=>{
  calls.push(url);
  if(!(url in htmls))throw Error('Unexpected request '+url);
  return {url,body:Buffer.from(htmls[url])};
 };
 return {calls,fetcher};
}
test('v1.7.1 exact episode is resolved through only the requested season',async()=>{
 const {calls,fetcher}=fetchWith({
  [root]:'<html><a href="'+root+'/staffel-2">Staffel 2</a><a href="'+season+'">Staffel 1</a></html>',
  [season]:'<html><a href="'+misses+'">Episode 48</a><a href="'+episode+'">Episode 49</a></html>',
 });
 const data=await resolveExactCatalogEpisodes(catalog,{season:1,episode:49},{fetcher});
 assert.deepEqual(calls,[root,season]);
 assert.equal(data.episodes.length,1);
 assert.equal(data.episodes[0].url,episode);
 assert.equal(data.episodes[0].siteId,'site-1');
 assert.equal(data.episodes[0].mediaType,'episode');
});
test('v1.7.1 never guesses episode URLs, follows unrelated series or visits other seasons',async()=>{
 const {calls,fetcher}=fetchWith({
  [root]:'<html><a href="'+season+'">Staffel 1</a><a href="https://example.org/anime/stream/other-series/staffel-1/episode-49">Episode 49</a></html>',
  [season]:'<html><a href="'+misses+'">Episode 48</a></html>',
 });
 const data=await resolveExactCatalogEpisodes(catalog,{season:1,episode:49},{fetcher});
 assert.equal(data.episodes.length,0);
 assert.deepEqual(calls,[root,season]);
});
test('v1.7.1 prevents external season navigation and rejects redirected catalogue responses',async()=>{
 const {calls,fetcher}=fetchWith({
  [root]:'<html><a href="https://evil.example/staffel-1">Staffel 1</a></html>',
 });
 const data=await resolveExactCatalogEpisodes(catalog,{season:1,episode:49},{fetcher});
 assert.equal(data.episodes.length,0);
 assert.deepEqual(calls,[root]);
 const redirect=await resolveExactCatalogEpisodes(catalog,{season:1,episode:49},{fetcher:async()=>({url:'https://elsewhere.example/anime/stream/one-piece',body:Buffer.from('<html></html>')})});
 assert.equal(redirect.episodes.length,0);
 assert.match(redirect.warnings[0].message,/Weiterleitung/);
});
test('v1.7.1 bounds pages per scan and rejects malformed requests',async()=>{
 const many=Array.from({length:20},(_,i)=>({...catalog[0],siteId:'site-'+i,url:root+'/'+i}));
 const checks=[];
 const fetcher=async url=>{checks.push(url);return{url,body:Buffer.from('<html></html>')}};
 const data=await resolveExactCatalogEpisodes(many,{season:1,episode:49},{fetcher});
 assert.equal(data.checked,4);
 assert.equal(checks.length,4);
 await assert.rejects(resolveExactCatalogEpisodes(catalog,{season:-1,episode:49},{fetcher}),/Ungültige/);
});


test('v1.8.2 explicit season/episode query links work on seriesstream-like URLs',async()=>{
 const root='https://catalog.example/serie/stream/one-piece';
 const s=root+'?staffel=1';
 const e=root+'?staffel=1&folge=49';
 const fetcher=async url=>({url,body:Buffer.from(url===root?
  '<a href="'+s+'">Staffel 1</a><a href="'+root+'?staffel=2">Staffel 2</a>':
  '<a href="'+root+'?staffel=1&folge=48">Folge 48</a><a href="'+e+'">Folge 49</a>')});
 const hits=[{kind:'catalog',mediaType:'series',siteId:'saved',siteLabel:'Serienkatalog',url:root,title:'One Piece'}];
 const got=await resolveExactCatalogEpisodes(hits,{season:1,episode:49},{fetcher});
 assert.equal(got.episodes.length,1,JSON.stringify(got));
 assert.equal(got.episodes[0].url,e);
 assert.equal(got.episodes[0].episode,49);
 const other=await resolveExactCatalogEpisodes(hits,{season:1,episode:50},{fetcher});
 assert.equal(other.episodes.length,0,'never fabricate a missing episode');
});
