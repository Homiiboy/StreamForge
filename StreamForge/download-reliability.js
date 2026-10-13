// Fail closed rather than silently muxing missing/empty media segments.
export function validateSegmentPayload(bytes,{index=0,total=0,label='Segment'}={}){
  if(!(bytes instanceof Uint8Array) || bytes.byteLength===0)
    throw new Error(`${label} ${index}/${total}: leerer oder ungültiger Segmentinhalt`);
  if(bytes.byteLength>=5){
    const head=new TextDecoder().decode(bytes.subarray(0,Math.min(256,bytes.byteLength))).trimStart().toLowerCase();
    if(head.startsWith('<!doctype html')||head.startsWith('<html')||head.startsWith('<?xml'))
      throw new Error(`${label} ${index}/${total}: Server lieferte HTML/XML statt Mediensegment`);
  }
  return bytes;
}
export function validateDownloadProgress({written=0,total=0,done=0,expected=0}={}){
  if(total>0 && done!==total)throw new Error(`Download unvollständig: ${done}/${total} Segmente`);
  if(expected>0 && written<expected)throw new Error(`Temporäre Datei unvollständig: ${written}/${expected} Bytes`);
  if(total>0 && written<=0)throw new Error('Medienausgabe enthält keine Daten');
  return true;
}
