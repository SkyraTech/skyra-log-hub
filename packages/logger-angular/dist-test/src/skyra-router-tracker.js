/**
 * @skyra/logger-angular - Angular Router Navigation Tracker
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Injectable, Optional, Inject } from '@angular/core';
import { Router, NavigationEnd, NavigationError } from '@angular/router';
import { SkyraLoggerService } from './skyra-logger.service.js';
let SkyraRouterTracker = class SkyraRouterTracker {
    constructor(_logger, _router) {
        this._logger = _logger;
        this._router = _router;
        if (this._router && typeof this._router.events?.subscribe === 'function') {
            this._subscription = this._router.events.subscribe((event) => {
                this._handleRouterEvent(event);
            });
        }
    }
    _handleRouterEvent(event) {
        if (event instanceof NavigationEnd) {
            const cleanUrl = this._sanitizeUrl(event.urlAfterRedirects || event.url);
            this._logger.info(`Angular Navigation: ${cleanUrl}`, {
                action: 'angular.navigation.completed',
                outcome: 'success',
                route: cleanUrl,
                previous_route: this._previousRoute,
                http: {
                    route: cleanUrl,
                },
            });
            this._previousRoute = cleanUrl;
        }
        else if (event instanceof NavigationError) {
            const cleanUrl = this._sanitizeUrl(event.url);
            this._logger.error(`Angular Navigation Failed: ${cleanUrl}`, {
                action: 'angular.navigation.failed',
                outcome: 'failure',
                route: cleanUrl,
                previous_route: this._previousRoute,
                error: event.error,
                http: {
                    route: cleanUrl,
                },
            });
        }
    }
    _sanitizeUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string')
            return '/';
        const clean = rawUrl.trim().split('?')[0].split('#')[0];
        return clean.startsWith('/') ? clean : `/${clean}`;
    }
    ngOnDestroy() {
        if (this._subscription) {
            this._subscription.unsubscribe();
            this._subscription = undefined;
        }
    }
};
SkyraRouterTracker = __decorate([
    Injectable({
        providedIn: 'root',
    }),
    __param(0, Inject(SkyraLoggerService)),
    __param(1, Optional()),
    __param(1, Inject(Router)),
    __metadata("design:paramtypes", [SkyraLoggerService,
        Router])
], SkyraRouterTracker);
export { SkyraRouterTracker };
//# sourceMappingURL=skyra-router-tracker.js.map