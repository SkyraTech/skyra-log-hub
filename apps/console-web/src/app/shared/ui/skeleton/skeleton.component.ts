import { Component, ChangeDetectionStrategy, input, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'skyra-skeleton',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <skyra-tech-skeleton
      [attr.width]="width()"
      [attr.height]="height()"
      [attr.radius]="radius()"
      animation="shimmer"
      aria-hidden="true">
    </skyra-tech-skeleton>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
    skyra-tech-skeleton {
      display: block;
      width: 100%;
    }
  `]
})
export class SkeletonComponent {
  readonly width = input<string>('100%');
  readonly height = input<string>('16px');
  readonly radius = input<'none' | 'sm' | 'md' | 'lg' | 'full'>('md');
  readonly borderRadius = input<string>('var(--radius-sm)');
}
