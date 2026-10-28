import { Component, ChangeDetectionStrategy, input, output, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'skyra-empty-state',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <skyra-tech-empty-state
      variant="dashed"
      [attr.headline]="title()"
      [attr.description]="message()">
      <div slot="icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      @if (actionLabel()) {
        <div slot="actions">
          <skyra-tech-button variant="primary" (click)="actionClick.emit()">
            {{ actionLabel() }}
          </skyra-tech-button>
        </div>
      }
    </skyra-tech-empty-state>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
  `]
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly actionLabel = input<string>();

  readonly actionClick = output<void>();
}
