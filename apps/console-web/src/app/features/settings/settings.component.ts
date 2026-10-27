import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { ThemeService, ThemeMode } from '../../core/theme/theme.service';
import { AppConfigService } from '../../core/config/app-config.service';

@Component({
  selector: 'skyra-settings',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    CardComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly themeService = inject(ThemeService);
  private readonly configService = inject(AppConfigService);

  readonly currentTheme = this.themeService.themeMode;
  readonly resolvedTheme = this.themeService.resolvedTheme;
  readonly config = this.configService.config;

  setTheme(mode: ThemeMode): void {
    this.themeService.setTheme(mode);
  }
}
