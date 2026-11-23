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
    isAuthenticated: false,
    user: null,
    expiresAt: null,
    idleExpiresAt: null,
    csrfToken: null,
    isPreviewSession: false,
  });

  private authEpoch=0;
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

  readonly sessionUnavailable=signal(false);

  readonly session = this._session.asReadonly();
  readonly isAuthenticated = computed(() => {
    const session = this._session();
    return session.isAuthenticated && (!session.isPreviewSession || this.isPreviewAuthorityAllowed());
  });
  readonly currentUser = computed(() => this.isAuthenticated() ? this._session().user : null);
  readonly isPreviewSession = computed(() => this._session().isPreviewSession && this.isPreviewAuthorityAllowed());
  readonly csrfToken = computed(() => this.isAuthenticated() ? (this._session().csrfToken ?? '') : '');

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
      this.authEpoch++;
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
    const user = this.currentUser();
    if (!user) return false;
    return user.roles.includes(role);
  }

  private isPreviewAuthorityAllowed(): boolean {
    const config = this.configService?.config();
    return config?.previewMode === true && config.previewIsolation === true && config.environment === 'development';
  }

  public logout(): void {
    this.authEpoch++;
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
    let providerLogoutUrl:string|undefined;
    let csrf = this._session().csrfToken;
    if(!csrf||(this.http&&!this.isPreviewSession())){const hydrated=await this.bootstrapSession();if(!hydrated){if(this.sessionUnavailable())throw new Error('Sign-out is unavailable. Retry when the service recovers.');this.logout();return;}csrf=this._session().csrfToken;}
    const bffUrl = this.configService?.config().adminApiBaseUrl || 'http://127.0.0.1:3200';

    try {
      if (this.http) {
        const result=await this.http.post<{providerLogoutUrl?:string}>(
          `${bffUrl}/bff/auth/logout`,
          {},
          {
            withCredentials: true,
            headers: csrf ? { 'X-CSRF-Token': csrf } : {},
          },
        ).toPromise();
        providerLogoutUrl=result?.providerLogoutUrl;
      }
    } catch (error:any) {
      if(error?.status!==401&&error?.status!==419){this.sessionUnavailable.set(true);throw new Error('Sign-out is unavailable. Retry when the service recovers.');}
    }

    this.logout();
    if(providerLogoutUrl && typeof window!=='undefined') {
      const destination=new URL(providerLogoutUrl);
      if(destination.protocol==='https:' || (destination.protocol==='http:' && destination.hostname==='127.0.0.1'))window.location.assign(destination.href);
    }
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
    const epoch=this.authEpoch;

    try {
      const data = await this.http.get<BffSessionDto>(`${bffUrl}/bff/session`, {
        withCredentials: true,
      }).toPromise();

      if(epoch!==this.authEpoch)return false;
      if (data && data.authenticated && data.user) {
        this.sessionUnavailable.set(false);
        const roles: UserRole[] = data.user.roles.map((r) => {
          if (['OrgOwner','OrgAdmin','ProjectAdmin','Developer','Viewer'].includes(r)) return r as UserRole;
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
            tenantId: data.activeTenantId ?? '',
            allowedProjects: data.availableProjects.map((p) => p.projectId),
          },
          expiresAt: data.expiresAt,
          idleExpiresAt: data.idleExpiresAt,
          csrfToken: data.csrfToken,
          isPreviewSession: false,
        });
        return true;
      }
    } catch (error:any) {
      if(epoch!==this.authEpoch)return false;
      if(error?.status!==401&&error?.status!==419){this.sessionUnavailable.set(true);return false;}
    }
    this.sessionUnavailable.set(false);

    this.logout();
    return false;
  }

  public loginPreview(user: UserProfile): void {
    const config = this.configService?.config();
    if (!config?.previewMode || !config.previewIsolation || config.environment !== 'development') return;
    this._session.set({
      isAuthenticated: true,
      user,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      idleExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      csrfToken: 'isolated-preview-csrf-token',
      isPreviewSession: true
    });
  }
}
