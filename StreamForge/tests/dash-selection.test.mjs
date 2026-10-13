import assert from 'node:assert/strict';
import { parseDashDocument } from '../dash.js';
function element(localName, attributes={}, children=[]) {
  const attrs=Object.entries(attributes).map(([name,value])=>({name,value:String(value)}));
  return {
    localName,tagName:localName,attributes:attrs,children,
    getAttribute(name){return attributes[name]===undefined?null:String(attributes[name]);},
    getElementsByTagName(){return [];}
  };
}
const rep=(id,kind,height=0,bandwidth=500000)=>element('Representation',
  {id,bandwidth,...(height?{height}:{}),mimeType:kind==='video'?'video/mp4':'audio/mp4'},
  [element('SegmentTemplate',{timescale:1,duration:2,startNumber:1,initialization:'init-$RepresentationID$.mp4',media:'seg-$RepresentationID$-$Number$.m4s'})]);
const doc={documentElement:element('MPD',{mediaPresentationDuration:'PT4S'},[
  element('Period',{},[
    element('AdaptationSet',{contentType:'video'},[rep('v720','video',720),rep('v1080','video',1080)]),
    element('AdaptationSet',{contentType:'audio',lang:'de'},[rep('de','audio')]),
    element('AdaptationSet',{contentType:'audio',lang:'en'},[rep('en','audio')])
  ])
])};
const parsed=parseDashDocument(doc,'https://cdn.example/master.mpd',{videoId:'v720',audioId:'en'});
assert.equal(parsed.video.id,'v720');
assert.equal(parsed.audio.id,'en');
assert.equal(parsed.videoOptions.length,2);
assert.equal(parsed.audioOptions.length,2);
assert.equal(parsed.video.segments[0].url,'https://cdn.example/seg-v720-1.m4s');
assert.equal(parsed.audio.segments[0].url,'https://cdn.example/seg-en-1.m4s');
const fallback=parseDashDocument(doc,'https://cdn.example/master.mpd',{videoId:'missing',audioId:'missing'});
assert.equal(fallback.video.id,'v1080');
assert.equal(fallback.audio.id,'de');
console.log('DASH track selection tests passed');
