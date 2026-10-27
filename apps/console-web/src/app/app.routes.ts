import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'overview',
    pathMatch: 'full',
  },
  {
    path: 'overview',
    loadComponent: () =>
      import('./features/overview/overview.component').then(
        (m) => m.OverviewComponent
      ),
    title: 'Overview — Skyra LogHub Console',
  },
  {
    path: 'logs',
    loadComponent: () =>
      import('./features/log-explorer/log-explorer.component').then(
        (m) => m.LogExplorerComponent
      ),
    title: 'Log Explorer — Skyra LogHub Console',
  },
  {
    path: 'analytics',
    loadComponent: () =>
      import('./features/analytics/analytics.component').then(
        (m) => m.AnalyticsComponent
      ),
    title: 'Analytics — Skyra LogHub Console',
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./features/projects/projects.component').then(
        (m) => m.ProjectsComponent
      ),
    title: 'Projects — Skyra LogHub Console',
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then(
        (m) => m.SettingsComponent
      ),
    title: 'Settings — Skyra LogHub Console',
  },
  {
    path: 'showcase',
    loadComponent: () =>
      import('./features/showcase/showcase.component').then(
        (m) => m.ShowcaseComponent
      ),
    title: 'UI Showcase — Skyra LogHub Console',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then(
        (m) => m.NotFoundComponent
      ),
    title: 'Page Not Found — Skyra LogHub Console',
  },
];
