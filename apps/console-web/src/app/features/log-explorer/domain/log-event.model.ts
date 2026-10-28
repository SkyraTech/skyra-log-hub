import { CanonicalLogEvent } from '../../../core/http/api-client.port';
import { LogSeverity } from '../../../shared/ui/severity-badge/severity-badge.component';

export interface LogExplorerRow {
  /** Stable composite row identity ensuring unique trackBy key */
  readonly id: string;
  readonly rowId: string;
  readonly eventId: string;
  readonly timestamp: string;
  readonly severity: LogSeverity;
  readonly service: string;
  readonly environment: string;
  readonly action?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly message: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly rawEvent: CanonicalLogEvent;
}

export function mapCanonicalEventToRow(
  event: CanonicalLogEvent,
  index: number,
): LogExplorerRow {
  const timestamp = event['@timestamp'] || '';
  const service = event.service?.name || 'unknown';
  const environment = event.service?.environment || 'unknown';
  const eventId = event.event?.id || `idx_${index}`;
  const severity = (event.log?.level as LogSeverity) || 'info';
  const message = event.message || '';
  const tenantId = event.skyra?.tenant_id || '';
  const projectId = event.skyra?.project_id || '';
  const action = event.event?.action;
  const traceId = event.trace?.id;
  const spanId = event.span?.id;

  // Composite stable row identity prevents rendering glitches on duplicate event.ids or timestamps
  const rowId = `${timestamp}_${service}_${eventId}_${index}`;

  return {
    id: rowId,
    rowId,
    eventId,
    timestamp,
    severity,
    service,
    environment,
    action,
    traceId,
    spanId,
    message,
    tenantId,
    projectId,
    rawEvent: event,
  };
}
