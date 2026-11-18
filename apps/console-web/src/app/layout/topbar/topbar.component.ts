import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeToggleComponent } from '../../shared/ui/theme-toggle/theme-toggle.component';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { BreadcrumbsComponent } from '../breadcrumbs/breadcrumbs.component';
import { Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

@Component({
  selector: 'skyra-topbar',
  standalone: true,
  imports: [CommonModule, ThemeToggleComponent, BreadcrumbsComponent],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopbarComponent {
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly organizationPage = toSignal(this.router.events.pipe(filter(event => event instanceof NavigationEnd), map(() => this.router.url.startsWith('/organization'))), { initialValue: this.router.url.startsWith('/organization') });

  readonly projectsPage = toSignal(this.router.events.pipe(filter(event => event instanceof NavigationEnd), map(() => this.router.url.startsWith('/projects'))), { initialValue: this.router.url.startsWith('/projects') });
  readonly activeTenant=this.workspaceContext.activeTenant;
  readonly selectedProjectNames=this.workspaceContext.selectedProjectNames;

  readonly toggleMobileNav = output<void>();

  readonly currentContext = this.workspaceContext.currentContext;
  readonly currentUser = this.authService.currentUser;
  readonly isAuthenticated = this.authService.isAuthenticated;

  onMobileNavClick(): void {
    this.toggleMobileNav.emit();
  }
}
