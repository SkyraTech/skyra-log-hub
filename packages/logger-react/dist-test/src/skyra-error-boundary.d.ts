/**
 * @skyra/logger-react - SkyraErrorBoundary Component
 */
import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import type { SkyraBrowserLogger } from '@skyra/logger-browser';
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
export declare class SkyraErrorBoundary extends Component<SkyraErrorBoundaryProps, SkyraErrorBoundaryState> {
    static contextType: React.Context<SkyraBrowserLogger | null>;
    context: SkyraBrowserLogger | null;
    constructor(props: SkyraErrorBoundaryProps);
    static getDerivedStateFromError(error: Error): SkyraErrorBoundaryState;
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
    resetError(): void;
    render(): ReactNode;
}
export {};
//# sourceMappingURL=skyra-error-boundary.d.ts.map