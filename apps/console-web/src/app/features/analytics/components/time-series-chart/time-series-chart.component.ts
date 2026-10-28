import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeSeriesPoint } from '../../domain/analytics-metric.model';

interface BarData {
  point: TimeSeriesPoint;
  x: number;
  y: number;
  width: number;
  height: number;
}

@Component({
  selector: 'skyra-time-series-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="time-series-card">
      <div class="chart-header">
        <div class="header-titles">
          <h3 class="chart-title">{{ title() }}</h3>
          @if (subtitle()) {
            <p class="chart-subtitle">{{ subtitle() }}</p>
          }
        </div>
        <div class="chart-actions">
          <button
            type="button"
            class="toggle-view-btn"
            [attr.aria-expanded]="showTable()"
            aria-label="Toggle accessible tabular data view"
            (click)="toggleTable()"
          >
            {{ showTable() ? 'Chart View' : 'Table View' }}
          </button>
        </div>
      </div>

      @if (loading()) {
        <div class="chart-loading" role="status" aria-label="Loading chart data">
          <div class="spinner"></div>
          <span>Loading telemetry trend...</span>
        </div>
      } @else if (points().length === 0) {
        <div class="chart-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <span class="empty-title">No volume records</span>
          <span class="empty-desc">No log events recorded in the selected time range.</span>
        </div>
      } @else if (showTable()) {
        <!-- Accessible Table Alternative (WCAG 2.2 AA) -->
        <div class="table-container" tabindex="0" role="region" aria-label="Time-series data table">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Time Window (UTC)</th>
                <th scope="col" class="num-col">Event Count</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (pt of points(); track pt.timestamp) {
                <tr>
                  <td class="font-mono">{{ pt.timestamp }}</td>
                  <td class="num-col font-mono">{{ pt.count.toLocaleString() }}</td>
                  <td>
                    <button type="button" class="table-drilldown-btn" (click)="onPointSelect(pt)">
                      Inspect Window
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <!-- Interactive Accessible SVG Chart -->
        <div class="svg-wrapper" (mouseleave)="clearHover()">
          <svg
            viewBox="0 0 800 200"
            class="chart-svg"
            role="img"
            [attr.aria-label]="title() + ' time-series chart'"
          >
            <!-- Background grid lines -->
            <line x1="40" y1="20" x2="780" y2="20" class="grid-line" />
            <line x1="40" y1="70" x2="780" y2="70" class="grid-line" />
            <line x1="40" y1="120" x2="780" y2="120" class="grid-line" />
            <line x1="40" y1="170" x2="780" y2="170" class="axis-line" />

            <!-- Y-Axis labels -->
            <text x="35" y="24" class="axis-text" text-anchor="end">{{ maxCountFormatted() }}</text>
            <text x="35" y="99" class="axis-text" text-anchor="end">{{ midCountFormatted() }}</text>
            <text x="35" y="174" class="axis-text" text-anchor="end">0</text>

            <!-- Bars -->
            @for (bar of bars(); track bar.point.timestamp) {
              <rect
                [attr.x]="bar.x"
                [attr.y]="bar.y"
                [attr.width]="bar.width"
                [attr.height]="bar.height"
                class="chart-bar"
                [class.active]="hoveredPoint()?.timestamp === bar.point.timestamp"
                tabindex="0"
                role="button"
                [attr.aria-label]="bar.point.formattedTime + ': ' + bar.point.count + ' events. Press Enter to inspect.'"
                (mouseenter)="setHover(bar.point, $event)"
                (focus)="setHover(bar.point, $event)"
                (click)="onPointSelect(bar.point)"
                (keydown.enter)="onPointSelect(bar.point)"
                (keydown.space)="onPointSelect(bar.point)"
              />
            }
          </svg>

          <!-- Floating Hover Tooltip (Safe text interpolation, zero innerHTML) -->
          @if (hoveredPoint(); as hp) {
            <div
              class="chart-tooltip"
              [style.left.px]="tooltipX()"
              [style.top.px]="tooltipY()"
            >
              <div class="tooltip-time">{{ hp.formattedDate }} {{ hp.formattedTime }} UTC</div>
              <div class="tooltip-count">
                <span class="count-value font-mono">{{ hp.count.toLocaleString() }}</span>
                <span class="count-label">events</span>
              </div>
              <div class="tooltip-hint">Click to drill down</div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .time-series-card {
      background: var(--color-surface-card);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .chart-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .chart-title {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin: 0;
    }

    .chart-subtitle {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      margin: 2px 0 0 0;
    }

    .toggle-view-btn {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      background: var(--color-surface-hover);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      padding: 4px 8px;
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .toggle-view-btn:hover {
      color: var(--color-text-primary);
      border-color: var(--color-border-strong);
    }

    .svg-wrapper {
      position: relative;
      width: 100%;
      overflow: hidden;
    }

    .chart-svg {
      width: 100%;
      height: 200px;
      display: block;
    }

    .grid-line {
      stroke: var(--color-border-subtle);
      stroke-dasharray: 3, 3;
      stroke-width: 1;
    }

    .axis-line {
      stroke: var(--color-border-strong);
      stroke-width: 1;
    }

    .axis-text {
      font-size: 10px;
      fill: var(--color-text-tertiary);
      font-family: var(--font-family-mono);
    }

    .chart-bar {
      fill: var(--color-brand-primary);
      opacity: 0.85;
      cursor: pointer;
      transition: opacity var(--transition-fast), fill var(--transition-fast);
      rx: 2;
    }

    .chart-bar:hover,
    .chart-bar.active,
    .chart-bar:focus-visible {
      opacity: 1;
      fill: #1D4ED8;
      outline: none;
    }

    .chart-bar:focus-visible {
      stroke: var(--color-text-primary);
      stroke-width: 2;
    }

    .chart-tooltip {
      position: absolute;
      background: var(--color-surface-card);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
      box-shadow: var(--shadow-md);
      pointer-events: none;
      z-index: 10;
      white-space: nowrap;
      transform: translate(-50%, -100%);
      margin-top: -8px;
    }

    .tooltip-time {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      margin-bottom: 2px;
    }

    .tooltip-count {
      display: flex;
      align-items: baseline;
      gap: 4px;
    }

    .count-value {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
    }

    .count-label {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .tooltip-hint {
      font-size: 10px;
      color: var(--color-brand-primary);
      margin-top: 2px;
    }

    .chart-loading,
    .chart-empty {
      height: 180px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      color: var(--color-text-tertiary);
    }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--color-border-subtle);
      border-top-color: var(--color-brand-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
    }

    .empty-desc {
      font-size: var(--font-size-xs);
    }

    .table-container {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--font-size-xs);
    }

    .data-table th,
    .data-table td {
      padding: 6px 12px;
      text-align: left;
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .data-table th {
      background: var(--color-surface-hover);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-secondary);
      position: sticky;
      top: 0;
    }

    .num-col {
      text-align: right;
    }

    .table-drilldown-btn {
      font-size: var(--font-size-xs);
      color: var(--color-brand-primary);
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      text-decoration: underline;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeSeriesChartComponent {
  readonly points = input.required<TimeSeriesPoint[]>();
  readonly title = input<string>('Log Volume Trend');
  readonly subtitle = input<string>('');
  readonly loading = input<boolean>(false);

  readonly bucketClick = output<TimeSeriesPoint>();

  readonly showTable = signal<boolean>(false);
  readonly hoveredPoint = signal<TimeSeriesPoint | null>(null);
  readonly tooltipX = signal<number>(0);
  readonly tooltipY = signal<number>(0);

  readonly maxCount = computed<number>(() => {
    const pts = this.points();
    if (pts.length === 0) return 10;
    const max = Math.max(...pts.map((p) => p.count));
    return max > 0 ? max : 10;
  });

  readonly maxCountFormatted = computed<string>(() => this.maxCount().toLocaleString());
  readonly midCountFormatted = computed<string>(() => Math.round(this.maxCount() / 2).toLocaleString());

  readonly bars = computed<BarData[]>(() => {
    const pts = this.points();
    if (pts.length === 0) return [];

    const chartWidth = 740; // 780 - 40
    const chartHeight = 150; // 170 - 20
    const startX = 40;
    const baseY = 170;
    const max = this.maxCount();

    const count = pts.length;
    const slotWidth = chartWidth / count;
    const barWidth = Math.max(2, Math.min(slotWidth * 0.75, 40));
    const padding = (slotWidth - barWidth) / 2;

    return pts.map((pt, idx) => {
      const height = (pt.count / max) * chartHeight;
      const x = startX + idx * slotWidth + padding;
      const y = baseY - height;
      return {
        point: pt,
        x,
        y,
        width: barWidth,
        height: Math.max(height, pt.count > 0 ? 2 : 0),
      };
    });
  });

  toggleTable(): void {
    this.showTable.set(!this.showTable());
  }

  setHover(point: TimeSeriesPoint, event: MouseEvent | FocusEvent): void {
    this.hoveredPoint.set(point);
    if ('offsetX' in event) {
      this.tooltipX.set(event.offsetX);
      this.tooltipY.set(event.offsetY);
    }
  }

  clearHover(): void {
    this.hoveredPoint.set(null);
  }

  onPointSelect(point: TimeSeriesPoint): void {
    this.bucketClick.emit(point);
  }
}
