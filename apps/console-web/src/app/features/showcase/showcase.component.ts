import {
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { SeverityBadgeComponent } from '../../shared/ui/severity-badge/severity-badge.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { LogTableComponent } from '../../shared/ui/log-table/log-table.component';
import { LogTableRow, TableDensity } from '../../shared/ui/log-table/log-table.model';

@Component({
  selector: 'skyra-showcase',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    SeverityBadgeComponent,
    SkeletonComponent,
    EmptyStateComponent,
    LogTableComponent,
  ],
  templateUrl: './showcase.component.html',
  styleUrl: './showcase.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShowcaseComponent {
  readonly showcaseDensity = signal<TableDensity>('compact');
  readonly selectedLogId = signal<string | null>('fix-002');

  // Explicit, synthetic development-only fixture data
  readonly mockLogs: LogTableRow[] = [
    {
      id: 'fix-001',
      timestamp: '2026-10-27T10:14:02.148Z',
      severity: 'fatal',
      service: 'ingestion-gateway',
      message: 'CRITICAL: Database connection pool exhausted; cannot acquire client within 5000ms timeout',
      attributes: {
        'error.type': 'ConnectionPoolTimeout',
        'pool.active_connections': 100,
        'pool.max': 100,
        'tenant.id': 'sample-tenant-01',
      },
    },
    {
      id: 'fix-002',
      timestamp: '2026-10-27T10:14:01.890Z',
      severity: 'error',
      service: 'query-service',
      message: 'DuckDB execution failed on parquet partition: memory allocation limit exceeded (1024MB)',
      attributes: {
        'query.id': 'q_9876543210',
        'query.sql': 'SELECT * FROM parquet_scan(...) WHERE log.level = "error"',
        'memory.limit_bytes': 1073741824,
      },
    },
    {
      id: 'fix-003',
      timestamp: '2026-10-27T10:13:58.412Z',
      severity: 'warn',
      service: 'wal-writer',
      message: 'Batch write delayed by 320ms due to concurrent filesystem fsync lock on wal_0042.log',
      attributes: {
        'wal.file': 'wal_0042.log',
        'delay_ms': 320,
      },
    },
    {
      id: 'fix-004',
      timestamp: '2026-10-27T10:13:55.002Z',
      severity: 'info',
      service: 'auth-bff',
      message: 'OIDC session refreshed successfully for user dinesh@skyra.io; issued token expires in 3600s',
      attributes: {
        'user.email': 'dinesh@skyra.io',
        'auth.realm': 'skyra-production',
      },
    },
    {
      id: 'fix-005',
      timestamp: '2026-10-27T10:13:50.771Z',
      severity: 'debug',
      service: 'query-service',
      message: 'Query planner resolved 4 parquet partition files covering requested timestamp window',
      attributes: {
        'partitions.scanned': 4,
        'execution_mode': 'hybrid',
      },
    },
  ];

  onDensityChange(d: TableDensity): void {
    this.showcaseDensity.set(d);
  }

  onRowSelect(row: LogTableRow): void {
    this.selectedLogId.set(row.id);
  }
}
