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
      background: var(--skyra-surface, #ffffff);
      border: 1px solid var(--skyra-border, #e2e8f0);
      border-radius: var(--skyra-radius-md, 10px);
      box-shadow: var(--skyra-shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
      overflow: hidden;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .card:hover {
      border-color: var(--skyra-primary, #0A58CA);
    }
    .pad-none { padding: 0; }
    .pad-sm { padding: var(--space-3, 12px); }
    .pad-md { padding: var(--space-4, 16px); }
    .pad-lg { padding: var(--space-6, 24px); }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-3, 12px);
    }
    .card-title {
      font-family: var(--skyra-font-display, 'Outfit', sans-serif);
      font-size: 15px;
      font-weight: 600;
      color: var(--skyra-text, #0f172a);
    }
    .card-subtitle {
      font-size: 12px;
      color: var(--skyra-text-muted, #64748b);
      margin-top: 2px;
    }
  `]
})
export class CardComponent {
  readonly title = input<string>();
  readonly subtitle = input<string>();
  readonly padding = input<'none' | 'sm' | 'md' | 'lg'>('md');
}
