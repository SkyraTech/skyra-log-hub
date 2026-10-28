import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'skyra-unauthorized',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="unauth-container">
      <div class="unauth-card">
        <div class="icon-wrap">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <h1 class="title">Access Restricted</h1>
        <p class="description">
          Your authenticated principal does not have the required role or permission to access this resource within the active workspace.
        </p>

        <div class="details-panel" *ngIf="user()">
          <div class="detail-row">
            <span class="label">Principal:</span>
            <span class="value">{{ user()?.email }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Roles:</span>
            <span class="value">{{ user()?.roles?.join(', ') }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Workspace:</span>
            <span class="value">{{ user()?.tenantId }}</span>
          </div>
        </div>

        <div class="actions">
          <button type="button" class="btn btn-primary" (click)="goBack()">
            Return to Overview
          </button>
          <button type="button" class="btn btn-secondary" (click)="logout()">
            Sign out & Switch Account
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .unauth-container {
      min-height: 80vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .unauth-card {
      max-width: 520px;
      width: 100%;
      background: var(--skyra-surface, #ffffff);
      border: 1px solid rgba(220, 38, 38, 0.25);
      border-radius: var(--skyra-radius-lg, 14px);
      padding: 2.5rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.25rem;
      box-shadow: var(--skyra-shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.15));
    }

    .icon-wrap {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: rgba(220, 38, 38, 0.1);
      color: var(--skyra-danger, #dc2626);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .title {
      font-family: var(--skyra-font-display, 'Outfit', sans-serif);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--skyra-text, #0f172a);
      margin: 0;
    }

    .description {
      font-size: 0.9375rem;
      line-height: 1.5;
      color: var(--skyra-text-muted, #64748b);
      margin: 0;
    }

    .details-panel {
      width: 100%;
      background: var(--skyra-bg, #f4f7fc);
      border: 1px solid var(--skyra-border, #e2e8f0);
      border-radius: var(--skyra-radius-sm, 6px);
      padding: 1rem;
      text-align: left;
      font-size: 0.8125rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
    }

    .label {
      color: var(--skyra-text-muted, #64748b);
    }

    .value {
      color: var(--skyra-text, #0f172a);
      font-weight: 500;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      width: 100%;
      margin-top: 0.5rem;
    }

    .btn {
      flex: 1;
      padding: 0.75rem 1rem;
      border-radius: var(--skyra-radius-sm, 6px);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-primary {
      background: var(--skyra-primary, #0A58CA);
      color: #ffffff;
      border: none;
    }

    .btn-primary:hover {
      background: var(--skyra-primary-hover, #0847a8);
    }

    .btn-secondary {
      background: var(--skyra-bg, #f4f7fc);
      color: var(--skyra-text, #0f172a);
      border: 1px solid var(--skyra-border, #e2e8f0);
    }

    .btn-secondary:hover {
      background: var(--skyra-surface, #ffffff);
      border-color: var(--skyra-primary, #0A58CA);
    }
  `]
})
export class UnauthorizedComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.authService.currentUser;

  goBack(): void {
    this.router.navigate(['/overview']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
