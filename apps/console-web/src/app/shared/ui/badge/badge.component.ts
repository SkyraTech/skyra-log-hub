import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'purple';

@Component({
  selector: 'skyra-badge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="'badge ' + variant()">
      <ng-content />
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 500;
      line-height: 14px;
      padding: 2px 6px;
      border-radius: var(--radius-xs);
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .neutral {
      background: var(--color-bg-subtle);
      color: var(--color-text-secondary);
      border-color: var(--color-border-subtle);
    }
    .brand {
      background: var(--color-brand-subtle);
      color: var(--color-brand-primary);
      border-color: var(--color-brand-border);
    }
    .success {
      background: rgba(16, 185, 129, 0.12);
      color: #059669;
      border-color: rgba(16, 185, 129, 0.25);
    }
    .warning {
      background: var(--color-sev-warn-bg);
      color: var(--color-sev-warn-text);
      border-color: var(--color-sev-warn-border);
    }
    .danger {
      background: var(--color-sev-error-bg);
      color: var(--color-sev-error-text);
      border-color: var(--color-sev-error-border);
    }
    .purple {
      background: var(--color-accent-purple-subtle);
      color: var(--color-accent-purple);
      border-color: rgba(168, 85, 247, 0.25);
    }
  `]
})
export class BadgeComponent {
  readonly variant = input<BadgeVariant>('neutral');
}
