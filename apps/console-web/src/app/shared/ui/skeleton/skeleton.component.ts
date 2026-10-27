import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'skyra-skeleton',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="skeleton"
      [style.width]="width()"
      [style.height]="height()"
      [style.border-radius]="borderRadius()"
      aria-hidden="true">
    </div>
  `,
  styles: [`
    .skeleton {
      background: linear-gradient(
        90deg,
        var(--color-bg-subtle) 25%,
        var(--color-border-subtle) 50%,
        var(--color-bg-subtle) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      display: inline-block;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class SkeletonComponent {
  readonly width = input<string>('100%');
  readonly height = input<string>('16px');
  readonly borderRadius = input<string>('var(--radius-sm)');
}
