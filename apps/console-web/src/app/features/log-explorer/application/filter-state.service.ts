import { Injectable, signal, computed } from '@angular/core';
import { TimeRangePreset, LogSearchCriteria } from '../domain/log-search.model';
import { FilterChip } from '../domain/log-filter.model';

@Injectable()
export class FilterStateService {
  readonly queryText = signal<string>('');
  readonly timeRangePreset = signal<TimeRangePreset>('15m');
  readonly customStart = signal<string>('');
  readonly customEnd = signal<string>('');
  readonly selectedLevels = signal<string[]>([]);
  readonly selectedServices = signal<string[]>([]);
  readonly selectedEnvironments = signal<string[]>([]);
  readonly traceId = signal<string>('');

  /** Active chips representing all currently applied filters */
  readonly filterChips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = [];

    const query = this.queryText().trim();
    if (query) {
      chips.push({
        id: 'query',
        category: 'query',
        label: `text: "${query.length > 25 ? query.substring(0, 25) + '…' : query}"`,
        value: query,
      });
    }

    const tid = this.traceId().trim();
    if (tid) {
      chips.push({
        id: 'trace',
        category: 'trace',
        label: `trace: ${tid.substring(0, 8)}…`,
        value: tid,
      });
    }

    for (const lvl of this.selectedLevels()) {
      chips.push({
        id: `level_${lvl}`,
        category: 'level',
        label: `level: ${lvl}`,
        value: lvl,
      });
    }

    for (const s of this.selectedServices()) {
      chips.push({
        id: `service_${s}`,
        category: 'service',
        label: `service: ${s}`,
        value: s,
      });
    }

    for (const env of this.selectedEnvironments()) {
      chips.push({
        id: `env_${env}`,
        category: 'environment',
        label: `env: ${env}`,
        value: env,
      });
    }

    return chips;
  });

  readonly hasActiveFilters = computed<boolean>(() => {
    return (
      this.queryText().trim().length > 0 ||
      this.traceId().trim().length > 0 ||
      this.selectedLevels().length > 0 ||
      this.selectedServices().length > 0 ||
      this.selectedEnvironments().length > 0 ||
      this.timeRangePreset() !== '15m'
    );
  });

  setQueryText(text: string): void {
    this.queryText.set(text);
  }

  setTraceId(traceId: string): void {
    this.traceId.set(traceId);
  }

  setTimeRange(preset: TimeRangePreset, customStart?: string, customEnd?: string): void {
    this.timeRangePreset.set(preset);
    if (customStart !== undefined) this.customStart.set(customStart);
    if (customEnd !== undefined) this.customEnd.set(customEnd);
  }

  toggleLevel(level: string): void {
    const current = this.selectedLevels();
    if (current.includes(level)) {
      this.selectedLevels.set(current.filter((l) => l !== level));
    } else {
      this.selectedLevels.set([...current, level]);
    }
  }

  setLevels(levels: string[]): void {
    this.selectedLevels.set(levels);
  }

  toggleService(service: string): void {
    const current = this.selectedServices();
    if (current.includes(service)) {
      this.selectedServices.set(current.filter((s) => s !== service));
    } else {
      this.selectedServices.set([...current, service]);
    }
  }

  toggleEnvironment(env: string): void {
    const current = this.selectedEnvironments();
    if (current.includes(env)) {
      this.selectedEnvironments.set(current.filter((e) => e !== env));
    } else {
      this.selectedEnvironments.set([...current, env]);
    }
  }

  removeChip(chip: FilterChip): void {
    switch (chip.category) {
      case 'query':
        this.queryText.set('');
        break;
      case 'trace':
        this.traceId.set('');
        break;
      case 'level':
        this.toggleLevel(chip.value);
        break;
      case 'service':
        this.toggleService(chip.value);
        break;
      case 'environment':
        this.toggleEnvironment(chip.value);
        break;
    }
  }

  clearAllFilters(): void {
    this.queryText.set('');
    this.traceId.set('');
    this.selectedLevels.set([]);
    this.selectedServices.set([]);
    this.selectedEnvironments.set([]);
    this.timeRangePreset.set('15m');
    this.customStart.set('');
    this.customEnd.set('');
  }

  getCriteria(limit: number): LogSearchCriteria {
    return {
      timeRangePreset: this.timeRangePreset(),
      customStart: this.customStart(),
      customEnd: this.customEnd(),
      queryText: this.queryText().trim(),
      levels: this.selectedLevels(),
      services: this.selectedServices(),
      environments: this.selectedEnvironments(),
      traceId: this.traceId().trim() || undefined,
      limit,
    };
  }
}
