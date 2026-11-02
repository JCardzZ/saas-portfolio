import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { finalize, forkJoin } from 'rxjs';

import { FeatureFlagAuditEntry, FeatureFlagDetail, FeatureFlagsService } from '../../../core/api';
import { AuthService } from '../../../core/auth/auth.service';
import { runtimeConfig } from '../../../core/config/runtime-config';
import { describeHttpError } from '../../../core/errors/http-error';
import { isFeatureFlagKey } from '../../../core/flags/feature-flags';
import { FlagService } from '../../../core/flags/flag.service';
import { AlertComponent } from '../../../shared/ui/alert.component';

export type FlagFilter = 'all' | 'on' | 'off';

/** Área de la plataforma de cada prefijo de flag (`studio.…`, `site.…`), en el orden en que se muestran. */
const AREAS: { prefix: string; name: string; hint: string }[] = [
  { prefix: 'site', name: 'Sitio público', hint: 'Lo que ve cualquier visitante del portafolio' },
  { prefix: 'studio', name: 'Estudio de arquitectura', hint: 'El lienzo, sus reglas y sus plantillas' },
  { prefix: 'cloud', name: 'Nubes', hint: 'Proveedores que ofrece el Estudio' },
  { prefix: 'mcp', name: 'MCP', hint: 'La plataforma usada desde otra IA' },
  { prefix: 'admin', name: 'Administración', hint: 'Esta consola' },
];

export interface FlagGroup {
  prefix: string;
  name: string;
  hint: string;
  flags: FeatureFlagDetail[];
  on: number;
}

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
  /** Interruptores agrupados por área, con búsqueda y filtro (flag `admin.redesign`). */
  readonly switches = computed(() => this.flagService.isEnabled('admin.redesign'));

  readonly flags = signal<FeatureFlagDetail[]>([]);
  readonly audit = signal<FeatureFlagAuditEntry[]>([]);
  readonly loading = signal(false);
  /** Clave de la flag que se está guardando, para bloquear solo su interruptor. */
  readonly saving = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  /** En modo demo no hay backend: el cambio solo vale en este navegador. */
  readonly demo = runtimeConfig.mockMode;

  readonly query = signal('');
  readonly filter = signal<FlagFilter>('all');
  readonly filterOptions: { id: FlagFilter; label: string }[] = [
    { id: 'all', label: 'Todas' }, { id: 'on', label: 'Encendidas' }, { id: 'off', label: 'Apagadas' },
  ];
  /** Confirmación del último cambio (visible unos segundos y anunciada a los lectores de pantalla). */
  readonly announcement = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  readonly onCount = computed(() => this.flags().filter((flag) => flag.enabled).length);
  readonly groups = computed<FlagGroup[]>(() => {
    const query = this.query().trim().toLowerCase();
    const filter = this.filter();
    const visible = this.flags().filter((flag) =>
      (filter === 'all' || flag.enabled === (filter === 'on'))
      && (!query || `${flag.key} ${flag.description}`.toLowerCase().includes(query)));
    const known = AREAS.map((area) => area.prefix);
    const areas = [...AREAS, { prefix: '', name: 'Otras', hint: 'Sin área asignada' }];
    return areas
      .map((area) => {
        const all = this.flags().filter((flag) => area.prefix ? prefixOf(flag.key) === area.prefix : !known.includes(prefixOf(flag.key)));
        return { ...area, flags: visible.filter((flag) => all.includes(flag)), on: all.filter((flag) => flag.enabled).length };
      })
      .filter((group) => group.flags.length > 0);
  });

  ngOnInit(): void {
    this.load();
  }

  toggle(flag: FeatureFlagDetail): void {
    const enabled = !flag.enabled;
    this.saving.set(flag.key);
    this.error.set(null);
    if (this.switches()) {
      // Optimista: el interruptor cambia al instante y vuelve atrás si el servidor no lo guarda.
      this.setLocally(flag.key, enabled);
    }
    this.api
      .adminFeaturesKeyPut(flag.key, { enabled })
      .pipe(finalize(() => this.saving.set(null)))
      .subscribe({
        next: (saved) => {
          if (isFeatureFlagKey(saved.key)) {
            this.flagService.apply(saved.key, saved.enabled);
          }
          this.announcement.set(`${saved.key} ${saved.enabled ? 'encendida' : 'apagada'}`);
          clearTimeout(this.toastTimer);
          this.toastTimer = setTimeout(() => this.announcement.set(''), 3000);
          this.load();
        },
        error: (error: unknown) => {
          if (this.switches()) {
            this.setLocally(flag.key, !enabled);
          }
          this.error.set(describeHttpError(error));
        },
      });
  }

  private setLocally(key: string, enabled: boolean): void {
    this.flags.update((flags) => flags.map((flag) => (flag.key === key ? { ...flag, enabled } : flag)));
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

function prefixOf(key: string): string {
  return key.split('.')[0];
}
