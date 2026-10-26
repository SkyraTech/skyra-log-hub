import { Module, Global } from '@nestjs/common';
import { QueryAuditService } from './query-audit.service.js';

@Global()
@Module({
  providers: [QueryAuditService],
  exports: [QueryAuditService],
})
export class AuditModule {}
