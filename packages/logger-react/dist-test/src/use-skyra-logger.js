/**
 * @skyra/logger-react - useSkyraLogger Hook
 */
import { useContext } from 'react';
import { SkyraLoggerReactContext, getFallbackLogger } from './skyra-logger-context.js';
export function useSkyraLogger() {
    const contextLogger = useContext(SkyraLoggerReactContext);
    if (!contextLogger) {
        return getFallbackLogger();
    }
    return contextLogger;
}
//# sourceMappingURL=use-skyra-logger.js.map