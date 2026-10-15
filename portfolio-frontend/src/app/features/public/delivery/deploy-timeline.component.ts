import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import { TheaterToggleComponent } from '../../../shared/ui/theater-toggle.component';
import { TheaterDirective } from '../../../shared/ui/theater.directive';
import { DeployTarget, Deployment, TOPOLOGY, formatDate } from './delivery-data';
import { DeliveryStatusService } from './delivery-status.service';

interface Lane {
  target: DeployTarget;
  title: string;
  where: string;
  /** `planned`: la pieza aún no existe en producción (según deploy/topology.json). */
  planned: boolean;
}

/** Lo que tarda la animación del rollback simulado en pasar de una versión a otra. */
const SIMULATION_MS = 900;

/**
 * Línea de tiempo de despliegues, de solo lectura: qué versión está en producción, cuáles hubo
 * antes y con qué resultado. Los datos son los que publica el CD en pipeline-status.json.
 *
 * «Simular rollback» solo mueve el marcador en esta pantalla, con la etiqueta «Simulación»: no
 * hace ninguna petición. Volver de verdad a una versión anterior es un workflow (rollback.yml) que
 * solo puede lanzar quien tiene permisos en el repositorio.
 */
@Component({
    selector: 'app-deploy-timeline',
    imports: [TranslatePipe, TheaterToggleComponent],
    hostDirectives: [TheaterDirective],
    host: { class: 'bento-card block' },
    template: `
    <app-theater-toggle name="Despliegues y rollback" />
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pr-10">
      <h3 class="text-xl font-semibold tracking-tight text-ink-1">{{ 'Despliegues y rollback' | t }}</h3>
      <p class="text-xs text-ink-3">{{ 'Solo lectura · datos del CD' | t }}</p>
    </div>

    <div class="mt-6 grid gap-8 md:grid-cols-2 [&>*]:min-w-0">
      @for (lane of lanes; track lane.target) {
        <section [attr.aria-label]="('Despliegues de ' | t) + lane.title">
          <p class="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-ink-3">
            {{ lane.title }}
            <span class="normal-case tracking-normal text-ink-3">{{ lane.where }}</span>
            @if (lane.planned) {
              <span class="rounded-full border border-dashed border-line-control px-2 py-0.5 normal-case tracking-normal text-ink-2">{{ 'planificado' | t }}</span>
            }
          </p>

          @if (history(lane.target); as deployments) {
            @if (deployments.length > 0) {
              <ol class="rail mt-3">
                @for (deployment of deployments; track deployment.runId + deployment.kind; let index = $index) {
                  <li class="entry" [class.current]="index === currentIndex(lane.target)" [class.simulated]="simulating() && lane.target === 'frontend' && index === currentIndex(lane.target)">
                    <span class="mark" aria-hidden="true"></span>
                    <div class="min-w-0">
                      <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="text-sm font-medium text-ink-1">#{{ deployment.runNumber }}</span>
                        <code class="font-mono text-xs text-ink-2">{{ deployment.sha.slice(0, 7) }}</code>
                        @if (deployment.kind === 'rollback') {
                          <span class="rounded-full border border-line-strong px-2 py-0.5 text-xs text-ink-2">rollback</span>
                        }
                        @if (index === currentIndex(lane.target)) {
                          <span class="rounded-full border px-2 py-0.5 text-xs font-medium"
                            [class]="simulating() && lane.target === 'frontend' ? 'border-status-warn/50 text-status-warn' : 'border-status-ok/40 text-status-ok'">
                            {{ simulating() && lane.target === 'frontend' ? ('en producción · simulación' | t) : ('en producción' | t) }}
                          </span>
                        }
                      </p>
                      <p class="mt-0.5 text-xs text-ink-2">
                        {{ date(deployment.at) }}@if (deployment.by) { · {{ deployment.by }} }
                      </p>
                      <p class="mt-0.5 flex items-center gap-1.5 text-xs" [class]="deployment.healthy === false ? 'text-status-danger' : 'text-ink-2'">
                        <span class="h-2 w-2 rounded-full" [class]="deployment.healthy === true ? 'bg-status-ok' : deployment.healthy === false ? 'bg-status-danger' : 'border border-line-control'" aria-hidden="true"></span>
                        {{ deployment.healthy === true ? ('Salud comprobada' | t) : deployment.healthy === false ? ('No pasó la comprobación de salud' | t) : ('Salud sin comprobar' | t) }}
                      </p>
                    </div>
                  </li>
                }
              </ol>
            } @else {
              <p class="mt-3 rounded-control border border-dashed border-line-strong p-4 text-sm text-ink-2">
                {{ lane.planned ? ('Sin despliegues: todavía no existe en producción. Cuando exista, su historial y su rollback aparecerán aquí.' | t) : (loaded() ? ('Aún no hay despliegues publicados.' | t) : ('Cargando…' | t)) }}
              </p>
            }
          }
        </section>
      }
    </div>

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="focus-ring rounded-control border border-line-strong px-4 py-1.5 text-sm font-medium text-ink-1 transition duration-200 ease-out hover:bg-surface-3 disabled:opacity-40"
        [disabled]="!canSimulate() || animating()"
        (click)="simulating() ? reset() : simulate()"
      >{{ simulating() ? ('Deshacer la simulación' | t) : ('Simular rollback' | t) }}</button>
      <p class="min-w-0 flex-1 text-xs text-ink-3" aria-live="polite">
        @if (simulating()) {
          <span class="mr-1 rounded-full border border-status-warn/50 px-2 py-0.5 font-medium text-status-warn">{{ 'Simulación' | t }}</span>
          Producción no ha cambiado: el marcador se movió solo en esta pantalla.
        } @else {
          Desde aquí no se puede revertir producción. El rollback real es un workflow manual, con aprobación.
        }
      </p>
    </div>
  `,
    styles: `
    .rail { position: relative; margin: 0; padding: 0; list-style: none; }
    .entry { position: relative; display: flex; gap: 0.75rem; padding: 0 0 1.5rem 0; transition: opacity 0.25s ease-out; }
    .entry:last-child { padding-bottom: 0; }
    /* La línea que une un despliegue con el anterior. */
    .entry:not(:last-child)::before {
      content: ''; position: absolute; left: 3.5px; top: 14px; bottom: -4px; width: 1px; background: rgb(var(--c-ink-1) / 0.14);
    }
    .mark {
      flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 9999px;
      background: var(--bg-surface-2); box-shadow: inset 0 0 0 1px var(--text-3);
      transition: background-color 0.3s ease-out, box-shadow 0.3s ease-out, transform 0.3s ease-out;
    }
    .entry.current .mark { background: var(--status-ok); box-shadow: 0 0 0 3px rgb(var(--c-status-ok) / 0.18); }
    .entry.simulated .mark { background: var(--status-warn); box-shadow: 0 0 0 3px rgb(245 185 74 / 0.2); transform: scale(1.15); }
    .entry:not(.current) { opacity: 0.72; }
    @media (prefers-reduced-motion: reduce) {
      .entry, .mark { transition: none; }
    }
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeployTimelineComponent implements OnInit {
  private readonly delivery = inject(DeliveryStatusService);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly loaded = this.delivery.loaded;
  /** Rollback simulado en pantalla: el marcador de producción está en la versión anterior. */
  readonly simulating = signal(false);
  readonly animating = signal(false);

  /** Qué piezas existen ya en producción lo dice la topología, no esta vista. */
  readonly lanes: Lane[] = [
    { target: 'frontend', title: 'Frontend', where: 'Cloudflare Pages', planned: isPlanned('pages') },
    { target: 'backend', title: 'Backend', where: 'VPS · imagen por digest', planned: isPlanned('backend') },
  ];

  private readonly deployments = computed(() => this.delivery.status()?.deployments ?? { frontend: [], backend: [] });
  /** Hay a qué volver: un despliegue anterior del frontend. */
  readonly canSimulate = computed(() => this.deployments().frontend.length > 1);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  ngOnInit(): void {
    this.delivery.load();
  }

  history(target: DeployTarget): Deployment[] {
    return this.deployments()[target];
  }

  /** Posición del despliegue que está en producción: el más reciente, o el anterior durante la simulación. */
  currentIndex(target: DeployTarget): number {
    return target === 'frontend' && this.simulating() ? 1 : 0;
  }

  date(iso: string): string {
    return formatDate(iso);
  }

  /** Mueve el marcador a la versión anterior. No llama a ningún servicio. */
  simulate(): void {
    if (!this.canSimulate()) {
      return;
    }
    this.simulating.set(true);
    this.hold();
  }

  reset(): void {
    this.simulating.set(false);
    this.hold();
  }

  /** Evita pulsaciones encadenadas mientras dura el cambio. */
  private hold(): void {
    this.clear();
    this.animating.set(true);
    this.timer = setTimeout(() => this.animating.set(false), SIMULATION_MS);
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

function isPlanned(nodeId: string): boolean {
  return TOPOLOGY.nodes.find((node) => node.id === nodeId)?.status !== 'live';
}
