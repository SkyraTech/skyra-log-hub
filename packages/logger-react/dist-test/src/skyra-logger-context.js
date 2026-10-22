/**
 * @skyra/logger-react - React Context Definition & Fallback
 */
import React from 'react';
import { createSkyraBrowserLogger, } from '@skyra/logger-browser';
let fallbackLoggerInstance = null;
export function getFallbackLogger() {
    if (!fallbackLoggerInstance) {
        fallbackLoggerInstance = createSkyraBrowserLogger({
            projectId: 'skyra-react-fallback',
            serviceName: 'react-app',
            environment: 'development',
            transport: { type: 'console' },
        });
    }
    return fallbackLoggerInstance;
}
export const SkyraLoggerReactContext = React.createContext(null);
//# sourceMappingURL=skyra-logger-context.js.map