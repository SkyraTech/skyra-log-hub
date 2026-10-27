import { Injectable, signal, computed, inject, type OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthSession, UserProfile, UserRole, BffSessionDto, AuthBroadcastMessage } from './auth.models';
import { AppConfigService } from '../config/app-config.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private http: HttpClient | null = null;
  private configService: AppConfigService | null = null;

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
    idleExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    csrfToken: 'dev-csrf-token-placeholder',
    isPreviewSession: true // Explicitly identified as dev preview mode
  });

  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    try {
      this.http = inject(HttpClient, { optional: true });
      this.configService = inject(AppConfigService, { optional: true });
    } catch {
      // In direct non-DI unit tests
    }
    this.initBroadcastChannel();
  }

  readonly session = this._session.asReadonly();
  readonly isAuthenticated = computed(() => this._session().isAuthenticated);
  readonly currentUser = computed(() => this._session().user);
  readonly isPreviewSession = computed(() => this._session().isPreviewSession);
  readonly csrfToken = computed(() => this._session().csrfToken ?? '');

  readonly isOrgAdmin = computed(() => this.hasRole('OrgAdmin') || this.hasRole('OrgOwner'));
  readonly isDeveloper = computed(() => this.hasRole('Developer') || this.isOrgAdmin());

  public ngOnDestroy(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  }

  private initBroadcastChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('skyra-auth-channel');
        this.broadcastChannel.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
          this.handleBroadcastMessage(event.data);
        };
      } catch {
        // BroadcastChannel unavailable in this environment
      }
    }
  }

  private handleBroadcastMessage(msg: AuthBroadcastMessage): void {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'AUTH_LOGOUT') {
      this._session.set({
        isAuthenticated: false,
        user: null,
        expiresAt: null,
        idleExpiresAt: null,
        csrfToken: null,
        isPreviewSession: false,
      });
    } else if (msg.type === 'AUTH_LOGIN') {
      void this.bootstrapSession();
    }
  }

  public notifyLogoutBroadcast(): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'AUTH_LOGOUT',
          timestamp: Date.now(),
        });
      } catch {
        // Silently catch
      }
    }
  }

  public notifyLoginBroadcast(): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'AUTH_LOGIN',
          timestamp: Date.now(),
        });
      } catch {
        // Silently catch
      }
    }
  }

  public hasRole(role: UserRole): boolean {
    const user = this._session().user;
    if (!user) return false;
    return user.roles.includes(role);
  }

  public logout(): void {
    this._session.set({
      isAuthenticated: false,
      user: null,
      expiresAt: null,
      idleExpiresAt: null,
      csrfToken: null,
      isPreviewSession: false
    });
    this.notifyLogoutBroadcast();
  }

  public async logoutFromBff(): Promise<void> {
    const csrf = this._session().csrfToken;
    const bffUrl = this.configService?.config().adminApiBaseUrl || 'http://127.0.0.1:3200';

    try {
      if (this.http) {
        await this.http.post(
          `${bffUrl}/bff/auth/logout`,
          {},
          {
            withCredentials: true,
            headers: csrf ? { 'X-CSRF-Token': csrf } : {},
          },
        ).toPromise();
      }
    } catch {
      // Proceed with local logout regardless of network status
    }

    this.logout();
  }

  public loginWithOidc(returnUrl?: string): void {
    const bffUrl = this.configService?.config().adminApiBaseUrl || 'http://127.0.0.1:3200';
    const destination = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
    if (typeof window !== 'undefined') {
      window.location.href = `${bffUrl}/bff/auth/login${destination}`;
    }
  }

  public async bootstrapSession(): Promise<boolean> {
    const bffUrl = this.configService?.config().adminApiBaseUrl || 'http://127.0.0.1:3200';
    if (!this.http) return false;

    try {
      const data = await this.http.get<BffSessionDto>(`${bffUrl}/bff/session`, {
        withCredentials: true,
      }).toPromise();

      if (data && data.authenticated && data.user) {
        const roles: UserRole[] = data.user.roles.map((r) => {
          if (['admin', 'OrgAdmin'].includes(r)) return 'OrgAdmin';
          if (['analyst', 'Developer'].includes(r)) return 'Developer';
          return 'Viewer';
        });

        this._session.set({
          isAuthenticated: true,
          user: {
            id: data.user.id,
            email: data.user.email,
            fullName: data.user.name,
            roles,
            tenantId: data.activeTenantId ?? 'default-tenant',
            allowedProjects: data.availableProjects.map((p) => p.projectId),
          },
          expiresAt: data.expiresAt,
          idleExpiresAt: data.idleExpiresAt,
          csrfToken: data.csrfToken,
          isPreviewSession: false,
        });
        return true;
      }
    } catch {
      // Session does not exist or unauthenticated
    }

    return false;
  }

  public loginPreview(user: UserProfile): void {
    this._session.set({
      isAuthenticated: true,
      user,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      idleExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      csrfToken: 'preview-csrf-token',
      isPreviewSession: true
    });
  }
}
