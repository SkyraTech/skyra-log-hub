import { Injectable, Logger } from '@nestjs/common';
import { QueryConfigService } from '../../config/query-config.service.js';

export type QueryAuditEventType =
  | 'AUTH_FAILURE'
  | 'AUTH_SUCCESS'
  | 'FORBIDDEN_SCOPE_REJECTED'
  | 'CROSS_TENANT_REJECTED'
  | 'PATH_TRAVERSAL_ATTEMPT'
  | 'ARCHIVE_INTEGRITY_VIOLATION'
  | 'DISCOVERY_COMPLETED';

export interface QueryAuditEvent {
  eventType: QueryAuditEventType;
  principalId?: string;
  tenantId?: string;
  projects?: readonly string[];
  correlationId?: string;
  clientIp?: string;
  detail: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class QueryAuditService {
  private readonly logger = new Logger(QueryAuditService.name);

  constructor(private readonly config: QueryConfigService) {}

  public recordSecurityEvent(event: QueryAuditEvent): void {
    if (!this.config.enableAuditLogging) return;

    const payload = {
      timestamp: new Date().toISOString(),
      ...event,
    };

    if (
      event.eventType === 'AUTH_FAILURE' ||
      event.eventType === 'FORBIDDEN_SCOPE_REJECTED' ||
      event.eventType === 'CROSS_TENANT_REJECTED' ||
      event.eventType === 'PATH_TRAVERSAL_ATTEMPT' ||
      event.eventType === 'ARCHIVE_INTEGRITY_VIOLATION'
    ) {
      this.logger.warn(`[SECURITY_AUDIT] ${JSON.stringify(payload)}`);
    } else {
      this.logger.log(`[OPERATIONAL_AUDIT] ${JSON.stringify(payload)}`);
    }
  }
}
