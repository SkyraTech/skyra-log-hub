import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'skyra-metric-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="metric-card"
      [class.clickable]="isClickable()"
      [attr.tabindex]="isClickable() ? 0 : null"
      [attr.role]="isClickable() ? 'button' : null"
      [attr.aria-label]="ariaLabel()"
      (click)="onClick()"
      (keydown.enter)="onClick()"
      (keydown.space)="onClick()"
    >
      <div class="metric-header">
        <span class="metric-label">{{ label() }}</span>
        @if (badgeText()) {
          <span class="metric-badge" [class]="'badge-' + badgeVariant()">
            {{ badgeText() }}
          </span>
        }
      </div>
      <div class="metric-value-row">
        <span class="metric-value font-mono">{{ formattedValue() }}</span>
        @if (unit()) {
          <span class="metric-unit">{{ unit() }}</span>
        }
      </div>
      @if (description()) {
        <span class="metric-description">{{ description() }}</span>
      }
      @if (isClickable()) {
        <div class="metric-drilldown-hint">
          <span>Explore in logs</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      }
    </div>
  `,
  styles: [`
    .metric-card {
      background: var(--color-surface-card);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
      position: relative;
    }

    .metric-card.clickable {
      cursor: pointer;
    }

    .metric-card.clickable:hover {
      border-color: var(--color-border-strong);
      box-shadow: var(--shadow-sm);
    }

    .metric-card:focus-visible {
      outline: 2px solid var(--color-brand-primary);
      outline-offset: 2px;
    }

    .metric-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .metric-label {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .metric-badge {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
    }

    .badge-neutral {
      background: var(--color-surface-hover);
      color: var(--color-text-secondary);
    }

    .badge-success {
      background: #ECFDF5;
      color: #065F46;
    }

    .badge-warning {
      background: #FFFBEB;
      color: #92400E;
    }

    .badge-error {
      background: #FEF2F2;
      color: #991B1B;
    }

    .badge-brand {
      background: #EFF6FF;
      color: var(--color-brand-primary);
    }

    .metric-value-row {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
    }

    .metric-value {
      font-size: var(--font-size-2xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      line-height: 1.1;
    }

    .metric-unit {
      font-size: var(--font-size-sm);
      color: var(--color-text-tertiary);
    }

    .metric-description {
      font-size: var(--font-size-xs);
      color: var(--color-text-tertiary);
    }

    .metric-drilldown-hint {
      margin-top: auto;
      padding-top: var(--space-2);
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-size-xs);
      color: var(--color-brand-primary);
      font-weight: var(--font-weight-medium);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number | string>();
  readonly unit = input<string>('');
  readonly description = input<string>('');
  readonly badgeText = input<string>('');
  readonly badgeVariant = input<'neutral' | 'success' | 'warning' | 'error' | 'brand'>('neutral');
  readonly isClickable = input<boolean>(false);

  readonly cardClick = output<void>();

  get formattedValue(): () => string {
    return () => {
      const v = this.value();
      if (typeof v === 'number') {
        return v.toLocaleString();
      }
      return v;
    };
  }

  get ariaLabel(): () => string {
    return () => `${this.label()}: ${this.value()} ${this.unit() || ''}`.trim();
  }

  onClick(): void {
    if (this.isClickable()) {
      this.cardClick.emit();
    }
  }
}
