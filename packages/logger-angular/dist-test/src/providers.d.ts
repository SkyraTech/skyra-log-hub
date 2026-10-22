/**
 * @skyra/logger-angular - Standalone Application Providers
 */
import { type EnvironmentProviders } from '@angular/core';
import type { SkyraBrowserLoggerConfig } from '@skyra/logger-browser';
import { SKYRA_LOGGER_CONFIG } from './tokens.js';
export { SKYRA_LOGGER_CONFIG };
export interface SkyraAngularOptions {
    readonly withErrorHandler?: boolean;
    readonly withRouterTracking?: boolean;
}
export declare function provideSkyraLogger(config: SkyraBrowserLoggerConfig, options?: SkyraAngularOptions): EnvironmentProviders;
//# sourceMappingURL=providers.d.ts.map