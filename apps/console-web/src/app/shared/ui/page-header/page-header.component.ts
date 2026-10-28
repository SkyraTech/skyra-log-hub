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
      gap: var(--space-4, 16px);
      margin-bottom: var(--space-6, 24px);
      padding-bottom: var(--space-4, 16px);
      border-bottom: 1px solid var(--skyra-border, #e2e8f0);
    }
    .title {
      font-family: var(--skyra-font-display, 'Outfit', sans-serif);
      font-size: 24px;
      font-weight: 700;
      color: var(--skyra-text, #0f172a);
      margin: 0;
    }
    .description {
      color: var(--skyra-text-muted, #64748b);
      font-size: 14px;
      margin-top: var(--space-1, 4px);
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      flex-shrink: 0;
    }
  `]
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
}
