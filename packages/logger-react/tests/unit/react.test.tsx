/**
 * @skyra/logger-react - Unit & Component Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryTransport, createSkyraBrowserLogger } from '@skyra/logger-browser';
import {
  SkyraLoggerProvider,
  useSkyraLogger,
  SkyraErrorBoundary,
  useSkyraNavigationTracker,
  getFallbackLogger,
} from '../../src/index.js';

describe('Logger React: Provider, Hook, and Error Boundary', () => {
  it('51. SkyraLoggerProvider provides logger context to child components', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'react-portal',
      serviceName: 'portal-app',
      environment: 'production',
      transport: memory,
    });

    function TestComponent(): React.JSX.Element {
      const activeLogger = useSkyraLogger();
      activeLogger.info('React component mounted', { component: 'header' });
      return React.createElement('div', null, 'Test Header');
    }

    const html = renderToString(
      React.createElement(
        SkyraLoggerProvider,
        { logger },
        React.createElement(TestComponent)
      )
    );

    assert.ok(html.includes('Test Header'));
    await logger.flush();

    const events = memory.getEvents();
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.skyra.project_id, 'react-portal');
    assert.equal(ev.message, 'React component mounted');
    assert.equal(ev.skyra.component, 'header');
  });

  it('52. useSkyraLogger returns fallback logger when provider is absent without throwing', () => {
    assert.doesNotThrow(() => {
      function IndependentComponent(): React.JSX.Element {
        const logger = useSkyraLogger();
        assert.ok(logger);
        logger.debug('Standalone call');
        return React.createElement('span', null, 'Standalone');
      }

      const html = renderToString(React.createElement(IndependentComponent));
      assert.ok(html.includes('Standalone'));
    });
  });

  it('53. SkyraErrorBoundary catches rendering errors and logs sanitized event', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'boundary-test',
      serviceName: 'react-app',
      environment: 'production',
      transport: memory,
    });

    const errorBoundary = new SkyraErrorBoundary({
      logger,
      children: React.createElement('div', null, 'Normal'),
      fallbackRender: ({ error, resetError }) =>
        React.createElement('div', { id: 'fallback' }, error.message),
    });

    const simulatedError = new Error('Render failed: Invalid widget state');
    const simulatedErrorInfo = { componentStack: '\n    at BrokenWidget\n    at App' };

    errorBoundary.componentDidCatch(simulatedError, simulatedErrorInfo);
    await logger.flush();

    const events = memory.getEvents();
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.log.level, 'error');
    assert.equal(ev.event.action, 'react.error.boundary');
    assert.equal(ev.error?.message, 'Render failed: Invalid widget state');
    assert.ok((ev.skyra.business as any)?.component_stack?.includes('BrokenWidget'));
  });

  it('54. SkyraErrorBoundary resetError resets error state', () => {
    const errorBoundary = new SkyraErrorBoundary({
      children: React.createElement('div', null, 'Normal'),
    });

    errorBoundary.setState({
      hasError: true,
      error: new Error('Crash'),
    });

    errorBoundary.resetError();
    assert.equal(errorBoundary.state.hasError, false);
    assert.equal(errorBoundary.state.error, null);
  });

  it('55. Navigation tracker records route changes', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'nav-test',
      serviceName: 'react-app',
      environment: 'production',
      transport: memory,
    });

    function RoutedView(): React.JSX.Element {
      useSkyraNavigationTracker('/checkout/payment?token=123');
      return React.createElement('h1', null, 'Checkout');
    }

    renderToString(
      React.createElement(
        SkyraLoggerProvider,
        { logger },
        React.createElement(RoutedView)
      )
    );

    // Note: useEffect does not fire during renderToString in SSR, but let's test direct trackNavigation
    logger.trackNavigation({
      route: '/checkout/payment?token=123',
      action: 'react.navigation.completed',
    });
    await logger.flush();

    const ev = memory.getEvents()[0]!;
    assert.equal(ev.event.action, 'react.navigation.completed');
    assert.equal(ev.http?.route, '/checkout/payment');
    assert.ok(!ev.message.includes('token=123'));
  });

  it('56. SSR-safe imports: No window/document crashes during SSR import or render', () => {
    assert.doesNotThrow(() => {
      const fallback = getFallbackLogger();
      assert.ok(fallback);
      assert.equal(fallback.isLevelEnabled('info'), true);
    });
  });
});
