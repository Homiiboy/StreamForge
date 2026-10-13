const te = new TextEncoder();

function u32(a, o) { return ((a[o] << 24) | (a[o+1] << 16) | (a[o+2] << 8) | a[o+3]) >>> 0; }
function setU32(a, o, v) { a[o]=(v>>>24)&255; a[o+1]=(v>>>16)&255; a[o+2]=(v>>>8)&255; a[o+3]=v&255; }
function u64(a, o) { return Number((BigInt(u32(a,o)) << 32n) | BigInt(u32(a,o+4))); }
function typeAt(a,o) { return String.fromCharCode(a[o],a[o+1],a[o+2],a[o+3]); }

export function boxes(a, start=0, end=a.length) {
  const out=[]; let p=start;
  while (p+8<=end) {
    let size=u32(a,p); const type=typeAt(a,p+4); let header=8;
    if (size===1) { if (p+16>end) break; size=u64(a,p+8); header=16; }
    else if (size===0) size=end-p;
    if (!Number.isFinite(size) || size<header || p+size>end) break;
    out.push({start:p,end:p+size,size,header,type,payload:p+header}); p+=size;
  }
  return out;
}
function childBoxes(a,b){ return boxes(a,b.payload,b.end); }
function sliceBox(a,b){ return a.slice(b.start,b.end); }
function concat(parts){ const n=parts.reduce((s,p)=>s+p.length,0), out=new Uint8Array(n); let o=0; for(const p of parts){out.set(p,o);o+=p.length;} return out; }
function makeBox(type,payload){ const out=new Uint8Array(8+payload.length); setU32(out,0,out.length); out.set(te.encode(type).slice(0,4),4); out.set(payload,8); return out; }
function findChild(a,b,type){ return childBoxes(a,b).find(x=>x.type===type)||null; }

function fullboxVersion(a,b){ return a[b.payload]||0; }
function trackIdFromTkhd(a,b){ const v=fullboxVersion(a,b); return u32(a,b.payload+(v===1?20:12)); }
function patchTkhd(a,b,id){ const v=fullboxVersion(a,b); setU32(a,b.payload+(v===1?20:12),id); }
function timescaleFromMdhd(a,b){ const v=fullboxVersion(a,b); return u32(a,b.payload+(v===1?20:12)); }
function handlerFromHdlr(a,b){ return typeAt(a,b.payload+8); }
function trackInfoFromTrak(trakBytes){
  const top=boxes(trakBytes)[0]; const tkhd=findChild(trakBytes,top,'tkhd'); const mdia=findChild(trakBytes,top,'mdia');
  if(!tkhd||!mdia) throw new Error('Ungültige fMP4-Trackstruktur.');
  const mdhd=findChild(trakBytes,mdia,'mdhd'), hdlr=findChild(trakBytes,mdia,'hdlr');
  if(!mdhd||!hdlr) throw new Error('Track-Metadaten fehlen.');
  return {id:trackIdFromTkhd(trakBytes,tkhd),timescale:timescaleFromMdhd(trakBytes,mdhd),handler:handlerFromHdlr(trakBytes,hdlr)};
}
function patchTrakId(trakBytes,newId){ const out=trakBytes.slice(); const top=boxes(out)[0]; const tkhd=findChild(out,top,'tkhd'); if(tkhd) patchTkhd(out,tkhd,newId); return out; }
function trexId(a,b){ return u32(a,b.payload+4); }
function patchTrexId(trexBytes,newId){ const out=trexBytes.slice(); const b=boxes(out)[0]; setU32(out,b.payload+4,newId); return out; }
function patchMvhdNextId(mvhdBytes,nextId){ const out=mvhdBytes.slice(); if(out.length>=12) setU32(out,out.length-4,nextId); return out; }

function initParts(data){
  const top=boxes(data); const ftyp=top.find(b=>b.type==='ftyp'); const moov=top.find(b=>b.type==='moov');
  if(!ftyp||!moov) throw new Error('fMP4-Initialisierung (ftyp/moov) fehlt.');
  const children=childBoxes(data,moov).map(b=>({type:b.type,bytes:sliceBox(data,b)}));
  const tracks=children.filter(x=>x.type==='trak').map(x=>({bytes:x.bytes,info:trackInfoFromTrak(x.bytes)}));
  return {ftyp:sliceBox(data,ftyp),moov,children,tracks};
}

