import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonComponent } from '../../shared/ui/button/button.component';

@Component({
  selector: 'skyra-not-found',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonComponent],
  template: `
    <div class="not-found-container">
      <div class="error-badge font-mono">404 ERROR</div>
      <h1 class="error-title">Page Not Found</h1>
      <p class="error-desc">
        The requested console route does not exist or may have been moved.
      </p>
      <div class="actions">
        <a routerLink="/overview" aria-label="Return to Overview">
          <skyra-button variant="primary" size="md">
            Return to Overview
          </skyra-button>
        </a>
      </div>
    </div>
  `,
  styles: [`
    .not-found-container {
      min-height: 70vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-8, 32px) var(--space-4, 16px);
    }
    .error-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: var(--skyra-radius-full, 9999px);
      background-color: rgba(220, 38, 38, 0.1);
      color: var(--skyra-danger, #dc2626);
      border: 1px solid rgba(220, 38, 38, 0.25);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      margin-bottom: var(--space-3, 12px);
    }
    .error-title {
      font-family: var(--skyra-font-display, 'Outfit', sans-serif);
      font-size: 32px;
      font-weight: 700;
      color: var(--skyra-text, #0f172a);
      margin: 0 0 var(--space-2, 8px) 0;
    }
    .error-desc {
      font-size: 14px;
      color: var(--skyra-text-muted, #64748b);
      max-width: 440px;
      margin: 0 0 var(--space-6, 24px) 0;
      line-height: 1.5;
    }
    .actions {
      display: flex;
      gap: var(--space-3, 12px);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
