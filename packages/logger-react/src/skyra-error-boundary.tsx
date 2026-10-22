/**
 * @skyra/logger-react - SkyraErrorBoundary Component
 */

import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import type { SkyraBrowserLogger } from '@skyra/logger-browser';
import { SkyraLoggerReactContext, getFallbackLogger } from './skyra-logger-context.js';

export interface SkyraErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
  readonly fallbackRender?: (props: {
    error: Error;
    resetError: () => void;
  }) => ReactNode;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
  readonly logger?: SkyraBrowserLogger;
}

interface SkyraErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SkyraErrorBoundary extends Component<
  SkyraErrorBoundaryProps,
  SkyraErrorBoundaryState
> {
  static override contextType = SkyraLoggerReactContext;
  declare context: SkyraBrowserLogger | null;

  constructor(props: SkyraErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
    this.resetError = this.resetError.bind(this);
  }

  static getDerivedStateFromError(error: Error): SkyraErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const logger = this.props.logger ?? this.context ?? getFallbackLogger();

    logger.error(`React Error Boundary caught: ${error.message}`, {
      error,
      action: 'react.error.boundary',
      component_stack: errorInfo.componentStack ? String(errorInfo.componentStack).slice(0, 4096) : undefined,
    });

    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch {
        // Prevent boundary failure
      }
    }
  }

  public resetError(): void {
    this.setState({
      hasError: false,
      error: null,
    });
  }

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          error: this.state.error,
          resetError: this.resetError,
        });
      }
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      return (
        <div style={{ padding: '16px', color: '#d32f2f', fontFamily: 'sans-serif' }}>
          <h2>Something went wrong</h2>
          <p>{this.state.error.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
