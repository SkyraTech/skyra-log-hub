import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'skyra-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <!-- Brand Header -->
        <div class="brand-header">
          <div class="logo-mark">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="brand-text">
            <h1 class="brand-title">Skyra LogHub</h1>
            <span class="brand-subtitle">Enterprise Observability Console</span>
          </div>
        </div>

        <!-- Security / Status Badge -->
        <div class="security-banner">
          <span class="badge-icon">🔒</span>
          <span>Zero-Trust Enterprise SSO &middot; OIDC PKCE S256 Protected</span>
        </div>

        <!-- Error Alert if present -->
        <div *ngIf="errorMessage()" class="alert-box error-alert" role="alert">
          <span class="alert-icon">⚠️</span>
          <span>{{ errorMessage() }}</span>
        </div>

        <!-- Form / Action Block -->
        <div class="action-block">
          <p class="login-instructions">
            Sign in with your enterprise identity provider to access authorized tenant workspaces, telemetry archives, and query capabilities.
          </p>

          <button
            type="button"
            class="sso-button"
            id="btn-sso-login"
            (click)="onSsoLogin()"
            [disabled]="isLoading()"
          >
            <svg class="idp-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            <span>{{ isLoading() ? 'Redirecting to Identity Provider...' : 'Sign in with Single Sign-On (OIDC)' }}</span>
          </button>
        </div>

        <!-- Dev / Sandbox Quick Switcher -->
        <div class="sandbox-divider">
          <span>or develop locally</span>
        </div>

        <div class="sandbox-actions">
          <button
            type="button"
            class="sandbox-button"
            id="btn-mock-login"
            (click)="onDeveloperLogin()"
          >
            <span>Sign in as Principal Architect (Sandbox)</span>
          </button>
        </div>

        <!-- Footer Security Notes -->
        <div class="card-footer">
          <div class="footer-tag">Session: __Host-skyra-session (HTTP-only)</div>
          <div class="footer-tag">RFC 7807 Protected</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: radial-gradient(circle at 50% 20%, rgba(10, 88, 202, 0.1), transparent 70%),
                  var(--skyra-bg, #0B111E);
      font-family: inherit;
    }

    .login-card {
      width: 100%;
      max-width: 480px;
      background: var(--skyra-surface, #151D30);
      border: 1px solid var(--skyra-border, #1e293b);
      border-radius: var(--skyra-radius-lg, 14px);
      padding: 2.5rem;
      box-shadow: var(--skyra-shadow-lg, 0 20px 25px -5px rgba(0, 0, 0, 0.5));
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .brand-header {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .logo-mark {
      width: 48px;
      height: 48px;
      border-radius: var(--skyra-radius-md, 10px);
      background: linear-gradient(135deg, var(--skyra-primary, #0A58CA), var(--skyra-cyan, #00A3E0));
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(10, 88, 202, 0.3);
    }

    .brand-title {
      font-family: var(--skyra-font-display, 'Outfit', sans-serif);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--skyra-text, #ffffff);
      margin: 0;
      letter-spacing: -0.025em;
    }

    .brand-subtitle {
      font-size: 0.875rem;
      color: var(--skyra-text-muted, #94a3b8);
    }

    .security-banner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: var(--skyra-primary-light, rgba(10, 88, 202, 0.1));
      border: 1px solid rgba(10, 88, 202, 0.2);
      border-radius: var(--skyra-radius-sm, 6px);
      font-size: 0.75rem;
      color: var(--skyra-primary, #0A58CA);
    }

    :host-context([data-theme="dark"]) .security-banner,
    [data-theme="dark"] .security-banner {
      color: #93c5fd;
    }

    .alert-box {
      padding: 0.75rem 1rem;
      border-radius: var(--skyra-radius-sm, 6px);
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .error-alert {
      background: rgba(220, 38, 38, 0.1);
      border: 1px solid rgba(220, 38, 38, 0.3);
      color: var(--skyra-danger, #dc2626);
    }

    .login-instructions {
      font-size: 0.875rem;
      line-height: 1.5;
      color: var(--skyra-text-muted, #94a3b8);
      margin-bottom: 1.25rem;
    }

    .sso-button {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 0.875rem 1.25rem;
      background: var(--skyra-primary, #0A58CA);
      color: #ffffff;
      border: none;
      border-radius: var(--skyra-radius-sm, 6px);
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s ease, transform 0.1s ease;
    }

    .sso-button:hover:not(:disabled) {
      background: var(--skyra-primary-hover, #0847a8);
    }

    .sso-button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .sandbox-divider {
      position: relative;
      text-align: center;
      font-size: 0.75rem;
      color: var(--skyra-text-muted, #94a3b8);
      margin: 0.5rem 0;
    }

    .sandbox-divider::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 1px;
      background: var(--skyra-border, #1e293b);
      z-index: 0;
    }

    .sandbox-divider span {
      position: relative;
      background: var(--skyra-surface, #151D30);
      color: var(--skyra-text-muted, #94a3b8);
      padding: 0 0.75rem;
      z-index: 1;
    }

    .sandbox-button {
      width: 100%;
      padding: 0.75rem 1rem;
      background: transparent;
      color: var(--skyra-text-muted, #94a3b8);
      border: 1px solid var(--skyra-border, #1e293b);
      border-radius: var(--skyra-radius-sm, 6px);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .sandbox-button:hover {
      background: var(--skyra-primary-light, rgba(10, 88, 202, 0.1));
      color: var(--skyra-text, #ffffff);
      border-color: var(--skyra-primary, #0A58CA);
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid var(--skyra-border, #1e293b);
      padding-top: 1rem;
      font-size: 0.7rem;
      color: var(--skyra-text-muted, #94a3b8);
    }

    :host-context([data-theme="light"]) .sandbox-divider span,
    [data-theme="light"] .sandbox-divider span {
      color: #334155;
    }

    :host-context([data-theme="light"]) .card-footer,
    [data-theme="light"] .card-footer {
      color: #475569;
    }
  `]
})
export class LoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private returnUrl = '/overview';

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['returnUrl']) {
        this.returnUrl = params['returnUrl'];
      }
      if (params['error']) {
        this.errorMessage.set(decodeURIComponent(params['error']));
      } else if (params['expired']) {
        this.errorMessage.set('Your previous session has expired. Please sign in again.');
      }
    });
  }

  onSsoLogin(): void {
    this.isLoading.set(true);
    this.authService.loginWithOidc(this.returnUrl);
  }

  onDeveloperLogin(): void {
    this.authService.loginPreview({
      id: 'usr-arch-dinesh',
      email: 'lead-architect@skyra.dev',
      fullName: 'Principal Architect',
      roles: ['OrgAdmin', 'Developer'],
      tenantId: 'skyra-internal',
      allowedProjects: ['skyra-tech', 'auth-service', 'billing-api'],
    });
    this.router.navigateByUrl(this.returnUrl);
  }
}
