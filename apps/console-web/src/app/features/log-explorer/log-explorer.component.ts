import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { SeverityBadgeComponent, LogSeverity } from '../../shared/ui/severity-badge/severity-badge.component';
import { LogTableComponent } from '../../shared/ui/log-table/log-table.component';
import { LogTableRow, TableDensity } from '../../shared/ui/log-table/log-table.model';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';

@Component({
  selector: 'skyra-log-explorer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    ButtonComponent,
    SeverityBadgeComponent,
    LogTableComponent,
  ],
  templateUrl: './log-explorer.component.html',
  styleUrl: './log-explorer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogExplorerComponent {
  private readonly workspaceContext = inject(WorkspaceContextService);
  readonly context = this.workspaceContext.currentContext;

  readonly searchQuery = signal<string>('');
  readonly selectedSeverity = signal<string>('all');
  readonly selectedTimeRange = signal<string>('15m');
  readonly tableDensity = signal<TableDensity>('compact');
  readonly selectedLog = signal<LogTableRow | null>(null);

  // Initial foundation state: empty until live search API integration in CONSOLE-004
  readonly logs = signal<LogTableRow[]>([]);
  readonly loading = signal<boolean>(false);

  readonly severities: Array<{ label: string; value: string; count?: number }> = [
    { label: 'All', value: 'all' },
    { label: 'Fatal', value: 'fatal' },
    { label: 'Error', value: 'error' },
    { label: 'Warn', value: 'warn' },
    { label: 'Info', value: 'info' },
    { label: 'Debug', value: 'debug' },
  ];

  setSeverity(sev: string): void {
    this.selectedSeverity.set(sev);
  }

  setTimeRange(tr: string): void {
    this.selectedTimeRange.set(tr);
  }

  onDensityChange(d: TableDensity): void {
    this.tableDensity.set(d);
  }

  onRowSelect(row: LogTableRow): void {
    this.selectedLog.set(row);
  }

  closeDetail(): void {
    this.selectedLog.set(null);
  }

  formatJson(obj: unknown): string {
    if (!obj) return '{}';
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }
}
