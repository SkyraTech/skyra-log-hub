import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimeRangePreset, TIME_RANGE_PRESETS } from '../../domain/log-search.model';

@Component({
  selector: 'skyra-search-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-toolbar.component.html',
  styleUrl: './search-toolbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchToolbarComponent {
  readonly queryText = input<string>('');
  readonly timeRange = input<TimeRangePreset>('15m');
  readonly loading = input<boolean>(false);
  readonly pageSize = input<number>(50);

  readonly queryTextChange = output<string>();
  readonly timeRangeChange = output<TimeRangePreset>();
  readonly pageSizeChange = output<number>();
  readonly search = output<void>();
  readonly cancel = output<void>();

  readonly presets = TIME_RANGE_PRESETS;
  readonly pageSizes = [25, 50, 100, 200];

  onQueryInput(val: string): void {
    this.queryTextChange.emit(val);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.search.emit();
    }
  }

  onTimeRangeSelect(val: string): void {
    this.timeRangeChange.emit(val as TimeRangePreset);
  }

  onPageSizeSelect(val: string): void {
    this.pageSizeChange.emit(Number(val));
  }

  triggerSearch(): void {
    this.search.emit();
  }

  triggerCancel(): void {
    this.cancel.emit();
  }
}
