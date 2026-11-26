import '@angular/compiler';
import 'zone.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, EnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { RetentionComponent } from '../src/app/features/retention/retention.component';
import { ProjectsApiService, type ProjectView } from '../src/app/features/projects/projects-api.service';
import { RetentionApiService, type RetentionView } from '../src/app/features/projects/retention-api.service';
import { AuthService } from '../src/app/core/auth/auth.service';

const testProject: ProjectView = {
  id: 'test-project',
  tenantId: 'tenant-123',
  name: 'Test Project',
  status: 'ACTIVE',
  version: '"ptest-project:1"',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  actions: { update: true, suspend: true, reactivate: false, archive: true },
};

const testRetention: RetentionView = {
  id: 'a0000000-0000-0000-0000-000000000001',
  tenantId: 'tenant-123',
  projectId: 'test-project',
  retentionDays: 30,
  enableParquetPurge: true,
  isLegalHold: false,
  updatedAt: '2026-11-01T00:00:00Z',
};

function setup() {
  const projectReads = new Subject<ProjectView>();
  const retentionReads = new Subject<RetentionView>();
  const retentionWrites = new Subject<RetentionView>();
  const writeCalls: unknown[][] = [];

  const injector = createEnvironmentInjector(
    [
      {
        provide: ProjectsApiService,
        useValue: {
          read: () => projectReads,
        },
      },
      {
        provide: RetentionApiService,
        useValue: {
          getRetention: () => retentionReads,
          updateRetention: (...args: unknown[]) => {
            writeCalls.push(args);
            return retentionWrites;
          },
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: {
              get: () => 'test-project',
            },
          },
        },
      },
      {
        provide: Router,
        useValue: {
          navigate: async () => true,
          navigateByUrl: async () => true,
        },
      },
      {
        provide: AuthService,
        useValue: {
          logout: () => {},
        },
      },
    ],
    Injector.NULL as unknown as EnvironmentInjector,
  );

  const component = runInInjectionContext(injector, () => new RetentionComponent());

  return {
    component,
    projectReads,
    retentionReads,
    retentionWrites,
    writeCalls,
    injector,
    load: (proj = testProject, ret = testRetention) => {
      projectReads.next(proj);
      projectReads.complete();
      retentionReads.next(ret);
      retentionReads.complete();
    },
  };
}

test('retention component loads project and retention policy state', () => {
  const s = setup();
  assert.equal(s.component.loading(), true);
  s.load();
  assert.equal(s.component.loading(), false);
  assert.equal(s.component.project()?.name, 'Test Project');
  assert.equal(s.component.policy()?.retentionDays, 30);
  assert.equal(s.component.daysText(), '30');
  assert.equal(s.component.enableParquetPurge(), true);
  assert.equal(s.component.isLegalHold(), false);
  assert.equal(s.component.dirty(), false);
  s.injector.destroy();
});

test('retention input modification tracks dirty state and validates bounds', () => {
  const s = setup();
  s.load();
  assert.equal(s.component.dirty(), false);

  s.component.onDaysInput('60');
  assert.equal(s.component.dirty(), true);
  assert.equal(s.component.validDays(), true);

  s.component.onDaysInput('0');
  assert.equal(s.component.validDays(), false);

  s.component.onDaysInput('400');
  assert.equal(s.component.validDays(), false);

  s.component.onDaysInput('abc');
  assert.equal(s.component.validDays(), false);

  s.component.onDaysInput('30');
  assert.equal(s.component.dirty(), false);
  s.injector.destroy();
});

test('retention save sends updated duration and purge preference', () => {
  const s = setup();
  s.load();
  s.component.onDaysInput('90');
  s.component.enableParquetPurge.set(false);
  assert.equal(s.component.dirty(), true);

  s.component.requestSave();
  assert.equal(s.writeCalls.length, 1);
  assert.deepEqual(s.writeCalls[0], [
    'test-project',
    {
      retentionDays: 90,
      enableParquetPurge: false,
      isLegalHold: false,
    },
  ]);

  s.retentionWrites.next({
    ...testRetention,
    retentionDays: 90,
    enableParquetPurge: false,
  });

  assert.equal(s.component.dirty(), false);
  assert.equal(s.component.saving(), false);
  assert.match(s.component.success(), /updated successfully/);
  s.injector.destroy();
});

test('legal hold toggle prompts for confirmation and updates state upon confirmation', () => {
  const s = setup();
  s.load();
  assert.equal(s.component.isLegalHold(), false);

  s.component.onLegalHoldToggle(true);
  assert.equal(s.component.confirmingLegalHold(), true);
  assert.equal(s.component.isLegalHold(), false); // Not changed yet

  s.component.confirmLegalHoldChange();
  assert.equal(s.component.confirmingLegalHold(), false);
  assert.equal(s.component.isLegalHold(), true);
  assert.equal(s.component.dirty(), true);

  s.injector.destroy();
});

test('permission failure gracefully handles 403 error', () => {
  const s = setup();
  s.projectReads.next(testProject);
  s.projectReads.complete();
  s.retentionReads.error(new HttpErrorResponse({ status: 403 }));

  assert.equal(s.component.denied(), true);
  assert.match(s.component.error(), /permission/);
  assert.equal(s.component.loading(), false);
  s.injector.destroy();
});

test('conflict error during save prompts user to reload', () => {
  const s = setup();
  s.load();
  s.component.onDaysInput('60');
  s.component.requestSave();
  s.retentionWrites.error(new HttpErrorResponse({ status: 409 }));

  assert.equal(s.component.saving(), false);
  assert.match(s.component.error(), /conflict/);
  s.injector.destroy();
});
