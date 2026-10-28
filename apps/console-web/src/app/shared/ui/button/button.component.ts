import { Component, ChangeDetectionStrategy, input, output, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'skyra-button',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <skyra-tech-button
      [attr.variant]="variant()"
      [attr.size]="size()"
      [attr.type]="type()"
      [attr.disabled]="disabled() || loading() ? '' : null"
      [attr.loading]="loading() ? '' : null"
      (click)="onClick($event)">
      <ng-content />
    </skyra-tech-button>
  `,
  styles: [`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
    skyra-tech-button {
      display: inline-flex;
      width: 100%;
    }
  `]
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);

  readonly btnClick = output<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (!this.disabled() && !this.loading()) {
      this.btnClick.emit(event);
    }
  }
}
