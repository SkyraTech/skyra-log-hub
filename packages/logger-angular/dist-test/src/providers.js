/**
 * @skyra/logger-angular - Standalone Application Providers
 */
import { makeEnvironmentProviders, ErrorHandler, } from '@angular/core';
import { SKYRA_LOGGER_CONFIG } from './tokens.js';
import { SkyraLoggerService } from './skyra-logger.service.js';
import { SkyraErrorHandler } from './skyra-error-handler.js';
import { SkyraRouterTracker } from './skyra-router-tracker.js';
export { SKYRA_LOGGER_CONFIG };
export function provideSkyraLogger(config, options) {
    const providers = [
        { provide: SKYRA_LOGGER_CONFIG, useValue: config },
        SkyraLoggerService,
    ];
    if (options?.withErrorHandler !== false) {
        providers.push({
            provide: ErrorHandler,
            useClass: SkyraErrorHandler,
        });
    }
    if (options?.withRouterTracking) {
        providers.push(SkyraRouterTracker);
    }
    return makeEnvironmentProviders(providers);
}
//# sourceMappingURL=providers.js.map