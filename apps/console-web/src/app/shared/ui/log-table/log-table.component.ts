import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SeverityBadgeComponent } from '../severity-badge/severity-badge.component';
import { SkeletonComponent } from '../skeleton/skeleton.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { LogTableRow, TableDensity } from './log-table.model';

@Component({
  selector: 'skyra-log-table',
  standalone: true,
  imports: [
    CommonModule,
    SeverityBadgeComponent,
    SkeletonComponent,
    EmptyStateComponent,
  ],
  templateUrl: './log-table.component.html',
  styleUrl: './log-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogTableComponent {
  readonly logs = input<LogTableRow[]>([]);
  readonly loading = input<boolean>(false);
  readonly density = input<TableDensity>('compact');
  readonly selectedId = input<string | null>(null);

  readonly rowSelect = output<LogTableRow>();
  readonly densityChange = output<TableDensity>();

  onRowClick(row: LogTableRow): void {
    this.rowSelect.emit(row);
  }

  onKeyDown(event: KeyboardEvent, row: LogTableRow): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.rowSelect.emit(row);
    }
  }

  setDensity(d: TableDensity): void {
    this.densityChange.emit(d);
  }

  formatTimestamp(iso: string): string {
    if (!iso) return '';
    try {
      const date = new Date(iso);
      if (isNaN(date.getTime())) return iso;
      const pad = (n: number, z = 2) => ('00' + n).slice(-z);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
    } catch {
      return iso;
    }
  }
}
