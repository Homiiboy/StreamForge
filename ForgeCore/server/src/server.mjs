import http from 'node:http';

export const APP_NAME='ForgeCore';
export const APP_VERSION='0.1.0';

export function handleRequest(req,res){
  const path=new URL(req.url||'/', 'http://localhost').pathname;
  const common={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
  const respond=(code,body)=>{res.writeHead(code,common);res.end(JSON.stringify(body));};
  if(req.method!=='GET')return respond(405,{error:'method_not_allowed'});
  if(path==='/api/health')return respond(200,{ok:true,service:APP_NAME,version:APP_VERSION});
  if(path==='/api/status')return respond(200,{
    service:APP_NAME,version:APP_VERSION,phase:'foundation',
    capabilities:{health:true,mediaProjects:false,sourceAdapters:false,downloads:false,jellyfin:false}
  });
  return respond(404,{error:'not_found'});
}

export function createServer(){return http.createServer(handleRequest);}

if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  const port=Number(process.env.FORGECORE_PORT||8787);
  const host=process.env.FORGECORE_HOST||'127.0.0.1';
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid FORGECORE_PORT');
  createServer().listen(port,host,()=>{process.stdout.write('ForgeCore listening on '+host+':'+port+'\\n');});
}
