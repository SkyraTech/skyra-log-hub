import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FacetsState, FilterChip, FacetCount } from '../../domain/log-filter.model';
import { SeverityBadgeComponent, LogSeverity } from '../../../../shared/ui/severity-badge/severity-badge.component';

@Component({
  selector: 'skyra-filter-panel',
  standalone: true,
  imports: [CommonModule, SeverityBadgeComponent],
  templateUrl: './filter-panel.component.html',
  styleUrl: './filter-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterPanelComponent {
  readonly facets = input<FacetsState>({
    services: [],
    levels: [],
    environments: [],
    actions: [],
    loading: false,
    error: null,
  });

  readonly selectedLevels = input<string[]>([]);
  readonly selectedServices = input<string[]>([]);
  readonly selectedEnvironments = input<string[]>([]);
  readonly filterChips = input<FilterChip[]>([]);

  readonly levelToggle = output<string>();
  readonly serviceToggle = output<string>();
  readonly envToggle = output<string>();
  readonly chipRemove = output<FilterChip>();
  readonly clearAll = output<void>();
  readonly refreshFacets = output<void>();

  readonly allSeverities: readonly LogSeverity[] = [
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
  ];

  isLevelSelected(lvl: string): boolean {
    return this.selectedLevels().includes(lvl);
  }

  isServiceSelected(srv: string): boolean {
    return this.selectedServices().includes(srv);
  }

  isEnvSelected(env: string): boolean {
    return this.selectedEnvironments().includes(env);
  }

  getLevelCount(lvl: string): number | null {
    const item = this.facets().levels.find((l) => l.value.toLowerCase() === lvl.toLowerCase());
    return item ? item.count : null;
  }

  onLevelClick(lvl: string): void {
    this.levelToggle.emit(lvl);
  }

  onServiceClick(srv: string): void {
    this.serviceToggle.emit(srv);
  }

  onEnvClick(env: string): void {
    this.envToggle.emit(env);
  }

  onChipRemove(chip: FilterChip): void {
    this.chipRemove.emit(chip);
  }

  onClearAll(): void {
    this.clearAll.emit();
  }

  onRefreshFacets(): void {
    this.refreshFacets.emit();
  }
}
