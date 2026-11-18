import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {root} from '../isolated-postgres.mjs';import {verifyAuditMigration} from './audit-migration-integrity.mjs';
const artifacts={
 '20261116010000_dev016_dashboard_preferences':'docs/admin/migrations/DEV-016-001/migration.sql',
 '20261116000000_dev015_saved_searches':'docs/admin/migrations/DEV-015-001/migration.sql',
 '20261024000000_init_metadata':'apps/ingestion-gateway/prisma/migrations/20261024000000_init_metadata/migration.sql',
 '20261028000000_admin_iam_foundation':'docs/admin/migrations/ADMIN-002/migration.sql',
 '20261103000000_feature001a_audit_integrity':'docs/admin/migrations/FEATURE-001A-001/migration.sql',
 '20261103010000_feature001b_tenant_consistency':'docs/admin/migrations/FEATURE-001B-001/migration.sql',
 '20261104000000_feature002_membership_integrity':'docs/admin/migrations/FEATURE-002-001/migration.sql',
 '20261104010000_feature003_projects':'docs/admin/migrations/FEATURE-003-001/migration.sql',
 '20261105000000_feature004_credentials':'docs/admin/migrations/FEATURE-004-001/migration.sql',
 '20261106000000_feature008_quotas':'docs/admin/migrations/FEATURE-008-001/migration.sql',
 '20261106010000_feature008_lock_authority':'docs/admin/migrations/FEATURE-008-003/migration.sql',
 '20261110000000_dev013_sessions':'docs/admin/migrations/DEV-013-001/migration.sql',
 '20261109000000_feature009_audit_read':'docs/admin/migrations/FEATURE-009-001/migration.sql'
};
export async function verifyIntegratedMigrations(client){
 const rows=(await client.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name')).rows;
 if(rows.length!==Object.keys(artifacts).length-(rows.some(r=>r.migration_name==='20261116010000_dev016_dashboard_preferences')?0:1)-(rows.some(r=>r.migration_name==='20261110000000_dev013_sessions')?0:1)-(rows.some(r=>r.migration_name==='20261116000000_dev015_saved_searches')?0:1))throw Error('Integrated migration count mismatch');
 for(const row of rows){const artifact=artifacts[row.migration_name];if(!artifact||!row.finished_at||row.rolled_back_at||crypto.createHash('sha256').update(fs.readFileSync(path.join(root,artifact))).digest('hex')!==row.checksum)throw Error('Integrated migration artifact/ledger mismatch');}
 if(new Set(rows.map(r=>r.migration_name)).size!==rows.length)throw Error('Duplicate migration identity');
 await verifyAuditMigration(client);
 return rows.map(({migration_name,checksum})=>({migration_name,checksum,artifact:artifacts[migration_name]}));
}
