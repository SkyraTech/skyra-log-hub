/**
 * @skyra/logger-angular - Angular Router Navigation Tracker
 */

import { Injectable, Optional, OnDestroy, Inject } from '@angular/core';
import { Router, NavigationEnd, NavigationError, Event as RouterEvent } from '@angular/router';
import { Subscription } from 'rxjs';
import { SkyraLoggerService } from './skyra-logger.service.js';

@Injectable({
  providedIn: 'root',
})
export class SkyraRouterTracker implements OnDestroy {
  private _subscription?: Subscription;
  private _previousRoute?: string;

  constructor(
    @Inject(SkyraLoggerService) private readonly _logger: SkyraLoggerService,
    @Optional() @Inject(Router) private readonly _router?: Router
  ) {
    if (this._router && typeof this._router.events?.subscribe === 'function') {
      this._subscription = this._router.events.subscribe((event: RouterEvent) => {
        this._handleRouterEvent(event);
      });
    }
  }

  private _handleRouterEvent(event: RouterEvent): void {
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
    } else if (event instanceof NavigationError) {
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

  private _sanitizeUrl(rawUrl: string): string {
    if (!rawUrl || typeof rawUrl !== 'string') return '/';
    const clean = rawUrl.trim().split('?')[0]!.split('#')[0]!;
    return clean.startsWith('/') ? clean : `/${clean}`;
  }

  public ngOnDestroy(): void {
    if (this._subscription) {
      this._subscription.unsubscribe();
      this._subscription = undefined;
    }
  }
}
