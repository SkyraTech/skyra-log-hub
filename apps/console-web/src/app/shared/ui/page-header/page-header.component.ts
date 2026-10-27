import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'skyra-page-header',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <div class="header-text">
        <h1 class="heading-1 title">{{ title() }}</h1>
        @if (description()) {
          <p class="body-base description">{{ description() }}</p>
        }
      </div>
      <div class="header-actions">
        <ng-content select="[header-action]" />
      </div>
    </header>
  `,
  styles: [`
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
      margin-bottom: var(--space-6);
      padding-bottom: var(--space-4);
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .title {
      color: var(--color-text-primary);
    }
    .description {
      color: var(--color-text-secondary);
      margin-top: var(--space-1);
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }
  `]
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
}
