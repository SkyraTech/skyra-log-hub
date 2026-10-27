export interface TenantSummary {
  id: string;
  code: string;
  name: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
}

export type TimeRangePreset = 
  | '15m'
  | '1h'
  | '4h'
  | '24h'
  | '7d'
  | '30d'
  | 'custom';

export interface TimeRangeBoundary {
  preset: TimeRangePreset;
  startIso: string;
  endIso: string;
}
