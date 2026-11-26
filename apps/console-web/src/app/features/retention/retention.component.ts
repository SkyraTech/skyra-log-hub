import {
  Component,
  ChangeDetectionStrategy,
  CUSTOM_ELEMENTS_SCHEMA,
  inject,
  signal,
  computed,
  DestroyRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ProjectsApiService, type ProjectView } from '../projects/projects-api.service';
import { RetentionApiService, type RetentionView } from '../projects/retention-api.service';
import { AuditLinkComponent } from '../audit/audit-link.component';

@Component({
  selector: 'skyra-retention',
  standalone: true,
  imports: [CommonModule, AuditLinkComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './retention.component.html',
  styleUrl: './retention.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetentionComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly projectsApi = inject(ProjectsApiService);
  private readonly retentionApi = inject(RetentionApiService);

  private pendingProject?: Subscription;
  private pendingRetention?: Subscription;

  readonly projectId = this.route.snapshot.paramMap.get('projectId') ?? '';

  readonly project = signal<ProjectView | null>(null);
  readonly policy = signal<RetentionView | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly denied = signal(false);

  // Form signals
  readonly daysText = signal('30');
  readonly enableParquetPurge = signal(true);
  readonly isLegalHold = signal(false);
  readonly confirmingLegalHold = signal(false);
  private pendingLegalHoldValue = false;

  readonly validDays = computed(() => {
    const txt = this.daysText().trim();
    if (!/^\d+$/.test(txt)) return false;
    const n = parseInt(txt, 10);
    return n >= 1 && n <= 365;
  });

  readonly dirty = computed(() => {
    const p = this.policy();
    if (!p) return false;
    const days = parseInt(this.daysText().trim(), 10);
    return (
      days !== p.retentionDays ||
      this.enableParquetPurge() !== p.enableParquetPurge ||
      this.isLegalHold() !== p.isLegalHold
    );
  });

  constructor() {
    this.load();
  }

  load() {
    if (!this.projectId) {
      this.denied.set(true);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.denied.set(false);

    this.pendingProject?.unsubscribe();
    this.pendingRetention?.unsubscribe();

    this.pendingProject = this.projectsApi
      .read(this.projectId)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (proj) => {
          this.project.set(proj);
          this.fetchRetention();
        },
        error: (err: HttpErrorResponse) => this.handleError(err),
      });
  }

  private fetchRetention() {
    this.pendingRetention = this.retentionApi
      .getRetention(this.projectId)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (ret) => {
          this.policy.set(ret);
          this.daysText.set(String(ret.retentionDays));
          this.enableParquetPurge.set(ret.enableParquetPurge);
          this.isLegalHold.set(ret.isLegalHold);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => this.handleError(err),
      });
  }

  onDaysInput(val: string) {
    this.daysText.set(val);
  }

  onLegalHoldToggle(checked: boolean) {
    this.pendingLegalHoldValue = checked;
    this.confirmingLegalHold.set(true);
  }

  confirmLegalHoldChange() {
    this.isLegalHold.set(this.pendingLegalHoldValue);
    this.confirmingLegalHold.set(false);
  }

  cancelLegalHoldConfirmation() {
    this.confirmingLegalHold.set(false);
  }

  reset() {
    const p = this.policy();
    if (p) {
      this.daysText.set(String(p.retentionDays));
      this.enableParquetPurge.set(p.enableParquetPurge);
      this.isLegalHold.set(p.isLegalHold);
    }
    this.error.set('');
    this.success.set('');
  }

  requestSave() {
    if (!this.validDays() || !this.dirty() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');

    const days = parseInt(this.daysText().trim(), 10);
    const body = {
      retentionDays: days,
      enableParquetPurge: this.enableParquetPurge(),
      isLegalHold: this.isLegalHold(),
    };

    this.retentionApi
      .updateRetention(this.projectId, body)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.policy.set(updated);
          this.daysText.set(String(updated.retentionDays));
          this.enableParquetPurge.set(updated.enableParquetPurge);
          this.isLegalHold.set(updated.isLegalHold);
          this.success.set('Retention policy updated successfully.');
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.handleError(err);
        },
      });
  }

  reload() {
    if (!this.dirty() || window.confirm('Discard unsaved retention changes and reload?')) {
      this.load();
    }
  }

  back() {
    void this.router.navigate(['/projects', this.projectId]);
  }

  canLeave(): boolean {
    return !this.dirty() || window.confirm('Discard unsaved retention policy changes?');
  }

  @HostListener('window:beforeunload', ['$event'])
  unload(e: BeforeUnloadEvent) {
    if (this.dirty() && !this.loading()) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  private handleError(err: HttpErrorResponse) {
    this.loading.set(false);
    if (err.status === 401) {
      this.auth.logout();
      void this.router.navigateByUrl('/login');
      return;
    }
    if (err.status === 403 || err.status === 404) {
      this.denied.set(true);
      this.error.set('You do not have permission to view or manage retention for this project.');
      return;
    }
    if (err.status === 409) {
      this.error.set('Retention policy conflict. Reload the page before saving.');
      return;
    }
    this.error.set(err.error?.detail || err.error?.message || 'Retention service is unavailable. Please retry later.');
  }
}
