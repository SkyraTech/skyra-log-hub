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
        <span class="metric-value">{{ formattedValue() }}</span>
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
      background: var(--skyra-surface, #ffffff);
      border: 1px solid var(--skyra-border, #e2e8f0);
      border-radius: var(--skyra-radius-md, 10px);
      padding: var(--space-4, 16px);
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
      transition: border-color 150ms ease, box-shadow 150ms ease;
      position: relative;
      box-shadow: var(--skyra-shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
    }

    .metric-card.clickable {
      cursor: pointer;
    }

    .metric-card.clickable:hover {
      border-color: var(--skyra-primary, #0A58CA);
      box-shadow: var(--skyra-shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
    }

    .metric-card:focus-visible {
      outline: 2px solid var(--skyra-primary, #0A58CA);
      outline-offset: 2px;
    }

    .metric-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2, 8px);
    }

    .metric-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--skyra-text-muted, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .metric-badge {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 6px;
      border-radius: var(--skyra-radius-sm, 6px);
    }

    .badge-neutral {
      background: var(--skyra-bg, #f4f7fc);
      color: var(--skyra-text-muted, #64748b);
    }

    .badge-success {
      background: rgba(22, 163, 74, 0.1);
      color: var(--skyra-success, #16a34a);
    }

    .badge-warning {
      background: rgba(217, 119, 6, 0.1);
      color: var(--skyra-warning, #d97706);
    }

    .badge-error {
      background: rgba(220, 38, 38, 0.1);
      color: var(--skyra-danger, #dc2626);
    }

    .badge-brand {
      background: var(--skyra-primary-light, rgba(10, 88, 202, 0.1));
      color: var(--skyra-primary, #0A58CA);
    }

    .metric-value-row {
      display: flex;
      align-items: baseline;
      gap: var(--space-2, 8px);
    }

    .metric-value {
      font-family: var(--skyra-font-display, 'Outfit', sans-serif);
      font-size: 28px;
      font-weight: 700;
      color: var(--skyra-text, #0f172a);
      line-height: 1.1;
    }

    .metric-unit {
      font-size: 13px;
      color: var(--skyra-text-muted, #64748b);
    }

    .metric-description {
      font-size: 11px;
      color: var(--skyra-text-muted, #64748b);
    }

    .metric-drilldown-hint {
      margin-top: auto;
      padding-top: var(--space-2, 8px);
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--skyra-primary, #0A58CA);
      font-weight: 600;
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
