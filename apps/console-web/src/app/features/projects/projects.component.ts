import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';

@Component({
  selector: 'skyra-projects',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, CardComponent, BadgeComponent],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsComponent {
  private readonly workspaceContext = inject(WorkspaceContextService);
  readonly context = this.workspaceContext.currentContext;
}
