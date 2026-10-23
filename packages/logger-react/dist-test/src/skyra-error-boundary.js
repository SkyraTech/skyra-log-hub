import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @skyra/logger-react - SkyraErrorBoundary Component
 */
import { Component } from 'react';
import { SkyraLoggerReactContext, getFallbackLogger } from './skyra-logger-context.js';
export class SkyraErrorBoundary extends Component {
    static contextType = SkyraLoggerReactContext;
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
        };
        this.resetError = this.resetError.bind(this);
    }
    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            error,
        };
    }
    componentDidCatch(error, errorInfo) {
        const logger = this.props.logger ?? this.context ?? getFallbackLogger();
        logger.error(`React Error Boundary caught: ${error.message}`, {
            error,
            action: 'react.error.boundary',
            component_stack: errorInfo.componentStack ? String(errorInfo.componentStack).slice(0, 4096) : undefined,
        });
        if (this.props.onError) {
            try {
                this.props.onError(error, errorInfo);
            }
            catch {
                // Prevent boundary failure
            }
        }
    }
    resetError() {
        this.state = {
            hasError: false,
            error: null,
        };
        try {
            this.setState({
                hasError: false,
                error: null,
            });
        }
        catch {
            // Ignored if unmounted
        }
    }
    render() {
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
            return (_jsxs("div", { style: { padding: '16px', color: '#d32f2f', fontFamily: 'sans-serif' }, children: [_jsx("h2", { children: "Something went wrong" }), _jsx("p", { children: this.state.error.message })] }));
        }
        return this.props.children;
    }
}
//# sourceMappingURL=skyra-error-boundary.js.map