export function mergeInitSegments(videoInit,audioInit){
  const v=initParts(videoInit), a=initParts(audioInit);
  const vt=v.tracks.find(t=>t.info.handler==='vide')||v.tracks[0];
  const at=a.tracks.find(t=>t.info.handler==='soun')||a.tracks[0];
  if(!vt||!at) throw new Error('Video- oder Audiotrack fehlt im fMP4-Initsegment.');
  const used=new Set(v.tracks.map(t=>t.info.id)); let newAudioId=at.info.id;
  if(used.has(newAudioId)){ newAudioId=Math.max(...used,0)+1; while(used.has(newAudioId)) newAudioId++; }
  const audioTrak=patchTrakId(at.bytes,newAudioId);

  const outChildren=[]; let insertedAudio=false; let mvexDone=false;
  for(const c of v.children){
    if(c.type==='mvhd'){ outChildren.push(patchMvhdNextId(c.bytes,Math.max(...used,newAudioId)+1)); continue; }
    if(c.type==='mvex'){
      const box=boxes(c.bytes)[0]; const ch=childBoxes(c.bytes,box).map(b=>sliceBox(c.bytes,b));
      const amvex=a.children.find(x=>x.type==='mvex');
      if(amvex){ const ab=boxes(amvex.bytes)[0]; for(const t of childBoxes(amvex.bytes,ab).filter(x=>x.type==='trex')){
        const tb=sliceBox(amvex.bytes,t); if(trexId(tb,boxes(tb)[0])===at.info.id) ch.push(patchTrexId(tb,newAudioId));
      }}
      outChildren.push(makeBox('mvex',concat(ch))); mvexDone=true; continue;
    }
    outChildren.push(c.bytes);
    if(c.type==='trak' && !insertedAudio){ /* insert after all existing tracks later */ }
  }
  const lastTrack=outChildren.map((x,i)=>boxes(x)[0]?.type==='trak'?i:-1).filter(i=>i>=0).pop();
  outChildren.splice((lastTrack??-1)+1,0,audioTrak); insertedAudio=true;
  if(!mvexDone){
    const amvex=a.children.find(x=>x.type==='mvex'); if(amvex){ const ab=boxes(amvex.bytes)[0]; const trex=[]; for(const t of childBoxes(amvex.bytes,ab).filter(x=>x.type==='trex')){ const tb=sliceBox(amvex.bytes,t); if(trexId(tb,boxes(tb)[0])===at.info.id) trex.push(patchTrexId(tb,newAudioId)); } if(trex.length) outChildren.push(makeBox('mvex',concat(trex))); }
  }
  return {bytes:concat([v.ftyp,makeBox('moov',concat(outChildren))]),videoTrackId:vt.info.id,audioTrackIdOld:at.info.id,audioTrackIdNew:newAudioId,videoTimescale:vt.info.timescale,audioTimescale:at.info.timescale};
}

function findTfhdAndTfdt(moofBytes){
  const top=boxes(moofBytes)[0]; const trafs=childBoxes(moofBytes,top).filter(x=>x.type==='traf');
  for(const traf of trafs){ const tfhd=findChild(moofBytes,traf,'tfhd'); const tfdt=findChild(moofBytes,traf,'tfdt'); if(tfhd) return {tfhd,tfdt}; }
  return {};
}
export function moofInfo(moofBytes,timescaleByTrack={}){
  const {tfhd,tfdt}=findTfhdAndTfdt(moofBytes); if(!tfhd) throw new Error('tfhd fehlt in fMP4-Fragment.');
  const trackId=u32(moofBytes,tfhd.payload+4); let decode=0;
  if(tfdt){ const v=fullboxVersion(moofBytes,tfdt); decode=v===1?u64(moofBytes,tfdt.payload+4):u32(moofBytes,tfdt.payload+4); }
  const scale=Number(timescaleByTrack[trackId]||1); return {trackId,decode,seconds:decode/scale};
}
export function patchMoof(moofBytes,trackMap={},sequence=null){
  const out=moofBytes.slice(); const top=boxes(out)[0]; const mfhd=findChild(out,top,'mfhd'); if(mfhd&&sequence!==null) setU32(out,mfhd.payload+4,sequence);
  for(const traf of childBoxes(out,top).filter(x=>x.type==='traf')){ const tfhd=findChild(out,traf,'tfhd'); if(tfhd){ const old=u32(out,tfhd.payload+4); if(trackMap[old]) setU32(out,tfhd.payload+4,trackMap[old]); }}
  return out;
}

function initAndFragmentsFromBuffer(data){
  const top=boxes(data); const ftyp=top.find(x=>x.type==='ftyp'), moov=top.find(x=>x.type==='moov'); if(!ftyp||!moov) throw new Error('fMP4 Init fehlt.');
  const init=concat([sliceBox(data,ftyp),sliceBox(data,moov)]); const fragments=[];
  for(let i=0;i<top.length;i++) if(top[i].type==='moof'){
    const mdat=top.slice(i+1).find(x=>x.type==='mdat'); if(!mdat) throw new Error('mdat fehlt nach moof.');
    fragments.push({moof:sliceBox(data,top[i]),mdat:sliceBox(data,mdat)});
  }
  return {init,fragments};
}

