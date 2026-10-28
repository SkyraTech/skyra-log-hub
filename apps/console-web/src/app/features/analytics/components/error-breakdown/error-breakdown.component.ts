import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DistributionItem } from '../../domain/analytics-metric.model';

@Component({
  selector: 'skyra-error-breakdown',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="error-card">
      <div class="card-header">
        <h3 class="card-title">{{ title() }}</h3>
        @if (subtitle()) {
          <p class="card-subtitle">{{ subtitle() }}</p>
        }
      </div>

      @if (items().length === 0) {
        <div class="empty-state">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span class="empty-title">Zero error classifications</span>
          <span class="empty-desc">No exceptions or error types recorded in this window.</span>
        </div>
      } @else {
        <div class="errors-list" role="list">
          @for (item of items(); track item.key) {
            <button
              type="button"
              class="error-row"
              role="listitem"
              [attr.aria-label]="item.label + ': ' + item.count.toLocaleString() + ' occurrences. Click to inspect error logs.'"
              (click)="onErrorClick(item.key)"
            >
              <div class="error-info">
                <span class="error-type font-mono" [title]="item.label">{{ item.label }}</span>
                <span class="error-count font-mono">{{ item.count.toLocaleString() }}</span>
              </div>
              <div class="progress-track">
                <div
                  class="progress-fill"
                  [style.width.%]="item.percentage"
                  [title]="item.percentage + '% of errors'"
                ></div>
              </div>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .error-card {
      background: var(--skyra-surface, #ffffff);
      border: 1px solid var(--skyra-border, #e2e8f0);
      border-radius: var(--skyra-radius-md, 10px);
      padding: var(--space-4, 16px);
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
      box-shadow: var(--skyra-shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
    }

    .card-header {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .card-title {
      font-family: var(--skyra-font-display, 'Outfit', sans-serif);
      font-size: 15px;
      font-weight: 600;
      color: var(--skyra-text, #0f172a);
      margin: 0;
    }

    .card-subtitle {
      font-size: 11px;
      color: var(--skyra-text-muted, #64748b);
      margin: 0;
    }

    .errors-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    .error-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px 8px;
      border-radius: var(--skyra-radius-sm, 6px);
      background: none;
      border: 1px solid transparent;
      cursor: pointer;
      text-align: left;
      width: 100%;
      transition: all 150ms ease;
    }

    .error-row:hover {
      background: var(--skyra-bg, #f4f7fc);
      border-color: var(--skyra-border, #e2e8f0);
    }

    .error-row:focus-visible {
      outline: 2px solid var(--skyra-primary, #0A58CA);
      outline-offset: 2px;
    }

    .error-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2, 8px);
    }

    .error-type {
      font-size: 11px;
      font-weight: 600;
      color: var(--skyra-danger, #dc2626);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 75%;
    }

    .error-count {
      font-size: 11px;
      color: var(--skyra-text-muted, #64748b);
      flex-shrink: 0;
    }

    .progress-track {
      height: 6px;
      width: 100%;
      background: var(--skyra-bg, #f4f7fc);
      border-radius: var(--skyra-radius-full, 9999px);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--skyra-danger, #dc2626);
      border-radius: var(--skyra-radius-full, 9999px);
      transition: width 150ms ease;
    }

    .empty-state {
      padding: var(--space-6, 24px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      text-align: center;
    }

    .empty-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--skyra-text, #0f172a);
    }

    .empty-desc {
      font-size: 11px;
      color: var(--skyra-text-muted, #64748b);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorBreakdownComponent {
  readonly items = input.required<DistributionItem[]>();
  readonly title = input<string>('Top Exception & Error Types');
  readonly subtitle = input<string>('Categorized by error.type');

  readonly errorClick = output<string>();

  onErrorClick(key: string): void {
    this.errorClick.emit(key);
  }
}
