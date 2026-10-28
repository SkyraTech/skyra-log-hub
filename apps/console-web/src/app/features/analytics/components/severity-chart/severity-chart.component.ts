import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DistributionItem } from '../../domain/analytics-metric.model';

@Component({
  selector: 'skyra-severity-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="distribution-card">
      <div class="card-header">
        <h3 class="card-title">{{ title() }}</h3>
        @if (subtitle()) {
          <p class="card-subtitle">{{ subtitle() }}</p>
        }
      </div>

      @if (items().length === 0) {
        <div class="empty-state">
          <span>No severity distribution data</span>
        </div>
      } @else {
        <!-- Stacked visual proportion bar -->
        <div class="stacked-bar" role="progressbar" aria-label="Severity distribution bar">
          @for (item of items(); track item.key) {
            @if (item.percentage > 0) {
              <div
                class="bar-segment"
                [style.width.%]="item.percentage"
                [style.background-color]="item.color || '#64748B'"
                [title]="item.label.toUpperCase() + ': ' + item.count.toLocaleString() + ' (' + item.percentage + '%)'"
              ></div>
            }
          }
        </div>

        <!-- Interactive Legend / Breakdown List -->
        <div class="items-list" role="list">
          @for (item of items(); track item.key) {
            <button
              type="button"
              class="item-row"
              role="listitem"
              [attr.aria-label]="item.label.toUpperCase() + ': ' + item.count.toLocaleString() + ' logs, ' + item.percentage + ' percent. Click to filter logs.'"
              (click)="onItemClick(item.key)"
            >
              <div class="item-left">
                <span class="color-dot" [style.background-color]="item.color || '#64748B'"></span>
                <span class="item-label font-mono">{{ item.label | uppercase }}</span>
              </div>
              <div class="item-right">
                <span class="item-count font-mono">{{ item.count.toLocaleString() }}</span>
                <span class="item-pct font-mono">({{ item.percentage }}%)</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="arrow-icon">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .distribution-card {
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

    .stacked-bar {
      height: 8px;
      width: 100%;
      border-radius: var(--skyra-radius-full, 9999px);
      display: flex;
      overflow: hidden;
      background: var(--skyra-bg, #f4f7fc);
    }

    .bar-segment {
      height: 100%;
      transition: width 150ms ease;
    }

    .items-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: var(--skyra-radius-sm, 6px);
      background: none;
      border: 1px solid transparent;
      cursor: pointer;
      text-align: left;
      width: 100%;
      transition: all 150ms ease;
    }

    .item-row:hover {
      background: var(--skyra-bg, #f4f7fc);
      border-color: var(--skyra-border, #e2e8f0);
    }

    .item-row:focus-visible {
      outline: 2px solid var(--skyra-primary, #0A58CA);
      outline-offset: 2px;
    }

    .item-left {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
    }

    .color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .item-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--skyra-text, #0f172a);
    }

    .item-right {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
    }

    .item-count {
      font-size: 11px;
      color: var(--skyra-text, #0f172a);
      font-weight: 600;
    }

    .item-pct {
      font-size: 11px;
      color: var(--skyra-text-muted, #64748b);
    }

    .arrow-icon {
      color: var(--skyra-text-muted, #64748b);
      transition: transform 150ms ease;
    }

    .item-row:hover .arrow-icon {
      transform: translateX(2px);
      color: var(--skyra-primary, #0A58CA);
    }

    .empty-state {
      padding: var(--space-6, 24px);
      text-align: center;
      color: var(--skyra-text-muted, #64748b);
      font-size: 11px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeverityChartComponent {
  readonly items = input.required<DistributionItem[]>();
  readonly title = input<string>('Severity Distribution');
  readonly subtitle = input<string>('Log levels breakdown');

  readonly levelClick = output<string>();

  onItemClick(key: string): void {
    this.levelClick.emit(key);
  }
}
