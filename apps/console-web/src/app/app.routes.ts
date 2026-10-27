import { Routes } from '@angular/router';
import { authGuard, orgAdminGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'overview',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then(
        (m) => m.LoginComponent
      ),
    title: 'Sign In — Skyra LogHub Console',
  },
  {
    path: 'unauthorized',
    loadComponent: () =>
      import('./features/unauthorized/unauthorized.component').then(
        (m) => m.UnauthorizedComponent
      ),
    title: 'Access Restricted — Skyra LogHub Console',
  },
  {
    path: 'overview',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/overview/overview.component').then(
        (m) => m.OverviewComponent
      ),
    title: 'Overview — Skyra LogHub Console',
  },
  {
    path: 'logs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/log-explorer/log-explorer.component').then(
        (m) => m.LogExplorerComponent
      ),
    title: 'Log Explorer — Skyra LogHub Console',
  },
  {
    path: 'analytics',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/analytics/analytics.component').then(
        (m) => m.AnalyticsComponent
      ),
    title: 'Analytics — Skyra LogHub Console',
  },
  {
    path: 'projects',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/projects/projects.component').then(
        (m) => m.ProjectsComponent
      ),
    title: 'Projects — Skyra LogHub Console',
  },
  {
    path: 'settings',
    canActivate: [authGuard, orgAdminGuard],
    loadComponent: () =>
      import('./features/settings/settings.component').then(
        (m) => m.SettingsComponent
      ),
    title: 'Settings — Skyra LogHub Console',
  },
  {
    path: 'showcase',
    canActivate: [authGuard],
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
