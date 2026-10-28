import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SeverityBadgeComponent } from '../../../../shared/ui/severity-badge/severity-badge.component';
import { JsonInspectorComponent } from '../json-inspector/json-inspector.component';
import { LogExplorerRow } from '../../domain/log-event.model';

type DrawerTab = 'summary' | 'ecs' | 'raw';

@Component({
  selector: 'skyra-log-event-drawer',
  standalone: true,
  imports: [CommonModule, SeverityBadgeComponent, JsonInspectorComponent],
  templateUrl: './log-event-drawer.component.html',
  styleUrl: './log-event-drawer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogEventDrawerComponent {
  readonly log = input<LogExplorerRow | null>(null);
  readonly isOpen = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);

  readonly close = output<void>();

  readonly activeTab = signal<DrawerTab>('summary');
  readonly copiedKey = signal<string | null>(null);

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.isOpen()) {
      event.preventDefault();
      this.close.emit();
    }
  }

  setTab(tab: DrawerTab): void {
    this.activeTab.set(tab);
  }

  onClose(): void {
    this.close.emit();
  }

  copyToClipboard(key: string, text: string): void {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text).then(() => {
        this.copiedKey.set(key);
        setTimeout(() => this.copiedKey.set(null), 2000);
      });
    } catch {
      // Ignore
    }
  }

  formatTimestampLocal(iso: string): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }
}
