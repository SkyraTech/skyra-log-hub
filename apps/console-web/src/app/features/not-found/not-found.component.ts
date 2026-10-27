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
        <a routerLink="/overview">
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
      padding: var(--space-8) var(--space-4);
    }
    .error-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: var(--radius-full);
      background-color: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      font-size: 11px;
      font-weight: var(--font-bold);
      letter-spacing: 0.05em;
      margin-bottom: var(--space-3);
    }
    .error-title {
      font-size: var(--text-3xl);
      font-weight: var(--font-bold);
      color: var(--text-primary);
      margin: 0 0 var(--space-2) 0;
    }
    .error-desc {
      font-size: var(--text-sm);
      color: var(--text-muted);
      max-width: 440px;
      margin: 0 0 var(--space-6) 0;
      line-height: 1.5;
    }
    .actions {
      display: flex;
      gap: var(--space-3);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
