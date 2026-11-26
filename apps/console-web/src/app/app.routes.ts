import type { CredentialsComponent } from './features/credentials/credentials.component';
const credentialChangesGuard:CanDeactivateFn<CredentialsComponent>=c=>c.canLeave();
import type { CanDeactivateFn } from '@angular/router';
import type { ProjectsComponent } from './features/projects/projects.component';
const projectChangesGuard:CanDeactivateFn<ProjectsComponent>=c=>c.canLeave();
import { Routes } from '@angular/router';
import { authGuard, orgAdminGuard } from './core/auth/auth.guard';
import { organizationSessionGuard, organizationChangesGuard } from './features/organization/organization.guard';
import {memberChangesGuard} from './features/members/members.guard';

export const routes: Routes = [
  {path:'developer/getting-started',canActivate:[organizationSessionGuard],loadComponent:()=>import('./features/developer/getting-started.component').then(m=>m.GettingStartedComponent),title:'Developer getting started - Skyra LogHub'},
  {path:'projects/:projectId/usage',canActivate:[organizationSessionGuard],canDeactivate:[(c:any)=>c.canLeave()],loadComponent:()=>import('./features/usage/usage.component').then(m=>m.UsageComponent),title:'Quotas & usage — Skyra LogHub'},
  {path:'projects/:projectId/retention',canActivate:[organizationSessionGuard],canDeactivate:[(c:any)=>c.canLeave()],loadComponent:()=>import('./features/retention/retention.component').then(m=>m.RetentionComponent),title:'Retention policy — Skyra LogHub'},
  ...[{path:'projects/:projectId/credentials/new',data:{create:true}},{path:'projects/:projectId/credentials/:credentialId'},{path:'projects/:projectId/credentials'}].map(route=>({...route,canActivate:[organizationSessionGuard],canDeactivate:[credentialChangesGuard],loadComponent:()=>import('./features/credentials/credentials.component').then(m=>m.CredentialsComponent),title:'Ingestion credentials â€” Skyra LogHub'})),
  ...[{path:'projects/new',data:{create:true}},{path:'projects/:projectId/settings',data:{settings:true}},{path:'projects/:projectId'}].map(route=>({...route,canActivate:[organizationSessionGuard],canDeactivate:[projectChangesGuard],loadComponent:()=>import('./features/projects/projects.component').then(m=>m.ProjectsComponent),title:'Projects â€” Skyra LogHub'})),
  {path:'organization/audit',canActivate:[organizationSessionGuard],loadComponent:()=>import('./features/audit/audit.component').then(m=>m.AuditComponent),title:'Audit History - Skyra LogHub'},
  {path:'organization/members/:membershipId',canActivate:[organizationSessionGuard],canDeactivate:[memberChangesGuard],loadComponent:()=>import('./features/members/members.component').then(m=>m.MembersComponent),title:'Member details â€” Skyra LogHub'},
  {path:'organization/members',canActivate:[organizationSessionGuard],loadComponent:()=>import('./features/members/members.component').then(m=>m.MembersComponent),title:'Members & roles â€” Skyra LogHub'},
  { path: 'organization', canActivate: [organizationSessionGuard], loadComponent: () => import('./features/organization/organization.component').then(m => m.OrganizationComponent), title: 'Organization â€” Skyra LogHub' },
  { path: 'organization/settings', canActivate: [organizationSessionGuard], canDeactivate: [organizationChangesGuard], data: { settings: true }, loadComponent: () => import('./features/organization/organization.component').then(m => m.OrganizationComponent), title: 'Organization settings â€” Skyra LogHub' },
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
    title: 'Sign In â€” Skyra LogHub Console',
  },
  {
    path: 'unauthorized',
    loadComponent: () =>
      import('./features/unauthorized/unauthorized.component').then(
        (m) => m.UnauthorizedComponent
      ),
    title: 'Access Restricted â€” Skyra LogHub Console',
  },
  {
    path: 'overview',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/overview/overview.component').then(
        (m) => m.OverviewComponent
      ),
    title: 'Overview â€” Skyra LogHub Console',
  },
  {
    path: 'logs',
    canActivate: [organizationSessionGuard],
    loadComponent: () =>
      import('./features/log-explorer/log-explorer.component').then(
        (m) => m.LogExplorerComponent
      ),
    title: 'Log Explorer â€” Skyra LogHub Console',
  },
  {
    path: 'analytics',
    canActivate: [organizationSessionGuard],
    loadComponent: () =>
      import('./features/analytics/analytics.component').then(
        (m) => m.AnalyticsComponent
      ),
    title: 'Analytics â€” Skyra LogHub Console',
  },
  {
    path: 'projects',
    canActivate: [organizationSessionGuard],
    loadComponent: () =>
      import('./features/projects/projects.component').then(
        (m) => m.ProjectsComponent
      ),
    title: 'Projects â€” Skyra LogHub Console',
  },
  {
    path: 'settings',
    canActivate: [authGuard, orgAdminGuard],
    loadComponent: () =>
      import('./features/settings/settings.component').then(
        (m) => m.SettingsComponent
      ),
    title: 'Settings â€” Skyra LogHub Console',
  },
  {
    path: 'showcase',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/showcase/showcase.component').then(
        (m) => m.ShowcaseComponent
      ),
    title: 'UI Showcase â€” Skyra LogHub Console',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then(
        (m) => m.NotFoundComponent
      ),
    title: 'Page Not Found â€” Skyra LogHub Console',
  },
];
