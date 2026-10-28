import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimeRangePreset } from '../../../log-explorer/domain/log-search.model';
import { BucketInterval } from '../../domain/analytics-metric.model';

@Component({
  selector: 'skyra-analytics-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="toolbar-container">
      <div class="toolbar-top">
        <!-- Time Range Selector -->
        <div class="control-group">
          <label for="time-range-select" class="control-label">Time Window</label>
          <div class="select-wrapper">
            <select
              id="time-range-select"
              class="toolbar-select font-mono"
              [ngModel]="timeRange()"
              (ngModelChange)="onTimeRangeChange($event)"
            >
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
        </div>

        <!-- Bucket Interval Selector -->
        @if (showIntervalSelector()) {
          <div class="control-group">
            <label for="interval-select" class="control-label">Bucket Size</label>
            <div class="select-wrapper">
              <select
                id="interval-select"
                class="toolbar-select font-mono"
                [ngModel]="interval()"
                (ngModelChange)="onIntervalChange($event)"
              >
                <option value="1m">1 minute</option>
                <option value="5m">5 minutes</option>
                <option value="15m">15 minutes</option>
                <option value="1h">1 hour</option>
                <option value="6h">6 hours</option>
                <option value="1d">1 day</option>
              </select>
            </div>
          </div>
        }

        <!-- Environment Scope Filter -->
        <div class="control-group">
          <label for="env-select" class="control-label">Environment</label>
          <div class="select-wrapper">
            <select
              id="env-select"
              class="toolbar-select font-mono"
              [ngModel]="environment()"
              (ngModelChange)="onEnvChange($event)"
            >
              <option value="">All Environments</option>
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="development">development</option>
              <option value="test">test</option>
              <option value="local">local</option>
            </select>
          </div>
        </div>

        <!-- Refresh Action Button -->
        <div class="toolbar-actions">
          <button
            type="button"
            class="refresh-btn"
            [disabled]="loading() || refreshing()"
            (click)="onRefresh()"
            aria-label="Refresh analytics dashboard"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              [class.spin]="loading() || refreshing()"
            >
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <span>{{ refreshing() ? 'Refreshing...' : 'Refresh' }}</span>
          </button>
        </div>
      </div>

      <!-- Custom Range Bounds (if custom selected) -->
      @if (timeRange() === 'custom') {
        <div class="custom-range-bar">
          <div class="custom-field">
            <label class="control-label">Start (UTC)</label>
            <input
              type="text"
              class="custom-input font-mono"
              placeholder="YYYY-MM-DDTHH:mm:ssZ"
              [(ngModel)]="customStartVal"
            />
          </div>
          <div class="custom-field">
            <label class="control-label">End (UTC)</label>
            <input
              type="text"
              class="custom-input font-mono"
              placeholder="YYYY-MM-DDTHH:mm:ssZ"
              [(ngModel)]="customEndVal"
            />
          </div>
          <button type="button" class="apply-custom-btn" (click)="applyCustomRange()">
            Apply Range
          </button>
        </div>
      }

      <!-- Indeterminate Progress Bar during in-flight queries -->
      @if (loading() || refreshing()) {
        <div class="progress-bar-container" role="progressbar" aria-label="Loading query telemetry">
          <div class="progress-bar-indicator"></div>
        </div>
      }

      <!-- Telemetry and Freshness Status Footer -->
      <div class="toolbar-telemetry" role="status" aria-live="polite">
        <div class="telemetry-left">
          @if (lastUpdated()) {
            <span class="telemetry-item">
              <span class="telemetry-dot"></span>
              Updated: {{ lastUpdated() }}
            </span>
          }
          @if (executionTimeMs() > 0) {
            <span class="telemetry-item">
              Query: <strong class="font-mono">{{ executionTimeMs() }}ms</strong>
            </span>
          }
          @if (scannedBytes() > 0) {
            <span class="telemetry-item">
              Scanned: <strong class="font-mono">{{ formatBytes(scannedBytes()) }}</strong>
            </span>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .toolbar-container {
      background: var(--color-surface-card);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-3) var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .toolbar-top {
      display: flex;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: var(--space-3);
    }

    .control-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .control-label {
      font-size: 11px;
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .select-wrapper {
      position: relative;
    }

    .toolbar-select {
      height: 32px;
      padding: 0 var(--space-3);
      font-size: var(--font-size-xs);
      background: var(--color-surface-base);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      cursor: pointer;
      outline: none;
      transition: border-color var(--transition-fast);
    }

    .toolbar-select:focus {
      border-color: var(--color-brand-primary);
    }

    .toolbar-actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .refresh-btn {
      height: 32px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 var(--space-3);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-primary);
      background: var(--color-surface-hover);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .refresh-btn:hover:not(:disabled) {
      border-color: var(--color-border-strong);
      background: var(--color-surface-card);
    }

    .refresh-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .spin {
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .custom-range-bar {
      display: flex;
      align-items: flex-end;
      gap: var(--space-3);
      padding-top: var(--space-2);
      border-top: 1px dashed var(--color-border-subtle);
    }

    .custom-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .custom-input {
      height: 30px;
      padding: 0 var(--space-2);
      font-size: var(--font-size-xs);
      background: var(--color-surface-base);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      width: 220px;
    }

    .apply-custom-btn {
      height: 30px;
      padding: 0 var(--space-3);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      background: var(--color-brand-primary);
      color: #FFFFFF;
      border: none;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }

    .progress-bar-container {
      height: 2px;
      width: 100%;
      background: var(--color-surface-hover);
      overflow: hidden;
      border-radius: 1px;
    }

    .progress-bar-indicator {
      height: 100%;
      width: 35%;
      background: var(--color-brand-primary);
      animation: progress-indeterminate 1.2s infinite ease-in-out;
    }

    @keyframes progress-indeterminate {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }

    .toolbar-telemetry {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: var(--color-text-tertiary);
      padding-top: 2px;
    }

    .telemetry-left {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .telemetry-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .telemetry-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10B981;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsToolbarComponent {
  readonly timeRange = input.required<TimeRangePreset>();
  readonly interval = input<BucketInterval>('5m');
  readonly environment = input<string>('');
  readonly showIntervalSelector = input<boolean>(true);
  readonly loading = input<boolean>(false);
  readonly refreshing = input<boolean>(false);
  readonly lastUpdated = input<string | null>(null);
  readonly executionTimeMs = input<number>(0);
  readonly scannedBytes = input<number>(0);

  readonly timeRangeChange = output<TimeRangePreset>();
  readonly intervalChange = output<BucketInterval>();
  readonly environmentChange = output<string>();
  readonly refresh = output<void>();
  readonly customRangeApply = output<{ start: string; end: string }>();

  customStartVal = '';
  customEndVal = '';

  onTimeRangeChange(val: TimeRangePreset): void {
    this.timeRangeChange.emit(val);
  }

  onIntervalChange(val: BucketInterval): void {
    this.intervalChange.emit(val);
  }

  onEnvChange(val: string): void {
    this.environmentChange.emit(val);
  }

  onRefresh(): void {
    this.refresh.emit();
  }

  applyCustomRange(): void {
    if (this.customStartVal && this.customEndVal) {
      this.customRangeApply.emit({
        start: this.customStartVal,
        end: this.customEndVal,
      });
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}
