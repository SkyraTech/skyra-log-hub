import { Injectable, signal, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private mediaQuery: MediaQueryList | null = null;

  private readonly _themeMode = signal<ThemeMode>('dark');
  private readonly _resolvedTheme = signal<ResolvedTheme>('dark');

  readonly themeMode = this._themeMode.asReadonly();
  readonly resolvedTheme = this._resolvedTheme.asReadonly();

  constructor() {
    if (this.isBrowser) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQuery.addEventListener('change', () => {
        if (this._themeMode() === 'system') {
          this.applyTheme('system');
        }
      });

      const savedTheme = localStorage.getItem('skyra-theme') as ThemeMode | null;
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system')) {
        this.setTheme(savedTheme);
      } else {
        this.setTheme('dark');
      }
    }
  }

  setTheme(mode: ThemeMode): void {
    this._themeMode.set(mode);
    this.applyTheme(mode);
    if (this.isBrowser) {
      localStorage.setItem('skyra-theme', mode);
    }
  }

  toggleTheme(): void {
    const nextTheme: ThemeMode = this._resolvedTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  private applyTheme(mode: ThemeMode): void {
    if (!this.isBrowser) return;

    let target: ResolvedTheme = 'dark';
    if (mode === 'system') {
      target = this.mediaQuery?.matches ? 'dark' : 'light';
    } else {
      target = mode;
    }

    this._resolvedTheme.set(target);
    document.documentElement.setAttribute('data-theme', target);
    document.documentElement.classList.toggle('dark', target === 'dark');
  }
}
