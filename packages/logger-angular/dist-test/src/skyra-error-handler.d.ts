/**
 * @skyra/logger-angular - Angular ErrorHandler Integration
 */
import { ErrorHandler } from '@angular/core';
import { SkyraLoggerService } from './skyra-logger.service.js';
export declare class SkyraErrorHandler implements ErrorHandler {
    private readonly _logger;
    private readonly _originalHandler?;
    constructor(_logger: SkyraLoggerService, _originalHandler?: ErrorHandler | undefined);
    handleError(error: unknown): void;
}
//# sourceMappingURL=skyra-error-handler.d.ts.map