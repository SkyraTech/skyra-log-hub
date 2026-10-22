# @skyra/logger-angular

> Production-grade Angular logging integration and automatic error/router observability for Skyra LogHub.

Seamless standalone application integration, Angular `ErrorHandler` exception capture, `Router` navigation tracking, and opt-in `HttpInterceptorFn`.

## Installation

```bash
npm install @skyra/logger-angular @skyra/logger-browser
# or
pnpm add @skyra/logger-angular @skyra/logger-browser
```

## Quick Start (Angular Standalone Application)

In your `app.config.ts`:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideSkyraLogger } from '@skyra/logger-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideSkyraLogger({
      projectId: 'skyra-portal',
      serviceName: 'angular-web',
      environment: 'production',
      level: 'info',
      transport: {
        type: 'http',
        url: 'https://logs.skyra-tech.com/v1/events',
        allowedOrigins: ['https://logs.skyra-tech.com'],
      },
    }, {
      withErrorHandler: true,    // Intercepts uncaught Angular template and lifecycle errors
      withRouterTracking: true,  // Automatically logs NavigationEnd and NavigationError
    }),
  ],
};
```

## Component Usage

```typescript
import { Component, OnInit } from '@angular/core';
import { SkyraLoggerService } from '@skyra/logger-angular';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `<h1>Dashboard</h1>`,
})
export class DashboardComponent implements OnInit {
  constructor(private readonly logger: SkyraLoggerService) {}

  ngOnInit(): void {
    this.logger.info('DashboardComponent initialized', { component: 'dashboard' });
  }

  onAction(): void {
    const timer = this.logger.startTimer('widget.load');
    try {
      // Perform operation
      timer.stop({ outcome: 'success' });
    } catch (err) {
      timer.stop({ error: err });
    }
  }
}
```

## HTTP Interceptor

Add `skyraHttpInterceptor` to `provideHttpClient(withInterceptors([skyraHttpInterceptor]))`:

```typescript
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { skyraHttpInterceptor } from '@skyra/logger-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([skyraHttpInterceptor])),
  ],
};
```
