# @skyra/logger-react

> Production-grade React structured logging integration, Context Provider, `useSkyraLogger` hook, and Error Boundary for Skyra LogHub.

Compatible with React 18, React 19, React StrictMode, Next.js client components, Vite, and Remix.

## Installation

```bash
npm install @skyra/logger-react @skyra/logger-browser
# or
pnpm add @skyra/logger-react @skyra/logger-browser
```

## Quick Start

Wrap your application tree in `SkyraLoggerProvider`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SkyraLoggerProvider } from '@skyra/logger-react';
import { App } from './App';

const container = document.getElementById('root')!;
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <SkyraLoggerProvider
      config={{
        projectId: 'skyra-portal',
        serviceName: 'portal-ui',
        environment: 'production',
        level: 'info',
        transport: {
          type: 'http',
          url: 'https://logs.skyra-tech.com/v1/events',
          allowedOrigins: ['https://logs.skyra-tech.com'],
        },
      }}
    >
      <App />
    </SkyraLoggerProvider>
  </React.StrictMode>
);
```

## Hook Usage (`useSkyraLogger`)

```tsx
import React, { useEffect } from 'react';
import { useSkyraLogger } from '@skyra/logger-react';

export function Dashboard() {
  const logger = useSkyraLogger();

  useEffect(() => {
    logger.info('Dashboard mounted', { component: 'dashboard' });
  }, [logger]);

  const handleCheckout = () => {
    const timer = logger.startTimer('checkout.process');
    try {
      processPayment();
      timer.stop({ outcome: 'success' });
    } catch (err) {
      timer.stop({ error: err });
    }
  };

  return <button onClick={handleCheckout}>Pay</button>;
}
```

## Error Boundary

```tsx
import React from 'react';
import { SkyraErrorBoundary } from '@skyra/logger-react';
import { WidgetGrid } from './WidgetGrid';

export function AnalyticsSection() {
  return (
    <SkyraErrorBoundary
      fallbackRender={({ error, resetError }) => (
        <div role="alert">
          <h3>Failed to load analytics</h3>
          <p>{error.message}</p>
          <button onClick={resetError}>Retry</button>
        </div>
      )}
    >
      <WidgetGrid />
    </SkyraErrorBoundary>
  );
}
```

## Navigation Tracking

```tsx
import { useSkyraNavigationTracker } from '@skyra/logger-react';

export function RouteWatcher({ currentPath }: { currentPath: string }) {
  useSkyraNavigationTracker(currentPath);
  return null;
}
```
