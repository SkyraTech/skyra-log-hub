import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'skyra-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="'card ' + (padding() ? 'pad-' + padding() : 'pad-md')">
      @if (title()) {
        <div class="card-header">
          <div>
            <h3 class="card-title">{{ title() }}</h3>
            @if (subtitle()) {
              <p class="card-subtitle">{{ subtitle() }}</p>
            }
          </div>
          <ng-content select="[card-action]" />
        </div>
      }
      <div class="card-body">
        <ng-content />
      </div>
    </div>
  `,
  styles: [`
    .card {
      background: var(--color-surface-default);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }
    .card:hover {
      border-color: var(--color-border-default);
    }
    .pad-none { padding: 0; }
    .pad-sm { padding: var(--space-3); }
    .pad-md { padding: var(--space-4); }
    .pad-lg { padding: var(--space-6); }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-3);
    }
    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .card-subtitle {
      font-size: 12px;
      color: var(--color-text-secondary);
      margin-top: 2px;
    }
  `]
})
export class CardComponent {
  readonly title = input<string>();
  readonly subtitle = input<string>();
  readonly padding = input<'none' | 'sm' | 'md' | 'lg'>('md');
}
