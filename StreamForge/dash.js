export function parseIsoDuration(raw='') {
  const m=String(raw).match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if(!m) return 0; return Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0);
}
function children(el,name){ return [...(el?.children||[])].filter(x=>String(x.localName||x.tagName).split(':').pop()===name); }
function child(el,name){ return children(el,name)[0]||null; }
function attr(el,name){ return el?.getAttribute?.(name) ?? ''; }
function baseFrom(el,parent){ const b=child(el,'BaseURL'); const raw=String(b?.textContent||'').trim(); if(!raw)return parent; try{return new URL(raw,parent).href;}catch{return parent;} }
function copyAttrs(el){ const o={}; for(const a of [...(el?.attributes||[])]) o[a.name]=a.value; return o; }
function directTemplate(el){ return child(el,'SegmentTemplate'); }
function mergedTemplate(period,adapt,rep){
  const chain=[directTemplate(period),directTemplate(adapt),directTemplate(rep)].filter(Boolean); if(!chain.length)return null;
  const attrs={}; let timeline=null; for(const x of chain){ Object.assign(attrs,copyAttrs(x)); if(child(x,'SegmentTimeline')) timeline=child(x,'SegmentTimeline'); }
  return {attrs,timeline};
}
function closestSegmentList(period,adapt,rep){ return child(rep,'SegmentList')||child(adapt,'SegmentList')||child(period,'SegmentList')||null; }
function replaceTemplate(tpl,values){
  return String(tpl||'').replace(/\$\$/g,'\0').replace(/\$(RepresentationID|Bandwidth|Number|Time)(?:%0(\d+)d)?\$/g,(_,key,pad)=>{
    let v=values[key]??''; if(pad&&v!==''&&Number.isFinite(Number(v)))v=String(Math.trunc(Number(v))).padStart(Number(pad),'0'); return String(v);
  }).replace(/\0/g,'$');
}
function rangeObj(raw){ const m=String(raw||'').match(/^(\d+)-(\d+)$/); return m?{start:Number(m[1]),end:Number(m[2]),length:Number(m[2])-Number(m[1])+1}:null; }
function drmPresent(root){
  const cps=[...(root?.getElementsByTagName?.('*')||[])].filter(x=>String(x.localName||x.tagName).split(':').pop()==='ContentProtection');
  return cps.some(x=>{ const scheme=String(attr(x,'schemeIdUri')).toLowerCase(),value=String(attr(x,'value')).toLowerCase(); const xml=String(x.outerHTML||'').toLowerCase(); return /widevine|playready|fairplay|clearkey|edef8ba9|9a04f079|e2719d58|cenc:pssh|default_kid/.test(scheme+' '+value+' '+xml)||(/mp4protection/.test(scheme)&&/cenc|cbcs|cbc1|cens/.test(value+' '+xml)); });
}
function repKind(rep,adapt){ const ct=attr(rep,'contentType')||attr(adapt,'contentType'); const mime=attr(rep,'mimeType')||attr(adapt,'mimeType'); if(ct)return ct.toLowerCase(); if(/^video\//i.test(mime))return'video'; if(/^audio\//i.test(mime))return'audio'; if(attr(rep,'height')||attr(rep,'width'))return'video'; return''; }
function representation(period,adapt,rep,rootBase){
  let base=baseFrom(period,rootBase); base=baseFrom(adapt,base); base=baseFrom(rep,base);
  return {element:rep,adapt,period,id:attr(rep,'id'),kind:repKind(rep,adapt),mimeType:attr(rep,'mimeType')||attr(adapt,'mimeType'),codecs:attr(rep,'codecs')||attr(adapt,'codecs'),width:Number(attr(rep,'width')||0),height:Number(attr(rep,'height')||0),bandwidth:Number(attr(rep,'bandwidth')||0),audioSamplingRate:Number(attr(rep,'audioSamplingRate')||attr(adapt,'audioSamplingRate')||0),lang:attr(adapt,'lang')||attr(rep,'lang')||'',base};
}
function periodDuration(period,mpd){ return parseIsoDuration(attr(period,'duration'))||parseIsoDuration(attr(mpd,'mediaPresentationDuration'))||0; }
function buildFromSegmentList(r, list){
  const initEl=child(list,'Initialization'); const initUrl=initEl?new URL(attr(initEl,'sourceURL')||'',r.base).href:''; const initRange=rangeObj(attr(initEl,'range'));
  const segments=children(list,'SegmentURL').map(x=>({url:new URL(attr(x,'media')||'',r.base).href,range:rangeObj(attr(x,'mediaRange'))})).filter(x=>x.url);
  return {init:initUrl?{url:initUrl,range:initRange}:null,segments};
}
function expandTimeline(timeline, attrs, values, base, durationSeconds){
  const timescale=Number(attrs.timescale||1),startNumber=Number(attrs.startNumber||1); const out=[]; const ss=children(timeline,'S'); let current=0,number=startNumber;
  for(let i=0;i<ss.length;i++){
    const s=ss[i],d=Number(attr(s,'d')||0); if(!d)continue; if(attr(s,'t')!=='')current=Number(attr(s,'t')); let repeat=Number(attr(s,'r')||0);
    if(repeat<0){ const nextT=i+1<ss.length&&attr(ss[i+1],'t')!==''?Number(attr(ss[i+1],'t')):null; if(nextT!==null)repeat=Math.max(0,Math.ceil((nextT-current)/d)-1); else if(durationSeconds)repeat=Math.max(0,Math.ceil((durationSeconds*timescale-current)/d)-1); else repeat=0; }
    for(let k=0;k<=repeat;k++){ const media=replaceTemplate(attrs.media,{...values,Number:number,Time:current}); out.push({url:new URL(media,base).href,range:null}); current+=d; number++; if(out.length>30000)throw new Error('DASH-Manifest enthält zu viele Segmente.'); }
  }
  return out;
}
function buildFromTemplate(r, templ, durSec){
  const a=templ.attrs,values={RepresentationID:r.id,Bandwidth:r.bandwidth}; const initRaw=replaceTemplate(a.initialization,{...values,Number:Number(a.startNumber||1),Time:0}); const init=initRaw?{url:new URL(initRaw,r.base).href,range:null}:null; let segments=[];
  if(templ.timeline) segments=expandTimeline(templ.timeline,a,values,r.base,durSec);
  else if(a.media&&a.duration&&durSec){ const timescale=Number(a.timescale||1),segDur=Number(a.duration),start=Number(a.startNumber||1),count=Math.ceil(durSec*timescale/segDur); for(let i=0;i<count;i++){ const n=start+i,t=i*segDur; segments.push({url:new URL(replaceTemplate(a.media,{...values,Number:n,Time:t}),r.base).href,range:null}); } }
  return {init,segments};
}
function buildTrack(r,mpd){
  const list=closestSegmentList(r.period,r.adapt,r.element); if(list){ const x=buildFromSegmentList(r,list); return {...r,...x}; }
  const templ=mergedTemplate(r.period,r.adapt,r.element); if(templ){ const x=buildFromTemplate(r,templ,periodDuration(r.period,mpd)); return {...r,...x}; }
  if(r.base&&/\.(?:mp4|m4a|m4v|webm)(?:$|[?#])/i.test(r.base)) return {...r,init:null,segments:[{url:r.base,range:null}],wholeFile:true};
  throw new Error(`DASH-${r.kind||'Track'} ${r.id||''}: SegmentTemplate/SegmentList wird nicht unterstützt.`);
}
export function parseDashDocument(doc, manifestUrl, selection={}){
  const mpd=doc?.documentElement; if(!mpd||String(mpd.localName||mpd.tagName).split(':').pop()!=='MPD')throw new Error('Ungültiges DASH-MPD.'); if(drmPresent(mpd))throw new Error('Verschlüsseltes/DRM-geschütztes DASH wird nicht verarbeitet.');
  const rootBase=baseFrom(mpd,manifestUrl); const periods=children(mpd,'Period');
  for(const p of periods){
    const reps=[]; for(const a of children(p,'AdaptationSet')) for(const r of children(a,'Representation')) reps.push(representation(p,a,r,rootBase));
    const videos=reps.filter(x=>x.kind==='video'&&/mp4|iso|video/i.test(x.mimeType||'video/mp4')).sort((a,b)=>(b.height-a.height)||(b.bandwidth-a.bandwidth));
    const audios=reps.filter(x=>x.kind==='audio'&&/mp4|iso|audio/i.test(x.mimeType||'audio/mp4')).sort((a,b)=>b.bandwidth-a.bandwidth);
    if(videos.length&&audios.length){ const videoOptions=videos.map(v=>({id:v.id,height:v.height,width:v.width,bandwidth:v.bandwidth,codecs:v.codecs}));
      const audioOptions=audios.map(a=>({id:a.id,language:a.lang,bandwidth:a.bandwidth,codecs:a.codecs}));
      const chosenVideo=videos.find(v=>v.id&&v.id===selection.videoId)||videos[0];
      const chosenAudio=audios.find(a=>a.id&&a.id===selection.audioId)||audios[0];
      const video=buildTrack(chosenVideo,mpd),audio=buildTrack(chosenAudio,mpd);
      return {video,audio,duration:periodDuration(p,mpd),videoOptionsCount:videos.length,audioOptionsCount:audios.length,videoOptions,audioOptions}; }
  }
  throw new Error('Keine gemeinsame unterstützte fMP4-DASH-Video-/Audioperiode gefunden.');
}
export function parseDashManifest(text,manifestUrl,selection={}){ const doc=new DOMParser().parseFromString(String(text||''),'application/xml'); if(doc.querySelector?.('parsererror'))throw new Error('DASH-MPD konnte nicht gelesen werden.'); return parseDashDocument(doc,manifestUrl,selection); }
