import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';

@Component({
  selector: 'skyra-overview',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    CardComponent,
    BadgeComponent,
    EmptyStateComponent,
  ],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent {
  private readonly workspaceContext = inject(WorkspaceContextService);
  readonly context = this.workspaceContext.currentContext;
}
