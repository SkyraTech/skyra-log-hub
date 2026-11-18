import {Injectable,HttpException,ConflictException,BadRequestException} from '@nestjs/common';
import {adminPrisma} from '../../core/database/admin-prisma.js';
import {AdminConfigService} from '../../core/config/admin-config.service.js';
import type {TrustedPrincipal} from '../../core/security/trusted-assertion.guard.js';
import {ProjectsService} from '../projects/projects.service.js';
import {DASHBOARD_DEFAULTS,preferenceSettings} from './preference-settings.js';
@Injectable()
export class DashboardPreferencesService {
 constructor(private readonly config:AdminConfigService,private readonly projects:ProjectsService){}
 private view(projectId:string,row?:any){return {projectId,settings:row?preferenceSettings(row.settings):{...DASHBOARD_DEFAULTS},version:row?`"p${row.version}"`:'"p0"',persisted:!!row,updatedAt:row?.updated_at.toISOString()??null};}
 async execute(p:TrustedPrincipal,tenant:string,project:string,method:'GET'|'PUT'|'RESET',raw?:unknown,etag?:string){
  const settings=method==='GET'?null:method==='RESET'?{...DASHBOARD_DEFAULTS}:preferenceSettings(raw);
  if(method!=='GET'&&!etag)throw new HttpException('If-Match required.',428);
  if(method!=='GET'&&!/^"p(?:0|[1-9]\d{0,15})"$/.test(etag!))throw new BadRequestException('Invalid preference version.');
  return adminPrisma(this.config).$transaction(async tx=>{
   const a=await this.projects.searchAccess(tx,p,tenant,project,'analytics.preferences','logs.analytics'),owner=a.actor.user.id;
   if(method!=='GET')await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'dashboard-preferences/'+tenant+'/'+project+'/'+owner},0))::text`;
   const rows:any[]=await tx.$queryRaw`SELECT * FROM dashboard_preferences WHERE tenant_id=${tenant}::uuid AND project_id=${project} AND owner_id=${owner}::uuid`;
   const before=this.view(project,rows[0]);if(method==='GET')return before;
   if(before.version!==etag)throw new ConflictException('Dashboard preferences changed. Reload before saving.');
   if(rows[0])await tx.$executeRaw`UPDATE dashboard_preferences SET settings=${JSON.stringify(settings)}::jsonb,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=${tenant}::uuid AND project_id=${project} AND owner_id=${owner}::uuid`;
   else await tx.$executeRaw`INSERT INTO dashboard_preferences(tenant_id,project_id,owner_id,settings) VALUES(${tenant}::uuid,${project},${owner}::uuid,${JSON.stringify(settings)}::jsonb)`;
   const after:any[]=await tx.$queryRaw`SELECT * FROM dashboard_preferences WHERE tenant_id=${tenant}::uuid AND project_id=${project} AND owner_id=${owner}::uuid`;return this.view(project,after[0]);
  },{timeout:10000});
 }
}
