// Bounded MPEG-TS sanity checks. Not a full decode or codec validation.
export function inspectTransportStreamWindow(bytes){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0);
  if(view.length<188*4)return {ok:false,code:'EXPORT_INVALID_TS',packets:0};
  let best={ratio:0,packets:0,errorPackets:0,offset:0};
  for(let offset=0;offset<188&&offset+188*4<=view.length;offset++){
    let packets=0,sync=0,errors=0;
    for(let i=offset;i+188<=view.length;i+=188){
      packets++;
      if(view[i]===0x47){
        sync++;
        if(view[i+1]&0x80)errors++;
      }
    }
    const ratio=packets?sync/packets:0;
    if(ratio>best.ratio || ratio===best.ratio&&packets>best.packets){
      best={ratio,packets,errorPackets:errors,offset};
    }
  }
  const ok=best.ratio>=0.985&&best.errorPackets===0;
  return {...best,ok,code:ok?'':best.errorPackets?'EXPORT_TS_TRANSPORT_ERROR':'EXPORT_INVALID_TS'};
}
export function inspectMediaSample(first,last,mime){
  if(mime!=='video/mp2t')return {ok:true,method:'container-header'};
  const head=inspectTransportStreamWindow(first);
  if(!head.ok)return {...head,where:'head'};
  if(last&&last.length>=188*4){
    const tail=inspectTransportStreamWindow(last);
    if(!tail.ok)return {...tail,where:'tail'};
    return {ok:true,method:'ts-window-sampling',headPackets:head.packets,tailPackets:tail.packets};
  }
  return {ok:true,method:'ts-window-sampling',headPackets:head.packets,tailPackets:0};
}
