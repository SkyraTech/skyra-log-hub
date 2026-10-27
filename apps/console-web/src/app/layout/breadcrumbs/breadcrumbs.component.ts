import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

interface Crumb {
  label: string;
  url: string;
  current: boolean;
}

const ROUTE_LABELS: Record<string, string> = {
  overview: 'Overview',
  logs: 'Log Explorer',
  analytics: 'Analytics',
  projects: 'Projects',
  settings: 'Settings',
  showcase: 'UI Showcase',
};

@Component({
  selector: 'skyra-breadcrumbs',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav aria-label="Breadcrumbs" class="breadcrumbs-nav">
      <ol class="breadcrumbs-list">
        <li class="crumb-item">
          <a routerLink="/" class="crumb-link">Console</a>
          <span class="crumb-separator" aria-hidden="true">/</span>
        </li>
        @for (crumb of crumbs(); track crumb.url; let last = $last) {
          <li class="crumb-item">
            @if (last) {
              <span class="crumb-current" aria-current="page">{{ crumb.label }}</span>
            } @else {
              <a [routerLink]="crumb.url" class="crumb-link">{{ crumb.label }}</a>
              <span class="crumb-separator" aria-hidden="true">/</span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styles: [`
    .breadcrumbs-nav {
      display: flex;
      align-items: center;
    }
    .breadcrumbs-list {
      display: flex;
      align-items: center;
      list-style: none;
      padding: 0;
      margin: 0;
      gap: var(--space-2);
      font-size: var(--text-xs);
    }
    .crumb-item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .crumb-link {
      color: var(--text-muted);
      text-decoration: none;
      transition: color var(--transition-fast);
    }
    .crumb-link:hover {
      color: var(--text-primary);
    }
    .crumb-separator {
      color: var(--text-muted);
      user-select: none;
    }
    .crumb-current {
      color: var(--text-primary);
      font-weight: var(--font-semibold);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreadcrumbsComponent {
  private readonly router = inject(Router);

  private readonly navEnd = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  readonly crumbs = computed<Crumb[]>(() => {
    const url = this.navEnd();
    const segments = url.split('/').filter(Boolean);
    if (segments.length === 0) {
      return [{ label: 'Overview', url: '/overview', current: true }];
    }
    return segments.map((seg, i) => {
      const path = '/' + segments.slice(0, i + 1).join('/');
      return {
        label: ROUTE_LABELS[seg] || seg,
        url: path,
        current: i === segments.length - 1,
      };
    });
  });
}
