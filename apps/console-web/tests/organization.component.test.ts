import '@angular/compiler';
import 'zone.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, EnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { OrganizationComponent } from '../src/app/features/organization/organization.component';
import { OrganizationApiService, OrganizationView } from '../src/app/features/organization/organization-api.service';
import { AuthService } from '../src/app/core/auth/auth.service';

const record: OrganizationView={id:'tenant',code:'organization',name:'Persisted organization',status:'ACTIVE',createdAt:'2026-11-03T00:00:00Z',updatedAt:'2026-11-03T00:00:00Z',version:'"t123"',capabilities:['tenant.read','tenant.update']};
function setup() {
  const reads=new Subject<OrganizationView>(), writes=new Subject<OrganizationView>(), calls: unknown[][]=[];
  const injector=createEnvironmentInjector([
    {provide:OrganizationApiService,useValue:{read:()=>reads,save:(...args:unknown[])=>{calls.push(args);return writes;}}},
    {provide:ActivatedRoute,useValue:{snapshot:{data:{settings:true}}}},
    {provide:Router,useValue:{navigateByUrl:async()=>true}},
    {provide:AuthService,useValue:{logout:()=>{}}},
  ],Injector.NULL as unknown as EnvironmentInjector);
  const component=runInInjectionContext(injector,()=>new OrganizationComponent());
  return {component,reads,writes,calls,injector};
}
test('organization state exposes loading then real API metadata',()=>{const s=setup();assert.equal(s.component.loading(),true);s.reads.next(record);assert.equal(s.component.loading(),false);assert.equal(s.component.organization()?.id,'tenant');s.injector.destroy();});
test('organization validates names and resets saved values on cancel',()=>{const s=setup();s.reads.next(record);s.component.name.set(' ');assert.ok(s.component.validation());s.component.cancel();assert.equal(s.component.name(),record.name);assert.equal(s.component.dirty(),false);s.injector.destroy();});
test('organization save trims and forwards its version, then adopts fresh state',()=>{const s=setup();s.reads.next(record);s.component.name.set(' Updated organization ');s.component.save();assert.equal(s.component.saving(),true);assert.deepEqual(s.calls,[['Updated organization','"t123"']]);s.writes.next({...record,name:'Updated organization',version:'"t124"'});assert.equal(s.component.success(),true);assert.equal(s.component.organization()?.version,'"t124"');assert.equal(s.component.dirty(),false);s.injector.destroy();});
test('stale organization save preserves draft and requires refresh',()=>{const s=setup();s.reads.next(record);s.component.name.set('My draft');s.component.save();s.writes.error(new HttpErrorResponse({status:409}));assert.equal(s.component.conflict(),true);assert.equal(s.component.name(),'My draft');assert.equal(s.component.success(),false);s.component.save();assert.equal(s.calls.length,1);s.injector.destroy();});
test('permission-denied organization data is cleared',()=>{const s=setup();s.reads.error(new HttpErrorResponse({status:403}));assert.equal(s.component.denied(),true);assert.equal(s.component.organization(),null);s.injector.destroy();});
test('read-only capability projection never invokes save',()=>{const s=setup();s.reads.next({...record,capabilities:['tenant.read']});s.component.name.set('Attempted write');s.component.save();assert.equal(s.component.canEdit(),false);assert.equal(s.calls.length,0);s.injector.destroy();});
test('save failures retain draft and expose error state',()=>{const s=setup();s.reads.next(record);s.component.name.set('My draft');s.component.save();s.writes.error(new HttpErrorResponse({status:502}));assert.equal(s.component.saving(),false);assert.equal(s.component.name(),'My draft');assert.ok(s.component.error());s.injector.destroy();});
test('destroying organization view cancels its outstanding API subscription',()=>{const s=setup();assert.equal(s.reads.observers.length,1);s.injector.destroy();assert.equal(s.reads.observers.length,0);});
