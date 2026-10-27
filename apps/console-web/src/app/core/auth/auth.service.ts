import { Injectable, signal, computed, inject } from '@angular/core';
import { AuthSession, UserProfile, UserRole } from './auth.models';
import { AppConfigService } from '../config/app-config.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly configService = inject(AppConfigService);

  private readonly _session = signal<AuthSession>({
    isAuthenticated: true,
    user: {
      id: 'usr-dev-alex',
      email: 'alex@skyra-tech.com',
      fullName: 'Alex Vance',
      roles: ['OrgAdmin', 'Developer'],
      tenantId: '00000000-0000-0000-0000-000000000001',
      allowedProjects: ['skyra-tech', 'auth-service', 'billing-api']
    },
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    isPreviewSession: true // Explicitly identified as dev preview mode
  });

  readonly session = this._session.asReadonly();
  readonly isAuthenticated = computed(() => this._session().isAuthenticated);
  readonly currentUser = computed(() => this._session().user);
  readonly isPreviewSession = computed(() => this._session().isPreviewSession);

  readonly isOrgAdmin = computed(() => this.hasRole('OrgAdmin') || this.hasRole('OrgOwner'));
  readonly isDeveloper = computed(() => this.hasRole('Developer') || this.isOrgAdmin());

  hasRole(role: UserRole): boolean {
    const user = this._session().user;
    if (!user) return false;
    return user.roles.includes(role);
  }

  logout(): void {
    this._session.set({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      isPreviewSession: false
    });
  }

  loginPreview(user: UserProfile): void {
    this._session.set({
      isAuthenticated: true,
      user,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      isPreviewSession: true
    });
  }
}
