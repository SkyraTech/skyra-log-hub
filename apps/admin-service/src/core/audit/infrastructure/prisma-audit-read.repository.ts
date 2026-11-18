import {Prisma} from '@prisma/client';
import type {auditQuery} from '../application/audit-query.js';
/** Reads the canonical append-only table. Every identifier is static and every value is parameterized. */
export class PrismaAuditReadRepository {
  private columns=Prisma.sql`id,actor_user_id,action,target_type,target_id,
    to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp,
    CASE WHEN octet_length(details::text)<=65536 THEN details::text ELSE '{}' END AS details,
    octet_length(details::text)>65536 AS metadata_omitted`;
  async list(tx:Prisma.TransactionClient,tenant:string,q:ReturnType<typeof auditQuery>,anchor:string,last?:{timestamp:string;id:string}){
    const where=[Prisma.sql`tenant_id=${tenant}::uuid`,Prisma.sql`created_at<=${anchor}::timestamptz`];
    if(q.action)where.push(Prisma.sql`action=${q.action}`);
    if(q.correlationId)where.push(Prisma.sql`details->>'correlationId'=${q.correlationId}`);
    if(q.actorId)where.push(Prisma.sql`actor_user_id=${q.actorId}::uuid`);
    if(q.resourceType)where.push(Prisma.sql`target_type=${q.resourceType}`);
    if(q.resourceId)where.push(Prisma.sql`target_id=${q.resourceId}`);
    if(q.projectId)where.push(Prisma.sql`((target_type IN ('project','quota') AND target_id=${q.projectId}) OR (target_type='credential' AND details->>'projectId'=${q.projectId}))`);
    if(q.start)where.push(Prisma.sql`created_at>=${q.start}::timestamptz AND created_at<${q.end}::timestamptz`);
    if(last)where.push(Prisma.sql`(created_at,id)<(${last.timestamp}::timestamptz,${last.id}::uuid)`);
    return tx.$queryRaw<Record<string,any>[]>(Prisma.sql`SELECT ${this.columns} FROM public.admin_audit_events WHERE ${Prisma.join(where,' AND ')} ORDER BY created_at DESC,id DESC LIMIT ${Number(q.limit)+1}`);
  }
  async read(tx:Prisma.TransactionClient,tenant:string,id:string){return (await tx.$queryRaw<Record<string,any>[]>(Prisma.sql`SELECT ${this.columns} FROM public.admin_audit_events WHERE tenant_id=${tenant}::uuid AND id=${id}::uuid`))[0];}
  async anchor(tx:Prisma.TransactionClient){return (await tx.$queryRaw<{anchor:string}[]>`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS anchor`)[0]!.anchor;}
}
