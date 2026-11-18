import '@angular/compiler';
import 'zone.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, EnvironmentInjector, Injector } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from '../src/app/core/auth/auth.service';
import { AppConfigService } from '../src/app/core/config/app-config.service';
import {HttpClient} from '@angular/common/http';
import {of} from 'rxjs';
import { authGuard, orgAdminGuard, roleGuard } from '../src/app/core/auth/auth.guard';

describe('Auth Guards — Route Protection & RBAC Entitlements', () => {
  let injector: EnvironmentInjector;
  let authService: AuthService;

  it('hydrates a real BFF cookie session for direct guarded navigation when preview is disabled',async()=>{
    const config=new AppConfigService();config.updateConfig({previewMode:false});let authenticated=true;
    const scoped=createEnvironmentInjector([{provide:AppConfigService,useValue:config},AuthService,{provide:Router,useValue:{createUrlTree:(commands:string[],extra:any)=>({commands,extra})}},{provide:HttpClient,useValue:{get:()=>of(authenticated?{authenticated:true,user:{id:'persisted-user',email:'user@test.invalid',name:'Persisted owner',roles:['OrgOwner']},activeTenantId:'persisted-tenant',availableProjects:[],csrfToken:'unit-only',expiresAt:'2030-01-01T00:00:00Z'}:{authenticated:false})}}],Injector.NULL as unknown as EnvironmentInjector);
    try{const service=scoped.get(AuthService);assert.equal(service.isAuthenticated(),false);
      assert.equal(await scoped.runInContext(()=>authGuard({} as any,{url:'/overview'} as any)),true);
      assert.equal(service.isPreviewSession(),false);assert.equal(service.currentUser()?.id,'persisted-user');
      authenticated=false;service.logout();const denied=await scoped.runInContext(()=>authGuard({} as any,{url:'/overview'} as any)) as any;
      assert.deepEqual(denied.commands,['/login']);assert.equal(denied.extra.queryParams.returnUrl,'/overview');
    }finally{scoped.destroy();}
  });

  const mockRouter = {
    createUrlTree: (commands: string[], navigationExtras?: { queryParams?: Record<string, string> }) => ({
      commands,
      queryParams: navigationExtras?.queryParams,
      toString: () => commands.join('/'),
    }),
  };

  beforeEach(() => {
    injector = createEnvironmentInjector(
      [
        AppConfigService,
        AuthService,
        { provide: Router, useValue: mockRouter },
      ],
      Injector.NULL as unknown as EnvironmentInjector,
    );
    authService = injector.get(AuthService);
  });

  it('authGuard should allow authenticated users to proceed', () => {
    authService.loginPreview({
      id: 'usr_1',
      email: 'alex@skyra.dev',
      fullName: 'Alex Vance',
      roles: ['Viewer'],
      tenantId: 'skyra-internal',
      allowedProjects: ['skyra-tech'],
    });

    const route = {} as any;
    const state = { url: '/logs' } as any;

    injector.runInContext(() => {
      const result = authGuard(route, state);
      assert.equal(result, true);
    });
  });

  it('authGuard should redirect unauthenticated users to /login with returnUrl', () => {
    authService.logout();

    const route = {} as any;
    const state = { url: '/analytics?view=trends' } as any;

    injector.runInContext(() => {
      const result = authGuard(route, state) as unknown as { commands: string[]; queryParams: { returnUrl: string } };
      assert.deepEqual(result.commands, ['/login']);
      assert.equal(result.queryParams.returnUrl, '/analytics?view=trends');
    });
  });

  it('orgAdminGuard should allow OrgAdmin users to access admin routes', () => {
    authService.loginPreview({
      id: 'usr_admin',
      email: 'admin@skyra.dev',
      fullName: 'System Admin',
      roles: ['OrgAdmin'],
      tenantId: 'skyra-internal',
      allowedProjects: ['skyra-tech'],
    });

    injector.runInContext(() => {
      const result = orgAdminGuard({} as any, {} as any);
      assert.equal(result, true);
    });
  });

  it('orgAdminGuard should redirect non-admin users to /unauthorized', () => {
    authService.loginPreview({
      id: 'usr_viewer',
      email: 'viewer@skyra.dev',
      fullName: 'Read Only',
      roles: ['Viewer'],
      tenantId: 'skyra-internal',
      allowedProjects: ['skyra-tech'],
    });

    injector.runInContext(() => {
      const result = orgAdminGuard({} as any, {} as any) as unknown as { commands: string[] };
      assert.deepEqual(result.commands, ['/unauthorized']);
    });
  });

  it('roleGuard should enforce specific role requirements', () => {
    authService.loginPreview({
      id: 'usr_dev',
      email: 'dev@skyra.dev',
      fullName: 'Developer',
      roles: ['Developer'],
      tenantId: 'skyra-internal',
      allowedProjects: ['skyra-tech'],
    });

    const devGuard = roleGuard('Developer');
    const adminGuard = roleGuard('OrgAdmin');

    injector.runInContext(() => {
      assert.equal(devGuard({} as any, {} as any), true);
      const res = adminGuard({} as any, {} as any) as unknown as { commands: string[] };
      assert.deepEqual(res.commands, ['/unauthorized']);
    });
  });
});
