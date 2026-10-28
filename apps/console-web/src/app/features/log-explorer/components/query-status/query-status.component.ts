import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchStatistics } from '../../../../core/http/api-client.port';
import { CursorPaginationState } from '../../domain/pagination.model';

@Component({
  selector: 'skyra-query-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './query-status.component.html',
  styleUrl: './query-status.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueryStatusComponent {
  readonly statistics = input<SearchStatistics | null>(null);
  readonly pagination = input<CursorPaginationState>({
    currentPageIndex: 1,
    currentCursor: null,
    nextCursor: null,
    hasMore: false,
    canPrev: false,
    canNext: false,
    pageSize: 50,
    totalReturned: 0,
  });
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly correlationId = input<string | null>(null);

  readonly prevPage = output<void>();
  readonly nextPage = output<void>();

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  onPrev(): void {
    if (this.pagination().canPrev && !this.loading()) {
      this.prevPage.emit();
    }
  }

  onNext(): void {
    if (this.pagination().canNext && !this.loading()) {
      this.nextPage.emit();
    }
  }
}
