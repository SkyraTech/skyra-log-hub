export type AdminCapability =
  | 'tenant.read'
  | 'tenant.update'
  | 'tenant.members.read'
  | 'tenant.members.manage'
  | 'projects.read'
  | 'projects.create'
  | 'projects.update'
  | 'projects.archive'
  | 'projects.members.manage'
  | 'logs.search'
  | 'logs.analytics'
  | 'ingestion.credentials.read'
  | 'ingestion.credentials.create'
  | 'ingestion.credentials.rotate'
  | 'ingestion.credentials.revoke'
  | 'quotas.read'
  | 'quotas.manage'
  | 'retention.read'
  | 'retention.manage'
  | 'audit.read';

export interface PermissionDefinition {
  code: AdminCapability;
  description: string;
}

export const ALL_CAPABILITIES: readonly AdminCapability[] = [
  'tenant.read',
  'tenant.update',
  'tenant.members.read',
  'tenant.members.manage',
  'projects.read',
  'projects.create',
  'projects.update',
  'projects.archive',
  'projects.members.manage',
  'logs.search',
  'logs.analytics',
  'ingestion.credentials.read',
  'ingestion.credentials.create',
  'ingestion.credentials.rotate',
  'ingestion.credentials.revoke',
  'quotas.read',
  'quotas.manage',
  'retention.read',
  'retention.manage',
  'audit.read',
] as const;
