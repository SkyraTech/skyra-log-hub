import http from'node:http';
/** Test-only transport faults around the actual Admin. No fabricated audit or usage response. */
export async function adminFaultProxy(){
 let target,mode={},held=[];const server=http.createServer(async(req,res)=>{const controller=new AbortController();res.once('close',()=>{if(!res.writableFinished)controller.abort();});try{
  if(!target)throw Error('Admin target not ready');const chunks=[];for await(const c of req)chunks.push(c);const upstream=await fetch(target+req.url,{method:req.method,headers:{authorization:req.headers.authorization??'','content-type':'application/json',...(req.headers['if-match']?{'if-match':req.headers['if-match']}:{})},...(req.method==='GET'?{}:{body:Buffer.concat(chunks)}),signal:controller.signal,redirect:'error'}),body=Buffer.from(await upstream.arrayBuffer());
  const isAudit=req.url.includes('/audit-events?');if(isAudit&&mode.hold){await new Promise(resolve=>{const entry={resolve};held.push(entry);controller.signal.addEventListener('abort',resolve,{once:true});});}
  if(controller.signal.aborted)return;res.writeHead(upstream.status,{'content-type':'application/json',...(upstream.headers.get('etag')?{etag:upstream.headers.get('etag')}:{})});res.end(body);
 }catch{if(!res.destroyed){res.writeHead(503);res.end('{}');}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const release=()=>{mode={};for(const item of held)item.resolve();held=[];};return {origin:'http://127.0.0.1:'+server.address().port,setTarget:v=>{const u=new URL(v);if(u.hostname!=='127.0.0.1'||u.protocol!=='http:')throw Error('Nonlocal Admin');target=v;},hold:()=>{mode={hold:true};held=[];},untilHeld:async(n=1)=>{for(let i=0;i<200;i++){if(held.length>=n)return;await new Promise(r=>setTimeout(r,20));}throw Error('Actual Admin page was not held');},release,stop:async()=>{release();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
