import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @skyra/logger-react - SkyraLoggerProvider Component
 */
import { useMemo, useEffect, useRef } from 'react';
import { createSkyraBrowserLogger, } from '@skyra/logger-browser';
import { SkyraLoggerReactContext } from './skyra-logger-context.js';
export function SkyraLoggerProvider({ children, logger, config, }) {
    const isOwnerRef = useRef(false);
    const activeLogger = useMemo(() => {
        if (logger) {
            isOwnerRef.current = false;
            return logger;
        }
        if (config) {
            isOwnerRef.current = true;
            return createSkyraBrowserLogger(config);
        }
        // Default fallback
        isOwnerRef.current = true;
        return createSkyraBrowserLogger({
            projectId: 'skyra-react',
            serviceName: 'react-app',
            environment: 'development',
            transport: { type: 'console' },
        });
    }, [logger, config]);
    useEffect(() => {
        return () => {
            // Only dispose if this provider instance owns the logger
            if (isOwnerRef.current) {
                void activeLogger.dispose();
            }
        };
    }, [activeLogger]);
    return (_jsx(SkyraLoggerReactContext.Provider, { value: activeLogger, children: children }));
}
//# sourceMappingURL=skyra-logger-provider.js.map