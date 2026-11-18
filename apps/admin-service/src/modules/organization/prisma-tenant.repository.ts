import type { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
export class PrismaTenantRepository {
  async read(transaction: Prisma.TransactionClient, tenantId: string) {
    const tenant = await transaction.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Organization not found.');
    const versions = await transaction.$queryRaw<Array<{ version: string }>>`SELECT (extract(epoch FROM updated_at)*1000000)::bigint::text AS version FROM tenants WHERE id=${tenantId}::uuid`;
    return { tenant, etag: `"o${tenantId}:${versions[0]!.version}"` };
  }
  async lock(transaction: Prisma.TransactionClient, tenantId: string) {
    const rows = await transaction.$queryRaw<Array<{ name: string; status: string }>>`SELECT name,status FROM tenants WHERE id=${tenantId}::uuid FOR UPDATE`;
    if (!rows[0]) throw new NotFoundException('Organization not found.');
    return rows[0];
  }
  updateName(transaction: Prisma.TransactionClient, tenantId: string, name: string, version: string) {
    return transaction.$executeRaw`UPDATE tenants SET name=${name}, updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond')
      WHERE id=${tenantId}::uuid AND (extract(epoch FROM updated_at)*1000000)::bigint=${version}::bigint`;
  }
}
