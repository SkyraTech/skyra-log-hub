import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';

@Component({
  selector: 'skyra-analytics',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    CardComponent,
    EmptyStateComponent,
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent {
  readonly selectedDimension = signal<string>('service.name');

  readonly dimensions = [
    { label: 'service.name', value: 'service.name' },
    { label: 'log.level', value: 'log.level' },
    { label: 'http.response.status_code', value: 'http.response.status_code' },
    { label: 'host.hostname', value: 'host.hostname' },
  ];

  setDimension(dim: string): void {
    this.selectedDimension.set(dim);
  }
}
