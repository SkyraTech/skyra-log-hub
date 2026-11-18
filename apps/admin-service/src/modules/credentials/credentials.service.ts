import {Injectable,BadRequestException,ConflictException,NotFoundException,HttpException} from '@nestjs/common';
import {randomBytes,randomUUID,createHash} from 'node:crypto';import type {Prisma} from '@prisma/client';
import {AdminConfigService} from '../../core/config/admin-config.service.js';import {adminPrisma} from '../../core/database/admin-prisma.js';import type {TrustedPrincipal} from '../../core/security/trusted-assertion.guard.js';import {ProjectsService} from '../projects/projects.service.js';import {PrismaAuditRepository} from '../../core/audit/infrastructure/prisma-audit.repository.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const environments=['production','staging','development','test','local'];
// Never SELECT the verifier with the management runtime, including RETURNING.
const safeSelect={id:true,tenantId:true,projectId:true,createdBy:true,keyPrefix:true,description:true,allowedProjects:true,allowedEnvironments:true,rateLimitPerMin:true,createdAt:true,expiresAt:true,isRevoked:true,revokedAt:true,rotatedFromId:true,issuanceRequestId:true,updatedAt:true} satisfies Prisma.IngestionCredentialSelect;
export function credentialInput(raw:unknown,projectId:string){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Invalid credential request.');const d=raw as Record<string,unknown>;
  if(Object.keys(d).some(k=>!['description','allowedProjects','allowedEnvironments','rateLimitPerMin','expiresInDays'].includes(k))||typeof d.description!=='string')throw new BadRequestException('Unsupported credential fields.');
  const description=d.description.trim();if(Array.from(description).length<3||Array.from(description).length>255||/[\u0000-\u001f\u007f]/.test(description)||/skyra_live_[a-f0-9]{64}/i.test(description))throw new BadRequestException('Credential name must contain 3–255 characters without controls.');
  if(d.allowedProjects!==undefined&&(!Array.isArray(d.allowedProjects)||d.allowedProjects.length!==1||d.allowedProjects[0]!==projectId))throw new BadRequestException('Credential must be scoped to this project.');
  const allowedEnvironments=d.allowedEnvironments??['production'];if(!Array.isArray(allowedEnvironments)||!allowedEnvironments.length||allowedEnvironments.length>5||new Set(allowedEnvironments).size!==allowedEnvironments.length||!allowedEnvironments.every(v=>typeof v==='string'&&environments.includes(v)))throw new BadRequestException('Select explicit supported environments.');
  const rateLimitPerMin=d.rateLimitPerMin??600,expiresInDays=d.expiresInDays??90;
  if(typeof rateLimitPerMin!=='number'||!Number.isInteger(rateLimitPerMin)||rateLimitPerMin<60||rateLimitPerMin>60000||typeof expiresInDays!=='number'||!Number.isInteger(expiresInDays)||expiresInDays<1||expiresInDays>365)throw new BadRequestException('Invalid credential rate or expiry.');
  return {description,allowedEnvironments:allowedEnvironments as string[],rateLimitPerMin,expiresInDays};
}
export function issuanceId(value:string|undefined){if(!value||!uuid.test(value))throw new BadRequestException('A UUID Idempotency-Key is required for secret issuance.');return value;}
export function credentialVersion(value:string|undefined,id:string){if(!value)throw new HttpException('If-Match is required.',428);const m=/^"c([a-f0-9-]{36}):([0-9]{1,19})"$/i.exec(value);if(!m||!uuid.test(m[1]!)||BigInt(m[2]!)>9223372036854775807n)throw new BadRequestException('Invalid credential precondition.');if(m[1]!==id)throw new ConflictException('Credential context changed.');return m[2]!;}
export function emptyCredentialCommand(body:unknown){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)throw new BadRequestException('This command accepts an empty object only.');}
export function credentialQuery(q:Record<string,unknown>){
  if(Object.keys(q).some(k=>!['q','status','sort','direction','limit','cursor'].includes(k))||Object.values(q).some(v=>typeof v!=='string'))throw new BadRequestException('Invalid credential filters.');
  const search=String(q.q??'').trim(),status=String(q.status??''),sort=String(q.sort??'createdAt'),direction=String(q.direction??'desc'),limit=String(q.limit??'20'),cursor=String(q.cursor??'');
  if(search.length>100||search.includes('\0')||status&&!['ACTIVE','EXPIRED','REVOKED'].includes(status)||!['createdAt','description'].includes(sort)||!['asc','desc'].includes(direction)||!/^\d+$/.test(limit)||+limit<1||+limit>100||cursor.length>2048)throw new BadRequestException('Invalid credential filters.');return {search,status,sort:sort as 'createdAt'|'description',direction:direction as 'asc'|'desc',limit:+limit,cursor};
}
@Injectable()
export class CredentialsService {
  constructor(private readonly config:AdminConfigService,private readonly projects:ProjectsService){}
  private get db(){return adminPrisma(this.config);}
  private async metadata(tx:Prisma.TransactionClient,tenantId:string,projectId:string,id:string,ctx:Awaited<ReturnType<ProjectsService['credentialAccess']>>){
    if(!uuid.test(id))throw new NotFoundException('Credential not found.');
    await tx.$queryRaw`SELECT id FROM ingestion_credentials WHERE id=${id}::uuid AND tenant_id=${tenantId}::uuid AND project_id=${projectId} FOR SHARE`;
    const row=await tx.ingestionCredential.findFirst({where:{id,tenantId,projectId},select:safeSelect});if(!row)throw new NotFoundException('Credential not found.');
    const child=await tx.ingestionCredential.findFirst({where:{tenantId,projectId,rotatedFromId:id},select:{id:true}});
    const version=(await tx.$queryRaw<Array<{version:string}>>`SELECT (extract(epoch FROM updated_at)*1000000)::bigint::text AS version FROM ingestion_credentials WHERE id=${id}::uuid AND tenant_id=${tenantId}::uuid AND project_id=${projectId}`)[0]!.version;
    const status=row.isRevoked?'REVOKED':row.expiresAt.getTime()<=Date.now()?'EXPIRED':'ACTIVE';
    return {...row,createdAt:row.createdAt.toISOString(),expiresAt:row.expiresAt.toISOString(),updatedAt:row.updatedAt.toISOString(),revokedAt:row.revokedAt?.toISOString()??null,status,replacementId:child?.id??null,version:`"c${id}:${version}"`,actions:{revoke:!row.isRevoked&&ctx.caps.has('ingestion.credentials.revoke'),rotate:status==='ACTIVE'&&ctx.project.status==='ACTIVE'&&!child&&ctx.caps.has('ingestion.credentials.rotate')}};
  }
  list(p:TrustedPrincipal,tenantId:string,projectId:string,query:Record<string,unknown>){const q=credentialQuery(query);return this.db.$transaction(async tx=>{
    const ctx=await this.projects.credentialAccess(tx,p,tenantId,projectId,'read'),now=new Date();
    const where:Prisma.IngestionCredentialWhereInput={tenantId,projectId,...(q.search?{OR:[{description:{contains:q.search,mode:'insensitive' as const}},...(uuid.test(q.search)?[{issuanceRequestId:q.search},{id:q.search}]:[])]}:{}),...(q.status==='REVOKED'?{isRevoked:true}:q.status?{isRevoked:false,expiresAt:q.status==='ACTIVE'?{gt:now}:{lte:now}}:{})};
    const filter=JSON.stringify([tenantId,projectId,ctx.actor.user.id,q.search,q.status,q.sort,q.direction,q.limit]);let cursor:string|undefined;
    if(q.cursor){try{const d=JSON.parse(Buffer.from(q.cursor,'base64url').toString());if(d.filter!==filter||!uuid.test(d.id))throw Error();cursor=d.id;}catch{throw new BadRequestException('Invalid credential cursor.');}if(!await tx.ingestionCredential.findFirst({where:{AND:[where,{id:cursor}]},select:{id:true}}))throw new BadRequestException('Expired credential cursor; reload.');}
    const rows=await tx.ingestionCredential.findMany({where,orderBy:[{[q.sort]:q.direction},{id:q.direction}],take:q.limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true}}),items=[];
    for(const row of rows.slice(0,q.limit))items.push(await this.metadata(tx,tenantId,projectId,row.id,ctx));
    return {items,nextCursor:rows.length>q.limit?Buffer.from(JSON.stringify({id:items.at(-1)!.id,filter})).toString('base64url'):null,canCreate:ctx.project.status==='ACTIVE'&&ctx.caps.has('ingestion.credentials.create'),project:{id:ctx.project.id,name:ctx.project.name,status:ctx.project.status}};
  },{timeout:15000});}
  read(p:TrustedPrincipal,tenantId:string,projectId:string,id:string){return this.db.$transaction(async tx=>{const ctx=await this.projects.credentialAccess(tx,p,tenantId,projectId,'read');return this.metadata(tx,tenantId,projectId,id,ctx);});}
  private async issue(tx:Prisma.TransactionClient,tenantId:string,projectId:string,createdBy:string,input:{description:string;allowedEnvironments:string[];rateLimitPerMin:number;expiresAt:Date},requestId:string,rotatedFromId?:string){
    const rawToken='skyra_live_'+randomBytes(32).toString('hex'),keyHash=createHash('sha256').update(rawToken).digest('hex'),id=randomUUID();
    const inserted=await tx.$executeRaw`INSERT INTO ingestion_credentials(id,tenant_id,project_id,created_by,key_hash,key_prefix,description,allowed_projects,allowed_environments,rate_limit_per_minute,expires_at,rotated_from_id,issuance_request_id) VALUES(${id}::uuid,${tenantId}::uuid,${projectId},${createdBy}::uuid,${keyHash},'skyra_live_',${input.description},ARRAY[${projectId}]::text[],${input.allowedEnvironments}::text[],${input.rateLimitPerMin},${input.expiresAt},${rotatedFromId??null}::uuid,${requestId}::uuid) ON CONFLICT DO NOTHING`;
    if(inserted!==1)throw new ConflictException('Issuance already processed or source already replaced. Review metadata; the secret cannot be recovered.');
    return {id,rawToken};
  }
  private async issuance<T>(run:()=>Promise<T>){try{return await run();}catch(e){if((e as any).code==='P2002')throw new ConflictException('Issuance already processed or source already replaced. Secrets cannot be recovered. Review metadata and revoke any unconfigured credential.');throw e;}}
  create(p:TrustedPrincipal,tenantId:string,projectId:string,body:unknown,requestId:string|undefined,correlationId:string){const input=credentialInput(body,projectId),request=issuanceId(requestId);
    return this.issuance(()=>this.db.$transaction(async tx=>{const ctx=await this.projects.credentialAccess(tx,p,tenantId,projectId,'create',true),issued=await this.issue(tx,tenantId,projectId,ctx.actor.user.id,{...input,expiresAt:new Date(Date.now()+input.expiresInDays*86400000)},request);
      const after=await this.metadata(tx,tenantId,projectId,issued.id,ctx);await this.audit(tx,ctx,'CREDENTIAL_CREATED',null,after,correlationId);return {...after,rawToken:issued.rawToken};
    },{timeout:10000}));
  }
  rotate(p:TrustedPrincipal,tenantId:string,projectId:string,id:string,body:unknown,etag:string|undefined,requestId:string|undefined,correlationId:string){emptyCredentialCommand(body);credentialVersion(etag,id);const request=issuanceId(requestId);if(!uuid.test(id))throw new NotFoundException('Credential not found.');
    return this.issuance(()=>this.db.$transaction(async tx=>{const ctx=await this.projects.credentialAccess(tx,p,tenantId,projectId,'rotate',true);await tx.$queryRaw`SELECT id FROM ingestion_credentials WHERE id=${id}::uuid AND tenant_id=${tenantId}::uuid AND project_id=${projectId} FOR UPDATE`;
      const before=await this.metadata(tx,tenantId,projectId,id,ctx);if(before.version!==etag||before.status!=='ACTIVE'||before.replacementId)throw new ConflictException('Credential changed, expired, revoked or already replaced. Reload metadata; a secret cannot be retrieved again.');
      const allowedEnvironments=before.allowedEnvironments.includes('*')?environments:before.allowedEnvironments;if(!allowedEnvironments.length||!allowedEnvironments.every(v=>environments.includes(v)))throw new ConflictException('Legacy environment scope needs an explicitly created scoped credential.');
      const issued=await this.issue(tx,tenantId,projectId,ctx.actor.user.id,{description:before.description,allowedEnvironments,rateLimitPerMin:before.rateLimitPerMin,expiresAt:new Date(Math.min(Date.parse(before.expiresAt),Date.now()+365*86400000))},request,id);
      await tx.$executeRaw`UPDATE ingestion_credentials SET updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=${id}::uuid AND tenant_id=${tenantId}::uuid AND project_id=${projectId}`;
      const after=await this.metadata(tx,tenantId,projectId,issued.id,ctx);await this.audit(tx,ctx,'CREDENTIAL_ROTATED',before,after,correlationId);return {...after,rawToken:issued.rawToken};
    },{timeout:10000}));
  }
  revoke(p:TrustedPrincipal,tenantId:string,projectId:string,id:string,body:unknown,etag:string|undefined,correlationId:string){emptyCredentialCommand(body);const version=credentialVersion(etag,id);if(!uuid.test(id))throw new NotFoundException('Credential not found.');return this.db.$transaction(async tx=>{
    const ctx=await this.projects.credentialAccess(tx,p,tenantId,projectId,'revoke');await tx.$queryRaw`SELECT id FROM ingestion_credentials WHERE id=${id}::uuid AND tenant_id=${tenantId}::uuid AND project_id=${projectId} FOR UPDATE`;
    const before=await this.metadata(tx,tenantId,projectId,id,ctx);if(before.isRevoked)return before;if(before.version!==etag)throw new ConflictException('Credential changed. Reload before revoking.');
    const changed=await tx.$executeRaw`UPDATE ingestion_credentials SET is_revoked=true,revoked_at=clock_timestamp(),updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=${id}::uuid AND tenant_id=${tenantId}::uuid AND project_id=${projectId} AND NOT is_revoked AND (extract(epoch FROM updated_at)*1000000)::bigint=${BigInt(version)}`;
    if(changed!==1)throw new ConflictException('Credential changed.');const after=await this.metadata(tx,tenantId,projectId,id,ctx);await this.audit(tx,ctx,'CREDENTIAL_REVOKED',before,after,correlationId);return after;
  },{timeout:10000});}
  private audit(tx:Prisma.TransactionClient,ctx:Awaited<ReturnType<ProjectsService['credentialAccess']>>,action:'CREDENTIAL_CREATED'|'CREDENTIAL_ROTATED'|'CREDENTIAL_REVOKED',before:any,after:any,correlationId:string){
    return new PrismaAuditRepository(this.config).recordAuditEvent({tenantId:ctx.project.tenantId,actorUserId:ctx.actor.user.id,actorEmail:ctx.actor.user.email,action,targetType:'credential',targetId:after.id,details:{projectId:ctx.project.id,before:before?{id:before.id,isRevoked:before.isRevoked,expiresAt:before.expiresAt}:null,after:{id:after.id,keyPrefix:after.keyPrefix,isRevoked:after.isRevoked,expiresAt:after.expiresAt,rotatedFromId:after.rotatedFromId},correlationId,outcome:'SUCCESS'}},tx);
  }
}
