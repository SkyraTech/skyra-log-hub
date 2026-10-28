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
      background: var(--color-surface-card);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .card-header {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .card-title {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin: 0;
    }

    .card-subtitle {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .services-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .service-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      background: none;
      border: 1px solid transparent;
      cursor: pointer;
      text-align: left;
      width: 100%;
      transition: all var(--transition-fast);
    }

    .service-row:hover {
      background: var(--color-surface-hover);
      border-color: var(--color-border-subtle);
    }

    .service-row:focus-visible {
      outline: 2px solid var(--color-brand-primary);
      outline-offset: 2px;
    }

    .service-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .service-name {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 65%;
    }

    .service-count {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      flex-shrink: 0;
    }

    .progress-track {
      height: 6px;
      width: 100%;
      background: var(--color-surface-hover);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--color-brand-primary);
      border-radius: var(--radius-sm);
      transition: width var(--transition-fast);
    }

    .empty-state {
      padding: var(--space-6);
      text-align: center;
      color: var(--color-text-tertiary);
      font-size: var(--font-size-xs);
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
