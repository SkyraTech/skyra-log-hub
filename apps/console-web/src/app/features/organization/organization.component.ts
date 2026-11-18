import {AuditLinkComponent} from '../audit/audit-link.component';
import { Component, ChangeDetectionStrategy, CUSTOM_ELEMENTS_SCHEMA, inject, signal, computed, DestroyRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { OrganizationApiService, OrganizationView } from './organization-api.service';

@Component({ selector: 'skyra-organization', standalone: true, imports: [CommonModule,AuditLinkComponent], schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './organization.component.html', styleUrl: './organization.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class OrganizationComponent {
  private readonly api = inject(OrganizationApiService);
  private readonly destroy = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private pending?: Subscription;
  readonly settings = this.route.snapshot.data['settings'] === true;
  readonly organization = signal<OrganizationView|null>(null);
  readonly name = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal(false);
  readonly denied = signal(false);
  readonly conflict = signal(false);
  readonly canEdit = computed(() => this.organization()?.status === 'ACTIVE' && !!this.organization()?.capabilities.includes('tenant.update'));
  readonly dirty = computed(() => !!this.organization() && this.name() !== this.organization()?.name);
  readonly validation = computed(() => {
    const length = Array.from(this.name().trim()).length;
    return length < 2 || length > 255 ? 'Enter a name containing 2–255 characters.' : '';
  });
  constructor() { this.load(); }
  load() {
    this.pending?.unsubscribe(); this.loading.set(true); this.error.set(''); this.denied.set(false); this.conflict.set(false);
    this.pending = this.api.read().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: value => { this.organization.set(value); this.name.set(value.name); this.loading.set(false); },
      error: error => { this.loading.set(false); this.handle(error); },
    });
  }
  change(event: Event) { this.name.set((event.target as HTMLElement & { value: string }).value); this.success.set(false); }
  save() {
    const value = this.organization();
    if (!value || !this.canEdit() || !this.dirty() || this.validation() || this.saving() || this.conflict()) return;
    this.saving.set(true); this.success.set(false); this.error.set('');
    this.api.save(this.name().trim(),value.version).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: updated => { this.organization.set(updated); this.name.set(updated.name); this.saving.set(false); this.success.set(true); },
      error: error => { this.saving.set(false); this.handle(error); },
    });
  }
  cancel() { if (this.conflict()) { this.load(); return; } this.name.set(this.organization()?.name ?? ''); this.error.set(''); this.success.set(false); }
  reload() { if (!this.dirty() || window.confirm('Discard your draft and load the latest organization?')) { this.success.set(false); this.load(); } }
  edit() { void this.router.navigateByUrl('/organization/settings'); }
  overview() { void this.router.navigateByUrl('/organization'); }
  canLeave() { return !this.settings || !this.dirty() || window.confirm('Discard unsaved organization changes?'); }
  @HostListener('window:beforeunload', ['$event']) unload(event: BeforeUnloadEvent) {
    if (this.settings && this.dirty() && !this.loading()) { event.preventDefault(); event.returnValue = ''; }
  }
  private handle(error: HttpErrorResponse) {
    this.denied.set(error.status === 403 || error.status === 404);
    this.conflict.set(error.status === 409 || error.status === 412 || error.status === 428);
    if (error.status === 401) {
      this.organization.set(null); this.auth.logout(); void this.router.navigateByUrl('/login'); return;
    }
    if (this.denied()) this.organization.set(null);
    this.error.set(this.conflict() ? 'This organization changed. Your draft was not saved. Reload the latest values before retrying.' :
      this.denied() ? 'You do not have permission to view or manage this organization.' :
      'Organization service is unavailable. Your changes were not saved. Please retry.');
  }
}
