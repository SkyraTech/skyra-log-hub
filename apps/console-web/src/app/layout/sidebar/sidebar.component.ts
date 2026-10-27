import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export interface NavItem {
  label: string;
  route: string;
  icon: string;
  badge?: string;
  isDev?: boolean;
}

@Component({
  selector: 'skyra-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly collapsed = input<boolean>(false);
  readonly toggleCollapse = output<void>();

  readonly navItems: NavItem[] = [
    {
      label: 'Overview',
      route: '/overview',
      icon: 'grid',
    },
    {
      label: 'Log Explorer',
      route: '/logs',
      icon: 'terminal',
      badge: 'Core',
    },
    {
      label: 'Analytics',
      route: '/analytics',
      icon: 'bar-chart',
    },
    {
      label: 'Projects',
      route: '/projects',
      icon: 'folder',
    },
    {
      label: 'Settings',
      route: '/settings',
      icon: 'settings',
    },
    {
      label: 'UI Showcase',
      route: '/showcase',
      icon: 'eye',
      badge: 'Dev',
      isDev: true,
    },
  ];

  onToggle(): void {
    this.toggleCollapse.emit();
  }
}
