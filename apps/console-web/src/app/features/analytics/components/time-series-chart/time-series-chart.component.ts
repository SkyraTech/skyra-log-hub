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
      background: var(--skyra-surface, #ffffff);
      border: 1px solid var(--skyra-border, #e2e8f0);
      border-radius: var(--skyra-radius-md, 10px);
      padding: var(--space-4, 16px);
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
      box-shadow: var(--skyra-shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
    }

    .chart-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-2, 8px);
    }

    .chart-title {
      font-family: var(--skyra-font-display, 'Outfit', sans-serif);
      font-size: 15px;
      font-weight: 600;
      color: var(--skyra-text, #0f172a);
      margin: 0;
    }

    .chart-subtitle {
      font-size: 11px;
      color: var(--skyra-text-muted, #64748b);
      margin: 2px 0 0 0;
    }

    .toggle-view-btn {
      font-size: 11px;
      font-weight: 500;
      color: var(--skyra-text-muted, #64748b);
      background: var(--skyra-bg, #f4f7fc);
      border: 1px solid var(--skyra-border, #e2e8f0);
      border-radius: var(--skyra-radius-sm, 6px);
      padding: 4px 8px;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .toggle-view-btn:hover {
      color: var(--skyra-text, #0f172a);
      border-color: var(--skyra-primary, #0A58CA);
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
      stroke: var(--skyra-border, #e2e8f0);
      stroke-dasharray: 3, 3;
      stroke-width: 1;
    }

    .axis-line {
      stroke: var(--skyra-border, #e2e8f0);
      stroke-width: 1;
    }

    .axis-text {
      font-size: 10px;
      fill: var(--skyra-text-muted, #64748b);
      font-family: var(--skyra-font-mono, monospace);
    }

    .chart-bar {
      fill: var(--skyra-primary, #0A58CA);
      opacity: 0.85;
      cursor: pointer;
      transition: opacity 150ms ease, fill 150ms ease;
      rx: 2;
    }

    .chart-bar:hover,
    .chart-bar.active,
    .chart-bar:focus-visible {
      opacity: 1;
      fill: var(--skyra-primary-hover, #0847a8);
      outline: none;
    }

    .chart-bar:focus-visible {
      stroke: var(--skyra-text, #0f172a);
      stroke-width: 2;
    }

    .chart-tooltip {
      position: absolute;
      background: var(--skyra-surface, #ffffff);
      border: 1px solid var(--skyra-border, #e2e8f0);
      border-radius: var(--skyra-radius-sm, 6px);
      padding: 6px 10px;
      box-shadow: var(--skyra-shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
      pointer-events: none;
      z-index: 10;
      white-space: nowrap;
      transform: translate(-50%, -100%);
      margin-top: -8px;
    }

    .tooltip-time {
      font-size: 11px;
      color: var(--skyra-text-muted, #64748b);
      margin-bottom: 2px;
    }

    .tooltip-count {
      display: flex;
      align-items: baseline;
      gap: 4px;
    }

    .count-value {
      font-size: 13px;
      font-weight: 700;
      color: var(--skyra-text, #0f172a);
    }

    .count-label {
      font-size: 11px;
      color: var(--skyra-text-muted, #64748b);
    }

    .tooltip-hint {
      font-size: 10px;
      color: var(--skyra-primary, #0A58CA);
      margin-top: 2px;
    }

    .chart-loading,
    .chart-empty {
      height: 180px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      color: var(--skyra-text-muted, #64748b);
    }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--skyra-border, #e2e8f0);
      border-top-color: var(--skyra-primary, #0A58CA);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--skyra-text-muted, #64748b);
    }

    .empty-desc {
      font-size: 11px;
    }

    .table-container {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--skyra-border, #e2e8f0);
      border-radius: var(--skyra-radius-sm, 6px);
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }

    .data-table th,
    .data-table td {
      padding: 6px 12px;
      text-align: left;
      border-bottom: 1px solid var(--skyra-border, #e2e8f0);
    }

    .data-table th {
      background: var(--skyra-bg, #f4f7fc);
      font-weight: 600;
      color: var(--skyra-text-muted, #64748b);
      position: sticky;
      top: 0;
    }

    .num-col {
      text-align: right;
    }

    .table-drilldown-btn {
      font-size: 11px;
      color: var(--skyra-primary, #0A58CA);
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
