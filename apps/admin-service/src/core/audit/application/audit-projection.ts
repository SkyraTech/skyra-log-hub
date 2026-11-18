/** Public audit fields are opt-in. Never serialize the persistence entity or arbitrary details. */
export const AUDIT_ACTIONS = {
  SAVED_SEARCH_CREATED:'Shared saved search created',SAVED_SEARCH_UPDATED:'Shared saved search updated',SAVED_SEARCH_DELETED:'Shared saved search deleted',
  TENANT_UPDATED:'Organization updated', MEMBER_INVITED:'Member invited', MEMBER_ROLE_CHANGED:'Member role changed',
  MEMBER_REMOVED:'Membership revoked', MEMBER_SUSPENDED:'Membership suspended', MEMBER_REACTIVATED:'Membership reactivated',
  PROJECT_CREATED:'Project created', PROJECT_UPDATED:'Project updated', PROJECT_DISABLED:'Project suspended',
  PROJECT_REACTIVATED:'Project reactivated', PROJECT_ARCHIVED:'Project archived', CREDENTIAL_CREATED:'Credential created',
  CREDENTIAL_ROTATED:'Credential rotated', CREDENTIAL_REVOKED:'Credential revoked', QUOTA_UPDATED:'Quota policy changed',
  RETENTION_POLICY_CHANGED:'Retention policy changed',
} as const;
export const AUDIT_RESOURCES=['saved_search','tenant','membership','project','credential','quota','retention'] as const;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const roles=['OrgOwner','OrgAdmin','ProjectAdmin','Developer','Viewer'];
const states=['ACTIVE','SUSPENDED','ARCHIVED','REVOKED','PENDING_INVITE','DECOMMISSIONED'];
export function safeAuditText(value:unknown,max=255):string|null {
  if(typeof value!=='string'||!value.length||value.length>max||/[\u0000-\u001f\u007f]/.test(value)||/skyra_live_|bearer\s|(?:postgres(?:ql)?|https?):\/\/|-----BEGIN|eyJ[\w-]+\.|(?:password|secret|token)\s*[:=]|^[a-f0-9]{64}$/i.test(value))return null;
  return value;
}
type Value=string|boolean|null;
export interface AuditChange {field:string;label:string;before:Value;after:Value;beforeAvailable:boolean;afterAvailable:boolean;}
export interface PublicAuditEvent {id:string;timestamp:string;action:string;actionLabel:string;actorId:string|null;actorLabel:string;resourceType:string;resourceId:string;summary:string;correlationId:string|null;changes:AuditChange[];metadataOmitted:boolean;}
const object=(v:any):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
function fields(action:string){
  if(action==='TENANT_UPDATED')return [['name','Display name','text']];
  if(action.startsWith('PROJECT_'))return [['name','Project name','text'],['status','Project status','status']];
  if(action.startsWith('MEMBER_'))return [['roles','Roles','roles'],['status','Membership status','status']];
  if(action.startsWith('CREDENTIAL_'))return [['id','Credential ID','uuid'],['isRevoked','Revoked','boolean'],['expiresAt','Expires at','timestamp'],['rotatedFromId','Replaces credential','uuid']];
  if(action==='QUOTA_UPDATED')return [['enabled','Daily enforcement','boolean'],['dailyEvents','Daily events','decimal'],['dailyBytes','Daily bytes','decimal']];
  if(action==='RETENTION_POLICY_CHANGED')return [['retentionDays','Retention days','integer']];
  return [];
}
function value(raw:unknown,type:string):{available:boolean;value:Value}{
  let v:Value= null,available=false;
  if(type==='text'){v=safeAuditText(raw);available=v!==null;}
  if(type==='uuid'&&typeof raw==='string'&&uuid.test(raw)){v=raw;available=true;}
  if(type==='boolean'&&typeof raw==='boolean'){v=raw;available=true;}
  if(type==='status'&&typeof raw==='string'&&states.includes(raw)){v=raw;available=true;}
  if(type==='roles'&&Array.isArray(raw)&&raw.length>0&&raw.length<=5&&raw.every(r=>roles.includes(r))){v=[...new Set(raw)].sort().join(', ');available=true;}
  if(type==='decimal'&&(raw===null||typeof raw==='string'&&/^(0|[1-9][0-9]{0,15})$/.test(raw)&&BigInt(raw)<=9007199254740991n)){v=raw as string|null;available=true;}
  if(type==='integer'&&Number.isSafeInteger(raw)&&Number(raw)>=0&&Number(raw)<=36500){v=String(raw);available=true;}
  if(type==='timestamp'&&typeof raw==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(raw)&&Number.isFinite(Date.parse(raw))){v=raw;available=true;}
  return {available,value:v};
}
export function projectAudit(row:Record<string,any>):PublicAuditEvent {
  const known=Object.hasOwn(AUDIT_ACTIONS,row.action),action=typeof row.action==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(row.action)?row.action:'UNKNOWN';
  // PostgreSQL returns bounded JSON text to avoid Prisma's nested-JSON recursion limit.
  let raw:unknown=row.details,corrupt=false;try{if(typeof row.details==='string')raw=Buffer.byteLength(row.details,'utf8')<=65536?JSON.parse(row.details):{};}catch{raw={};corrupt=true;}
  const details=object(raw),before=object(details.before),after=object(details.after),changes:AuditChange[]=[];
  if(known)for(const [field,label,type]of fields(action)){
    const old=value(before[field!],type!),next=value(after[field!],type!);
    if(old.available||next.available)changes.push({field:field!,label:label!,before:old.value,after:next.value,beforeAvailable:old.available,afterAvailable:next.available});
  }
  const actorId=typeof row.actor_user_id==='string'&&uuid.test(row.actor_user_id)?row.actor_user_id:null;
  const correlation=typeof details.correlationId==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(details.correlationId)?safeAuditText(details.correlationId,64):null;
  const label=known?AUDIT_ACTIONS[action as keyof typeof AUDIT_ACTIONS]:'Unknown administrative action';
  const changed=changes.filter(c=>!(c.beforeAvailable&&c.afterAvailable&&c.before===c.after));
  return {id:row.id,timestamp:row.timestamp,action,actionLabel:label,actorId,actorLabel:actorId?'Actor '+actorId:'Actor unavailable',
    resourceType:AUDIT_RESOURCES.includes(row.target_type)?row.target_type:'unknown',resourceId:safeAuditText(row.target_id,64)??'Unavailable',
    summary:known?label+(changed.length?` · ${changed.map(c=>c.label).join(', ')}`:changes.length?' · Recorded values unchanged':' · Historical change details unavailable'):'Historical event type is not recognized; metadata is withheld',
    correlationId:correlation,changes,metadataOmitted:corrupt||row.metadata_omitted===true||!known};
}
