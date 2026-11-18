import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import type {WalFrame} from '../storage.interface.js';
import type {IArchiveSegmentRepository} from '../../metadata/repositories/archive-segment.repository.interface.js';

/** Deterministic publication from committed WAL; manifest + catalog form the query-visible boundary. */
export async function publishWalFrame(root:string,repo:IArchiveSegmentRepository,frame:WalFrame,journalSegment:string){
  const groups=new Map<string,any[]>();
  for(const original of JSON.parse(frame.payload.toString('utf8'))){
    const event={...original,skyra:{...original.skyra,tenant_id:frame.tenantId}};
    const parts=[frame.tenantId,event.skyra.project_id,event.service.environment,event.service.name,event['@timestamp'].slice(0,10)];
    if(parts.some(p=>typeof p!=='string'||!p||!/^([a-z0-9]+(-[a-z0-9]+)*)$/.test(p)))throw Error('Unsafe archive partition');
    const key=parts.join('/');groups.set(key,[...(groups.get(key)??[]),event]);
  }
  for(const [partition,events]of groups){
    const [tenantId,projectId,environment,serviceName,date]=partition.split('/') as [string,string,string,string,string];
    const directory=path.resolve(root,partition),base=path.resolve(root);if(!directory.startsWith(base+path.sep))throw Error('Archive root escape');
    fs.mkdirSync(base,{recursive:true});let cursor=base;for(const part of partition.split('/')){if(fs.lstatSync(cursor).isSymbolicLink())throw Error('Redirected archive path');cursor=path.join(cursor,part);if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('Redirected archive partition');if(!fs.existsSync(cursor))fs.mkdirSync(cursor);}
    const filename=`batch-${frame.batchId}.jsonl`,bytes=Buffer.from(events.map(e=>JSON.stringify(e)).join('\n')+'\n'),checksum=crypto.createHash('sha256').update(bytes).digest('hex');
    const timestamps=events.map(e=>e['@timestamp']).sort();
    const existing=await repo.findSegment(tenantId,projectId,environment,serviceName,date,filename);
    if(existing){if(existing.sha256Checksum!==checksum||!fs.existsSync(path.join(directory,filename))||!fs.readFileSync(path.join(directory,filename)).equals(bytes))throw Error('Published archive differs from committed WAL');continue;}
    const publish=(name:string,data:Buffer)=>{const target=path.join(directory,name);if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink()||!fs.readFileSync(target).equals(data))throw Error('Archive publication collision');return;}const tmp=target+'.'+crypto.randomUUID()+'.tmp',fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,target);};
    publish(filename,bytes);
    const manifest={manifest_version:'1.0',finalized_at:fs.statSync(path.join(directory,filename)).mtime.toISOString(),writer_instance_id:'wal-publisher',tenant_id:tenantId,project_id:projectId,environment,service_name:serviceName,date,segment_filename:filename,record_count:events.length,byte_size:bytes.length,sha256_checksum:checksum,first_event_timestamp:timestamps[0],last_event_timestamp:timestamps.at(-1),journal_commit_range:{segment_id:journalSegment,start_offset:frame.offset,end_offset:frame.offset+frame.frameLength}};
    publish(filename.replace('.jsonl','.manifest.json'),Buffer.from(JSON.stringify(manifest)));
    await repo.saveSegment({id:crypto.randomUUID(),tenantId,projectId,environment,serviceName,date,segmentFilename:filename,recordCount:events.length,byteSize:bytes.length,sha256Checksum:checksum,firstEventTimestamp:new Date(timestamps[0]),lastEventTimestamp:new Date(timestamps.at(-1)),finalizedAt:new Date(),writerInstanceId:'wal-publisher',journalSegmentId:journalSegment,journalStartOffset:frame.offset,journalEndOffset:frame.offset+frame.frameLength});
  }
}
