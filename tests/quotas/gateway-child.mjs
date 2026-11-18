import {AsyncLocalStorage} from 'node:async_hooks';
const timing=new AsyncLocalStorage();
// Isolated process test fixture. Production main.ts never imports this file.
import {createRequire} from 'node:module';import path from 'node:path';import {root,testEnvironment,readState} from '../../scripts/isolated-postgres.mjs';
import {connectIsolatedIngestionRuntimeClient} from '../../scripts/lib/isolated-target.mjs';
const checked=await connectIsolatedIngestionRuntimeClient(process.env.DATABASE_URL,testEnvironment(readState()));await checked.end();
const require=createRequire(path.join(root,'apps/ingestion-gateway/package.json'));
const {Test}=require('@nestjs/testing'),{FastifyAdapter}=require('@nestjs/platform-fastify');
const {AppModule}=await import('../../apps/ingestion-gateway/dist/app.module.js');
const {QuotaAccountingService}=await import('../../apps/ingestion-gateway/dist/storage/quota-accounting.service.js');
const {WalJournalService}=await import('../../apps/ingestion-gateway/dist/storage/wal/wal-journal.service.js');
const {HttpExceptionFilter}=await import('../../apps/ingestion-gateway/dist/common/filters/http-exception.filter.js');
let now=process.env.FIXTURE_NOW;
process.on('message',m=>{if(m.clock){now=m.clock;process.send({clock:now});}});
const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(QuotaAccountingService).useFactory({inject:[WalJournalService],factory:wal=>{if(process.env.FIXTURE_METRICS==='true'){const append=wal.appendBatch.bind(wal);wal.appendBatch=async(...args)=>{const start=performance.now();try{return await append(...args);}finally{const m=timing.getStore();if(m)m.walAppendMs=performance.now()-start;}};}if(process.env.FIXTURE_THROW==='wal-append'){const append=wal.appendBatch.bind(wal);wal.appendBatch=async(...args)=>{await append(...args);throw Error('Isolated ambiguous fsync acknowledgement');};}const meter=new QuotaAccountingService(wal,()=>now?new Date(now):new Date(),async stage=>{
  const m=timing.getStore();if(m)m[stage]=performance.now()-m.started;
  if(stage===process.env.FIXTURE_PAUSE){process.send({fault:stage});await new Promise(()=>{});}
  if(stage===process.env.FIXTURE_THROW)throw Error('Isolated accounting fault');
});if(process.env.FIXTURE_METRICS==='true'){const admit=meter.admit.bind(meter);meter.admit=(...args)=>timing.run({started:performance.now()},async()=>{try{return await admit(...args);}finally{const m=timing.getStore();process.send({metrics:{batchId:args[0].batchId,tenantId:args[0].tenantId,projectId:args[0].projectId,totalMs:performance.now()-m.started,reservationMs:m.reserved,walAppendMs:m.walAppendMs,finalizationMs:m['finalized-before-commit']-m['wal-durable']}});}});}return meter;}}).compile();
const app=module.createNestApplication(new FastifyAdapter({bodyLimit:6*1024*1024}));app.useGlobalFilters(new HttpExceptionFilter());await app.listen(0,'127.0.0.1');
process.send({ready:app.getUrl?await app.getUrl():app.getHttpServer().address()});
process.on('message',async m=>{if(m.stop){await app.close();process.exit(0);}});
