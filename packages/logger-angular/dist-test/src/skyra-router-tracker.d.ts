/**
 * @skyra/logger-angular - Angular Router Navigation Tracker
 */
import { OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { SkyraLoggerService } from './skyra-logger.service.js';
export declare class SkyraRouterTracker implements OnDestroy {
    private readonly _logger;
    private readonly _router?;
    private _subscription?;
    private _previousRoute?;
    constructor(_logger: SkyraLoggerService, _router?: Router | undefined);
    private _handleRouterEvent;
    private _sanitizeUrl;
    ngOnDestroy(): void;
}
//# sourceMappingURL=skyra-router-tracker.d.ts.map