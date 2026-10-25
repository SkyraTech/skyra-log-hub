export interface TenantEntity {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DECOMMISSIONED';
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectEntity {
  id: string;
  tenantId: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}

export interface IngestionCredentialEntity {
  id: string;
  tenantId: string;
  keyHash: string;
  keyPrefix: string;
  description: string;
  allowedProjects: string[];
  allowedEnvironments: string[];
  rateLimitPerMin: number;
  createdAt: Date;
  expiresAt: Date;
  isRevoked: boolean;
  lastUsedAt: Date | null;
}

export interface ProjectQuotaEntity {
  id: string;
  tenantId: string;
  projectId: string;
  maxBatchSize: number;
  maxPayloadBytes: number;
  maxEventsPerSec: number;
  createdAt: Date;
  updatedAt: Date;
}