// Test-/Fallback-API für kleine Dateien. Der Browserpfad nutzt streamendes OPFS-Muxing.
export function muxFmp4Buffers(videoBytes,audioBytes){
  const v=initAndFragmentsFromBuffer(videoBytes), a=initAndFragmentsFromBuffer(audioBytes); const merged=mergeInitSegments(v.init,a.init);
  const entries=[];
  for(const f of v.fragments){ const inf=moofInfo(f.moof,{[merged.videoTrackId]:merged.videoTimescale}); entries.push({kind:'v',time:inf.seconds,...f}); }
  for(const f of a.fragments){ const inf=moofInfo(f.moof,{[merged.audioTrackIdOld]:merged.audioTimescale}); entries.push({kind:'a',time:inf.seconds,...f}); }
  entries.sort((x,y)=>x.time-y.time || (x.kind==='v'?-1:1)); let seq=1; const out=[merged.bytes];
  for(const e of entries){ out.push(patchMoof(e.moof,e.kind==='a'?{[merged.audioTrackIdOld]:merged.audioTrackIdNew}:{},seq++),e.mdat); }
  return concat(out);
}

async function readHeader(file,pos){ const b=new Uint8Array(await file.slice(pos,Math.min(pos+16,file.size)).arrayBuffer()); if(b.length<8) return null; let size=u32(b,0),header=8; const type=typeAt(b,4); if(size===1){ if(b.length<16)return null; size=u64(b,8);header=16;} else if(size===0) size=file.size-pos; if(size<header||pos+size>file.size)return null; return {start:pos,size,end:pos+size,header,type}; }
export async function indexFmp4File(file){
  const top=[]; let p=0; while(p+8<=file.size){ const h=await readHeader(file,p); if(!h) break; top.push(h); p=h.end; }
  const ftyp=top.find(x=>x.type==='ftyp'),moov=top.find(x=>x.type==='moov'); if(!ftyp||!moov) throw new Error('Die Spur ist kein fragmentiertes MP4 (ftyp/moov fehlt).');
  const init=new Uint8Array(await file.slice(ftyp.start,ftyp.end).arrayBuffer()); const moovBytes=new Uint8Array(await file.slice(moov.start,moov.end).arrayBuffer()); const initBytes=concat([init,moovBytes]);
  const info=initParts(initBytes); const track=info.tracks[0]?.info; if(!track) throw new Error('Kein Track im Initsegment.');
  const fragments=[];
  for(let i=0;i<top.length;i++) if(top[i].type==='moof'){
    let j=i+1; while(j<top.length && top[j].type!=='mdat' && top[j].type!=='moof') j++; if(j>=top.length||top[j].type!=='mdat') continue;
    const mb=new Uint8Array(await file.slice(top[i].start,top[i].end).arrayBuffer()); const inf=moofInfo(mb,{[track.id]:track.timescale}); fragments.push({moof:top[i],mdat:top[j],time:inf.seconds});
  }
  if(!fragments.length) throw new Error('Keine fMP4-Fragmente (moof/mdat) gefunden.');
  return {init:initBytes,track,fragments};
}

async function copySlice(file,start,end,writable,chunk=8*1024*1024){ for(let p=start;p<end;p+=chunk){ const b=new Uint8Array(await file.slice(p,Math.min(end,p+chunk)).arrayBuffer()); await writable.write(b); } }
export async function muxFmp4Files(videoFile,audioFile,writable,onProgress=()=>{}){
  const [vi,ai]=await Promise.all([indexFmp4File(videoFile),indexFmp4File(audioFile)]); if(vi.track.handler!=='vide'||ai.track.handler!=='soun') throw new Error('Erwartet wurden eine Video- und eine Audiospur.');
  const merged=mergeInitSegments(vi.init,ai.init); await writable.write(merged.bytes);
  const entries=[...vi.fragments.map(x=>({...x,kind:'v'})),...ai.fragments.map(x=>({...x,kind:'a'}))].sort((x,y)=>x.time-y.time || (x.kind==='v'?-1:1)); let seq=1,done=0;
  for(const e of entries){ const src=e.kind==='v'?videoFile:audioFile; let moof=new Uint8Array(await src.slice(e.moof.start,e.moof.end).arrayBuffer()); moof=patchMoof(moof,e.kind==='a'?{[merged.audioTrackIdOld]:merged.audioTrackIdNew}:{},seq++); await writable.write(moof); await copySlice(src,e.mdat.start,e.mdat.end,writable); done++; onProgress(done,entries.length); }
  return {fragments:entries.length};
}
