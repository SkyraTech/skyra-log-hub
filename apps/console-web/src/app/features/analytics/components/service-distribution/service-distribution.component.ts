import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DistributionItem } from '../../domain/analytics-metric.model';

@Component({
  selector: 'skyra-service-distribution',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="service-card">
      <div class="card-header">
        <h3 class="card-title">{{ title() }}</h3>
        @if (subtitle()) {
          <p class="card-subtitle">{{ subtitle() }}</p>
        }
      </div>

      @if (items().length === 0) {
        <div class="empty-state">
          <span>No reporting service records</span>
        </div>
      } @else {
        <div class="services-list" role="list">
          @for (item of items(); track item.key) {
            <button
              type="button"
              class="service-row"
              role="listitem"
              [attr.aria-label]="item.label + ': ' + item.count.toLocaleString() + ' logs, ' + item.percentage + ' percent. Click to inspect service logs.'"
              (click)="onServiceClick(item.key)"
            >
              <div class="service-info">
                <span class="service-name font-mono" [title]="item.label">{{ item.label }}</span>
                <span class="service-count font-mono">{{ item.count.toLocaleString() }} ({{ item.percentage }}%)</span>
              </div>
              <div class="progress-track">
                <div
                  class="progress-fill"
                  [style.width.%]="item.percentage"
                  [title]="item.percentage + '% of total logs'"
                ></div>
              </div>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .service-card {
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

    .services-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    .service-row {
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

    .service-row:hover {
      background: var(--skyra-bg, #f4f7fc);
      border-color: var(--skyra-border, #e2e8f0);
    }

    .service-row:focus-visible {
      outline: 2px solid var(--skyra-primary, #0A58CA);
      outline-offset: 2px;
    }

    .service-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2, 8px);
    }

    .service-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--skyra-text, #0f172a);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 65%;
    }

    .service-count {
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
      background: var(--skyra-cyan, #00A3E0);
      border-radius: var(--skyra-radius-full, 9999px);
      transition: width 150ms ease;
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
export class ServiceDistributionComponent {
  readonly items = input.required<DistributionItem[]>();
  readonly title = input<string>('Top Reporting Services');
  readonly subtitle = input<string>('Ranked by event intake');

  readonly serviceClick = output<string>();

  onServiceClick(key: string): void {
    this.serviceClick.emit(key);
  }
}
