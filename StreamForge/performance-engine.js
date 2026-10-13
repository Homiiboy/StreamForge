// Back-pressure on the network limiter when muxing or storage cannot drain buffers.
export function bufferAwareConcurrency(requested,bufferedBytes,byteBudget,{min=1}={}){
  const target=Math.max(min,Math.floor(Number(requested)||1));
  const budget=Math.max(1,Number(byteBudget)||1);
  const occupancy=Math.max(0,Number(bufferedBytes)||0)/budget;
  if(occupancy>=0.9)return Math.max(min,Math.ceil(target/4));
  if(occupancy>=0.75)return Math.max(min,Math.ceil(target/2));
  if(occupancy>=0.55)return Math.max(min,Math.ceil(target*0.75));
  return target;
}
export function performanceSignal({activeRequests=0,queuedRequests=0,bufferedBytes=0,bufferMaxBytes=1,downloadDone=0,muxDone=0}={}){
  const fill=Math.max(0,Number(bufferedBytes)||0)/Math.max(1,Number(bufferMaxBytes)||1);
  if(fill>=0.8||downloadDone>muxDone+20)return 'Muxing/Speicher';
  if((activeRequests+queuedRequests)>0&&fill<=0.1)return 'Netzwerk';
  return 'Ausgeglichen';
}
