import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { OrganizationComponent } from './organization.component';
export const organizationSessionGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService), router = inject(Router);
  return await auth.bootstrapSession() || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
export const organizationChangesGuard: CanDeactivateFn<OrganizationComponent> = component => component.canLeave();
