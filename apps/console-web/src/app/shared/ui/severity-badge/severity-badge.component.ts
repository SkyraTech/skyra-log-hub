import { Component, ChangeDetectionStrategy, input, computed, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import '@skyra-tech-platform/badge';

export type LogSeverity = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

@Component({
  selector: 'skyra-severity-badge',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <skyra-tech-badge
      [attr.variant]="platformVariant()"
      dot
      size="sm"
      [class]="'sev-badge sev-' + normalizedLevel()"
      [attr.aria-label]="'Severity: ' + label()">
      <span class="sr-only">Severity: </span>{{ label() }}
    </skyra-tech-badge>
  `,
  styles: [`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
    skyra-tech-badge {
      display: inline-flex;
    }
  `]
})
export class SeverityBadgeComponent {
  readonly level = input<string>('info');
  readonly severity = input<string | undefined>(undefined);

  readonly normalizedLevel = computed(() => {
    const raw = (this.severity() ?? this.level() ?? 'info').toLowerCase();
    if (raw === 'emerg' || raw === 'fatal') return 'fatal';
    if (raw === 'err' || raw === 'error') return 'error';
    if (raw === 'warning' || raw === 'warn') return 'warn';
    if (raw === 'info') return 'info';
    if (raw === 'debug') return 'debug';
    return 'trace';
  });

  readonly platformVariant = computed<'danger' | 'warning' | 'info' | 'purple' | 'neutral'>(() => {
    switch (this.normalizedLevel()) {
      case 'fatal':
      case 'error':
        return 'danger';
      case 'warn':
        return 'warning';
      case 'info':
        return 'info';
      case 'debug':
        return 'purple';
      case 'trace':
      default:
        return 'neutral';
    }
  });

  readonly label = computed(() => this.normalizedLevel().toUpperCase());
}
