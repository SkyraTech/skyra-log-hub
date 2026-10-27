import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppShellComponent } from './layout/app-shell/app-shell.component';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'skyra-root',
  standalone: true,
  imports: [CommonModule, AppShellComponent],
  template: `<skyra-app-shell />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  // Injecting ThemeService ensures theme is initialized on application boot
  private readonly themeService = inject(ThemeService);
}
