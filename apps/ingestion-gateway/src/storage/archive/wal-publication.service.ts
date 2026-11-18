import {Injectable,Logger,OnApplicationBootstrap,OnModuleDestroy} from '@nestjs/common';
import {WalJournalService} from '../wal/wal-journal.service.js';import {ArchiveWriterService} from './archive-writer.service.js';
/** Opt-in local publication worker. WAL remains authoritative; retries never rewrite published bytes. */
@Injectable()
export class WalPublicationService implements OnApplicationBootstrap,OnModuleDestroy {
 private timer?:ReturnType<typeof setInterval>;private pending?:Promise<void>;private stopped=false;private logger=new Logger(WalPublicationService.name);
 constructor(private wal:WalJournalService,private archive:ArchiveWriterService){}
 async onApplicationBootstrap(){if(process.env['INGESTION_PUBLISH_ARCHIVES']!=='true')return;if(!process.env['WAL_DIRECTORY']||!process.env['ARCHIVE_ROOT'])throw Error('Explicit publication storage paths required');await this.tick();this.timer=setInterval(()=>{void this.tick();},1000);this.timer.unref();}
 private async tick(){if(this.pending||this.stopped||!this.wal.getStatus().isReady)return;this.pending=(async()=>{for(const {frame,segment}of this.wal.readPublicationFrames())await this.archive.publishCommittedFrame(frame,segment);})().catch(()=>{this.logger.warn('Archive publication pending; committed WAL retained for retry');});try{await this.pending;}finally{this.pending=undefined;}}
 async onModuleDestroy(){this.stopped=true;if(this.timer)clearInterval(this.timer);await this.pending;}
}
