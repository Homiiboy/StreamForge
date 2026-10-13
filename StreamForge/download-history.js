// Compact local history: terminal-only entries, bounded and free of source URLs/tokens.
export const HISTORY_KEY='sf_history_v173';
export const HISTORY_LIMIT=60;
export const TERMINAL_STATES=new Set(['complete','error','export_error','cancelled']);
export function sanitizeHistoryEntry(input={}){
  if(!TERMINAL_STATES.has(input.state))return null;
  return {id:String(input.id||'').slice(0,120),title:String(input.title||'Medienstream').slice(0,140),
    kind:['hls','dash','media'].includes(input.kind)?input.kind:'media',
    state:input.state, message:String(input.message||'').slice(0,350),
    time:Number.isFinite(input.time)?input.time:Date.now()};
}
export function mergeHistory(entries=[],incoming){
  const entry=sanitizeHistoryEntry(incoming);
  const list=Array.isArray(entries)?entries.filter(x=>sanitizeHistoryEntry(x)):[]; 
  if(!entry)return list.slice(0,HISTORY_LIMIT);
  return [entry,...list.filter(x=>!(x.id===entry.id&&x.state===entry.state&&Math.abs(x.time-entry.time)<3000))].slice(0,HISTORY_LIMIT);
}
export class HistoryStore {
  constructor(storage){this.storage=storage;this.lock=Promise.resolve();}
  add(entry){
    const run=async()=>{const data=await this.storage.get(HISTORY_KEY);
      const merged=mergeHistory(data[HISTORY_KEY],entry);
      await this.storage.set({[HISTORY_KEY]:merged});return merged;};
    const next=this.lock.catch(()=>{}).then(run);this.lock=next;return next;
  }
}
