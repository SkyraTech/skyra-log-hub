import '@angular/compiler';
import 'zone.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, EnvironmentInjector, Injector } from '@angular/core';
import { AuthService } from '../src/app/core/auth/auth.service';
import { AppConfigService } from '../src/app/core/config/app-config.service';
import { HttpClient } from '@angular/common/http';

describe('AuthService — BFF Session & RBAC Capability Evaluation', () => {
  let injector: EnvironmentInjector;
  let authService: AuthService;

  it('does not initialize or accept fabricated preview sessions when runtime preview is disabled', () => {
    const config=new AppConfigService();config.updateConfig({previewMode:false});
    const scoped=createEnvironmentInjector([{provide:AppConfigService,useValue:config},AuthService],Injector.NULL as unknown as EnvironmentInjector);
    try{
      const service=scoped.get(AuthService);
      assert.equal(service.isAuthenticated(),false);assert.equal(service.isPreviewSession(),false);assert.equal(service.currentUser(),null);
      service.loginPreview({id:'preview-only',email:'preview@test.invalid',fullName:'Preview',roles:['OrgOwner'],tenantId:'untrusted',allowedProjects:['untrusted']});
      assert.equal(service.isAuthenticated(),false);assert.equal(service.currentUser(),null);
      config.updateConfig({previewMode:true});
      service.loginPreview({id:'preview-only',email:'preview@test.invalid',fullName:'Preview',roles:['Viewer'],tenantId:'preview',allowedProjects:[]});
      assert.equal(service.isPreviewSession(),true);
    }finally{scoped.destroy();}
  });

  beforeEach(() => {
    injector = createEnvironmentInjector([AppConfigService, AuthService], Injector.NULL as unknown as EnvironmentInjector);
    authService = injector.get(AuthService);
  });

  it('should initialize with dev preview session active', () => {
    assert.equal(authService.isAuthenticated(), true);
    assert.equal(authService.isPreviewSession(), true);
    assert.equal(authService.currentUser()?.fullName, 'Alex Vance');
    assert.equal(authService.isOrgAdmin(), true);
    assert.equal(authService.isDeveloper(), true);
  });

  it('should evaluate role capabilities accurately', () => {
    assert.equal(authService.hasRole('OrgAdmin'), true);
    assert.equal(authService.hasRole('Developer'), true);
    assert.equal(authService.hasRole('Viewer'), false);
  });

  it('should clear session upon logout', () => {
    authService.logout();
    assert.equal(authService.isAuthenticated(), false);
    assert.equal(authService.currentUser(), null);
    assert.equal(authService.isPreviewSession(), false);
    assert.equal(authService.isOrgAdmin(), false);
    assert.equal(authService.isDeveloper(), false);
  });

  for(const allowed of [true,false])it(`should clear local session before ${allowed?'provider logout navigation':'refusing an unsafe logout URL'}`,async()=>{
    const destination=allowed?'https://identity.test.invalid/logout':'javascript:alert(1)';let navigated=false;
    const scoped=createEnvironmentInjector([AppConfigService,AuthService,{provide:HttpClient,useValue:{post:()=>({toPromise:async()=>({providerLogoutUrl:destination})})}}],Injector.NULL as unknown as EnvironmentInjector);
    const service=scoped.get(AuthService),previous=Object.getOwnPropertyDescriptor(globalThis,'window');
    Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{assign:(url:string)=>{assert.equal(service.isAuthenticated(),false);assert.equal(url,destination);navigated=true;}}}});
    try{await service.logoutFromBff();assert.equal(service.isAuthenticated(),false);assert.equal(navigated,allowed);}
    finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');scoped.destroy();}
  });

  it('should allow login with custom user profile', () => {
    authService.loginPreview({
      id: 'usr-analyst-01',
      email: 'analyst@skyra-tech.com',
      fullName: 'Data Analyst',
      roles: ['Viewer'],
      tenantId: 'tenant-demo',
      allowedProjects: ['skyra-tech'],
    });

    assert.equal(authService.isAuthenticated(), true);
    assert.equal(authService.currentUser()?.fullName, 'Data Analyst');
    assert.equal(authService.hasRole('Viewer'), true);
    assert.equal(authService.isOrgAdmin(), false);
  });
});
