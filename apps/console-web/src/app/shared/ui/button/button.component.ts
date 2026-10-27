import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'skyra-button',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="'btn ' + variant() + ' ' + size()"
      [attr.aria-busy]="loading()"
      (click)="onClick($event)">
      @if (loading()) {
        <span class="spinner" aria-hidden="true"></span>
      }
      <ng-content />
    </button>
  `,
  styleUrls: ['./button.component.css']
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
