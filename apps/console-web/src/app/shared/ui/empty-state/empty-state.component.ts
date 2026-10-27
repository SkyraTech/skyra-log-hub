import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'skyra-empty-state',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state">
      <div class="icon-circle" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      <h3 class="heading-3 title">{{ title() }}</h3>
      <p class="body-base message">{{ message() }}</p>
      @if (actionLabel()) {
        <button type="button" class="action-btn" (click)="actionClick.emit()">
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-12) var(--space-4);
      background: var(--color-surface-default);
      border: 1px dashed var(--color-border-default);
      border-radius: var(--radius-md);
    }
    .icon-circle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--color-bg-subtle);
      color: var(--color-text-muted);
      margin-bottom: var(--space-3);
    }
    .title {
      color: var(--color-text-primary);
      margin-bottom: var(--space-1);
    }
    .message {
      color: var(--color-text-secondary);
      max-width: 420px;
      margin-bottom: var(--space-4);
    }
    .action-btn {
      padding: var(--space-2) var(--space-4);
      background: var(--color-brand-primary);
      color: var(--color-text-inverse);
      font-size: 13px;
      font-weight: 500;
      border-radius: var(--radius-sm);
      transition: background var(--transition-fast);
    }
    .action-btn:hover {
      background: var(--color-brand-hover);
    }
  `]
})
export class EmptyStateComponent {
  readonly title = input<string>('No records found');
  readonly message = input<string>('Try broadening your time range or adjusting active search filter predicates.');
  readonly actionLabel = input<string>();
  readonly actionClick = output<void>();
}
