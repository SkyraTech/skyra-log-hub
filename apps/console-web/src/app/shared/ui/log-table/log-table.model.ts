import { LogSeverity } from '../severity-badge/severity-badge.component';

export interface LogTableRow {
  id: string;
  timestamp: string;
  severity: LogSeverity;
  service: string;
  message: string;
  attributes?: Record<string, unknown>;
}

export type TableDensity = 'compact' | 'comfortable';
