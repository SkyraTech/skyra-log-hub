import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, ThemeMode } from '../../../core/theme/theme.service';

@Component({
  selector: 'skyra-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="theme-toggle-group" role="group" aria-label="Theme mode switcher">
      <button
        type="button"
        class="toggle-btn"
        [class.active]="themeService.themeMode() === 'light'"
        (click)="setTheme('light')"
        title="Light theme"
        aria-label="Light theme">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      </button>

      <button
        type="button"
        class="toggle-btn"
        [class.active]="themeService.themeMode() === 'dark'"
        (click)="setTheme('dark')"
        title="Dark theme"
        aria-label="Dark theme">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </button>

      <button
        type="button"
        class="toggle-btn"
        [class.active]="themeService.themeMode() === 'system'"
        (click)="setTheme('system')"
        title="System preference"
        aria-label="System preference">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
      </button>
    </div>
  `,
  styles: [`
    .theme-toggle-group {
      display: inline-flex;
      align-items: center;
      background: var(--color-bg-base);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-sm);
      padding: 2px;
      gap: 2px;
    }
    .toggle-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: var(--radius-xs);
      color: var(--color-text-secondary);
      transition: all var(--transition-fast);
    }
    .toggle-btn:hover {
      color: var(--color-text-primary);
      background: var(--color-surface-hover);
    }
    .toggle-btn.active {
      background: var(--color-surface-default);
      color: var(--color-brand-primary);
      box-shadow: var(--shadow-sm);
    }
  `]
})
export class ThemeToggleComponent {
  readonly themeService = inject(ThemeService);

  setTheme(mode: ThemeMode): void {
    this.themeService.setTheme(mode);
  }
}
