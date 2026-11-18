import http from 'node:http';import crypto from 'node:crypto';
/** Test-only delaying proxy: every business response still comes from the actual Query Service. */
export async function queryFaultProxy(origin){
 const records=[];let mode=null;const pending=[];
 const server=http.createServer(async(req,res)=>{try{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>32768)throw Error('Test request bound');}let data;try{data=body?JSON.parse(body):null;}catch{}
 const match=['/query/v1/logs/search','/query/v1/logs/dashboard'].includes(req.url)&&mode&&(!mode.match||mode.match(data));const selected=match?mode:null;if(selected&&selected.once)mode=null;
 const upstream=await fetch(origin+req.url,{method:req.method,headers:{...(req.headers.authorization?{Authorization:req.headers.authorization}:{}),'Content-Type':'application/json'},...(body?{body}:{}),redirect:'error'});const text=await upstream.text();records.push({operation:req.url,status:upstream.status,cursor:!!data?.cursor,limit:data?.limit,sha256:crypto.createHash('sha256').update(body).digest('hex')});
 if(selected){if(selected.after)await selected.after(data);if(selected.hold)await new Promise(resolve=>pending.push(resolve));}
 if(!res.destroyed){res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')??'application/json'});res.end(text);}
 }catch{if(!res.destroyed){res.writeHead(503);res.end();}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {origin:'http://127.0.0.1:'+server.address().port,records,setMode:next=>{mode=next;},release:()=>{mode=null;for(const release of pending.splice(0))release();},untilHeld:async(n=1)=>{for(let i=0;i<300;i++){if(pending.length>=n)return;await new Promise(r=>setTimeout(r,20));}throw Error('Query hold timeout');},close:async()=>{mode=null;for(const release of pending.splice(0))release();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
