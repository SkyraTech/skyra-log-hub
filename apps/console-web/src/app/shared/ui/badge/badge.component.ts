import { Component, ChangeDetectionStrategy, input, computed, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeVariant = 'neutral' | 'brand' | 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'orange' | 'cyan';

@Component({
  selector: 'skyra-badge',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <skyra-tech-badge [attr.variant]="normalizedVariant()" [attr.dot]="dot() ? '' : null">
      <ng-content />
    </skyra-tech-badge>
  `,
  styles: [`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
  `]
})
export class BadgeComponent {
  readonly variant = input<BadgeVariant>('neutral');
  readonly dot = input<boolean>(false);

  readonly normalizedVariant = computed(() => {
    const v = this.variant();
    return v === 'brand' ? 'primary' : v;
  });
}
