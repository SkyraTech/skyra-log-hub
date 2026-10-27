import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type LogSeverity = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

@Component({
  selector: 'skyra-severity-badge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="'sev-badge sev-' + normalizedLevel()">
      <span class="dot" aria-hidden="true"></span>
      <span class="label">{{ label() }}</span>
      <span class="sr-only">Severity: {{ label() }}</span>
    </span>
  `,
  styles: [`
    .sev-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 1px 7px;
      font-size: 11px;
      font-weight: 600;
      line-height: 16px;
      border-radius: var(--radius-full);
      border: 1px solid transparent;
      user-select: none;
      letter-spacing: 0.02em;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .sev-fatal {
      background: var(--color-sev-fatal-bg);
      color: var(--color-sev-fatal-text);
      border-color: var(--color-sev-fatal-border);
    }
    .sev-fatal .dot { background: var(--color-sev-fatal-dot); }

    .sev-error {
      background: var(--color-sev-error-bg);
      color: var(--color-sev-error-text);
      border-color: var(--color-sev-error-border);
    }
    .sev-error .dot { background: var(--color-sev-error-dot); }

    .sev-warn {
      background: var(--color-sev-warn-bg);
      color: var(--color-sev-warn-text);
      border-color: var(--color-sev-warn-border);
    }
    .sev-warn .dot { background: var(--color-sev-warn-dot); }

    .sev-info {
      background: var(--color-sev-info-bg);
      color: var(--color-sev-info-text);
      border-color: var(--color-sev-info-border);
    }
    .sev-info .dot { background: var(--color-sev-info-dot); }

    .sev-debug, .sev-trace {
      background: var(--color-sev-debug-bg);
      color: var(--color-sev-debug-text);
      border-color: var(--color-sev-debug-border);
    }
    .sev-debug .dot, .sev-trace .dot { background: var(--color-sev-debug-dot); }
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

  readonly label = computed(() => this.normalizedLevel().toUpperCase());
}
