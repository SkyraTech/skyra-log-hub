import { LogSeverity } from '../severity-badge/severity-badge.component';

export interface LogTableRow {
  id: string;
  timestamp: string;
  severity: LogSeverity;
  service: string;
  environment?: string;
  action?: string;
  traceId?: string;
  message: string;
  attributes?: Record<string, unknown>;
  rawEvent?: unknown;
}

export type TableDensity = 'compact' | 'comfortable';

