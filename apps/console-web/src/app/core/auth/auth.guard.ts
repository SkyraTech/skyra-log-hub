import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';
import { AppConfigService } from '../config/app-config.service';

export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  const denied=()=>router.createUrlTree(['/login'],{queryParams:{returnUrl:state.url}});
  return inject(AppConfigService).config().previewMode?denied():authService.bootstrapSession().then(ok=>ok||denied());
};

export const orgAdminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    if(!inject(AppConfigService).config().previewMode)return authService.bootstrapSession().then(ok=>!ok?router.createUrlTree(['/login']):authService.isOrgAdmin()?true:router.createUrlTree(['/unauthorized']));
    return router.createUrlTree(['/login']);
  }

  if (authService.isOrgAdmin()) {
    return true;
  }

  return router.createUrlTree(['/unauthorized']);
};

export const roleGuard = (requiredRole: 'OrgOwner' | 'OrgAdmin' | 'ProjectAdmin' | 'Developer' | 'Viewer'): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isAuthenticated()) {
      if(!inject(AppConfigService).config().previewMode)return authService.bootstrapSession().then(ok=>!ok?router.createUrlTree(['/login']):authService.hasRole(requiredRole)||authService.isOrgAdmin()?true:router.createUrlTree(['/unauthorized']));
      return router.createUrlTree(['/login']);
    }

    if (authService.hasRole(requiredRole) || authService.isOrgAdmin()) {
      return true;
    }

    return router.createUrlTree(['/unauthorized']);
  };
};
