/**
 * @skyra/logger-angular - Unit & Integration Tests
 */

import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEnvironmentInjector,
  Injector,
  ErrorHandler,
  runInInjectionContext,
} from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject, of } from 'rxjs';
import { HttpRequest, HttpResponse } from '@angular/common/http';
import { MemoryTransport } from '@skyra/logger-browser';
import {
  provideSkyraLogger,
  SkyraLoggerService,
  SkyraErrorHandler,
  SkyraRouterTracker,
  skyraHttpInterceptor,
} from '../../src/index.js';

describe('Logger Angular: Standalone Provider & Services', () => {
  it('47. Provider initializes SkyraLoggerService with custom configuration', async () => {
    const memory = new MemoryTransport();

    const envInjector = createEnvironmentInjector(
      [
        provideSkyraLogger({
          projectId: 'angular-erp',
          serviceName: 'erp-frontend',
          environment: 'production',
          transport: memory,
          component: 'app-root',
        }),
      ],
      Injector.NULL as unknown as import('@angular/core').EnvironmentInjector
    );

    const service = envInjector.get(SkyraLoggerService);
    assert.ok(service);
    assert.equal(service.getLevel(), 'info');

    service.info('Angular app initialized', { view: 'dashboard' });
    await service.flush();

    const events = memory.getEvents();
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.skyra.project_id, 'angular-erp');
    assert.equal(ev.service.name, 'erp-frontend');
    assert.equal(ev.skyra.component, 'app-root');
    assert.equal(ev.message, 'Angular app initialized');
  });

  it('48. SkyraErrorHandler intercepts and logs uncaught exceptions', async () => {
    const memory = new MemoryTransport();

    const envInjector = createEnvironmentInjector(
      [
        provideSkyraLogger({
          projectId: 'angular-erp',
          serviceName: 'erp-frontend',
          environment: 'production',
          transport: memory,
        }),
      ],
      Injector.NULL as unknown as import('@angular/core').EnvironmentInjector
    );

    const errorHandler = envInjector.get(ErrorHandler);
    assert.ok(errorHandler instanceof SkyraErrorHandler);

    const testError = new TypeError('Cannot access property of null');
    errorHandler.handleError(testError);

    const service = envInjector.get(SkyraLoggerService);
    await service.flush();

    const events = memory.getEvents();
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.log.level, 'error');
    assert.equal(ev.event.action, 'angular.error.uncaught');
    assert.equal(ev.error?.type, 'TypeError');
    assert.equal(ev.error?.message, 'Cannot access property of null');
  });

  it('49. SkyraRouterTracker records sanitized navigation events', async () => {
    const memory = new MemoryTransport();
    const routerEvents$ = new Subject<any>();
    const mockRouter = {
      events: routerEvents$.asObservable(),
    };

    const envInjector = createEnvironmentInjector(
      [
        provideSkyraLogger(
          {
            projectId: 'angular-nav',
            serviceName: 'angular-web',
            environment: 'production',
            transport: memory,
          },
          { withRouterTracking: true }
        ),
        { provide: Router, useValue: mockRouter },
      ],
      Injector.NULL as unknown as import('@angular/core').EnvironmentInjector
    );

    const tracker = envInjector.get(SkyraRouterTracker);
    assert.ok(tracker);

    // Simulate NavigationEnd
    routerEvents$.next(
      new NavigationEnd(1, '/customers/list?secretToken=xyz', '/customers/list?secretToken=xyz')
    );

    const service = envInjector.get(SkyraLoggerService);
    await service.flush();

    const events = memory.getEvents();
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.event.action, 'angular.navigation.completed');
    assert.equal(ev.http?.route, '/customers/list');
    assert.ok(!ev.message.includes('secretToken'));

    tracker.ngOnDestroy();
  });

  it('50. skyraHttpInterceptor measures HTTP request duration and records outcome', async () => {
    const memory = new MemoryTransport();

    const envInjector = createEnvironmentInjector(
      [
        provideSkyraLogger({
          projectId: 'angular-http',
          serviceName: 'angular-web',
          environment: 'production',
          transport: memory,
        }),
      ],
      Injector.NULL as unknown as import('@angular/core').EnvironmentInjector
    );

    // Execute inside injection context
    runInInjectionContext(envInjector, () => {
      const req = new HttpRequest('GET', 'https://api.skyra.com/v1/invoices?auth=token123');
      const next = () => of(new HttpResponse({ status: 200, statusText: 'OK' }));

      skyraHttpInterceptor(req, next).subscribe();
    });

    const service = envInjector.get(SkyraLoggerService);
    await service.flush();

    const events = memory.getEvents();
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.event.action, 'angular.http.completed');
    assert.equal(ev.http?.response?.status_code, 200);
    assert.equal(ev.http?.route, '/v1/invoices');
    assert.ok(ev.event.duration! >= 0);
  });
});
