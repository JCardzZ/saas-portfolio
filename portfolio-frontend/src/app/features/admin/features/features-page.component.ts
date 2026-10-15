import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { finalize, forkJoin } from 'rxjs';

import { FeatureFlagAuditEntry, FeatureFlagDetail, FeatureFlagsService } from '../../../core/api';
import { AuthService } from '../../../core/auth/auth.service';
import { runtimeConfig } from '../../../core/config/runtime-config';
import { describeHttpError } from '../../../core/errors/http-error';
import { isFeatureFlagKey } from '../../../core/flags/feature-flags';
import { FlagService } from '../../../core/flags/flag.service';
import { AlertComponent } from '../../../shared/ui/alert.component';

/**
 * Feature flags: lo nuevo llega apagado y se enciende aquí, sin desplegar. Cada cambio queda
 * en la auditoría con el cliente que lo hizo.
 */
@Component({
    selector: 'app-features-page',
    imports: [DatePipe, AlertComponent],
    templateUrl: './features-page.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeaturesPageComponent implements OnInit {
  private readonly api = inject(FeatureFlagsService);
  private readonly flagService = inject(FlagService);
  /** Quien solo tiene `flags:read` ve las flags y su historial, pero no las cambia. */
  readonly canWrite = inject(AuthService).can('flags:write');

  readonly flags = signal<FeatureFlagDetail[]>([]);
  readonly audit = signal<FeatureFlagAuditEntry[]>([]);
  readonly loading = signal(false);
  /** Clave de la flag que se está guardando, para bloquear solo su interruptor. */
  readonly saving = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  /** En modo demo no hay backend: el cambio solo vale en este navegador. */
  readonly demo = runtimeConfig.mockMode;

  ngOnInit(): void {
    this.load();
  }

  toggle(flag: FeatureFlagDetail): void {
    this.saving.set(flag.key);
    this.error.set(null);
    this.api
      .adminFeaturesKeyPut(flag.key, { enabled: !flag.enabled })
      .pipe(finalize(() => this.saving.set(null)))
      .subscribe({
        next: (saved) => {
          if (isFeatureFlagKey(saved.key)) {
            this.flagService.apply(saved.key, saved.enabled);
          }
          this.load();
        },
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }

  private load(): void {
    this.loading.set(true);
    forkJoin({ flags: this.api.adminFeaturesGet(), audit: this.api.adminFeaturesAuditGet() })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ flags, audit }) => {
          this.flags.set(flags);
          this.audit.set(audit);
        },
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }
}
