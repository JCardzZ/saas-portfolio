import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
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

    <div class="mt-5 grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
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
              <!-- Cada despliegue es una barra (el más reciente a la derecha): de un vistazo, cuántos hubo y cómo salieron. -->
              <div class="mt-3 flex items-center gap-3">
                <div class="strip" role="img" [attr.aria-label]="('Historial de salud' | t) + ': ' + summary(deployments)">
                  @for (deployment of reversed(deployments); track deployment.runId + deployment.kind) {
                    <span class="tick" [class.ok]="deployment.healthy === true" [class.bad]="deployment.healthy === false"
                      [class.rolled]="deployment.kind === 'rollback'"
                      [class.on]="deployments.indexOf(deployment) === currentIndex(lane.target)"></span>
                  }
                </div>
                <p class="shrink-0 text-xs tabular-nums text-ink-3">{{ summary(deployments) }}</p>
              </div>

              <ol class="mt-3">
                @for (deployment of deployments; track deployment.runId + deployment.kind; let index = $index) {
                  <li class="entry" [hidden]="!showAll(lane.target) && index >= visible && index !== currentIndex(lane.target)"
                    [class.current]="index === currentIndex(lane.target)"
                    [class.simulated]="simulating() && lane.target === 'frontend' && index === currentIndex(lane.target)">
                    <span class="mark" aria-hidden="true"></span>
                    <span class="text-sm font-medium tabular-nums text-ink-1">#{{ deployment.runNumber }}</span>
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
                    <span class="ml-auto flex min-w-0 items-center gap-2 text-xs text-ink-3">
                      <span class="truncate">{{ date(deployment.at) }}@if (deployment.by) { · {{ deployment.by }} }</span>
                      <span class="h-2 w-2 shrink-0 rounded-full" [class]="deployment.healthy === true ? 'bg-status-ok' : deployment.healthy === false ? 'bg-status-danger' : 'border border-line-control'" aria-hidden="true"></span>
                      <span [class]="deployment.healthy === false ? 'text-status-danger' : index === currentIndex(lane.target) ? 'text-ink-2' : 'sr-only'">{{ health(deployment) }}</span>
                    </span>
                  </li>
                }
              </ol>

              @if (deployments.length > visible) {
                <button type="button" class="focus-ring mt-2 rounded-control px-2 py-1 text-xs font-medium text-accent-text hover:bg-surface-3"
                  [attr.aria-expanded]="showAll(lane.target)" (click)="toggleAll(lane.target)">
                  {{ showAll(lane.target) ? ('Ver menos' | t) : ('Ver historial completo' | t) + ' (' + deployments.length + ')' }}
                </button>
              }
            } @else {
              <p class="mt-3 rounded-control border border-dashed border-line-strong px-3 py-2.5 text-sm text-ink-2">
                {{ lane.planned ? ('Sin desplegar: todavía no existe en producción.' | t) : (loaded() ? ('Aún no hay despliegues publicados.' | t) : ('Cargando…' | t)) }}
              </p>
            }
          }
        </section>
      }
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-3">
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
    .entry {
      position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem;
      padding: 0.375rem 0.5rem; margin: 0 -0.5rem; border-radius: 6px; transition: opacity 0.25s ease-out, background-color 0.25s ease-out;
    }
    /* La línea que une un despliegue con el anterior. */
    .entry:not(:last-child)::before {
      content: ''; position: absolute; left: calc(0.5rem + 3.5px); top: 1.25rem; bottom: -0.5rem; width: 1px; background: rgb(var(--c-ink-1) / 0.14);
    }
    .entry[hidden] { display: none; }
    .mark {
      position: relative; flex: none; width: 8px; height: 8px; border-radius: 9999px;
      background: var(--bg-surface-2); box-shadow: inset 0 0 0 1px var(--text-3);
      transition: background-color 0.3s ease-out, box-shadow 0.3s ease-out, transform 0.3s ease-out;
    }
    .entry.current .mark { background: var(--status-ok); box-shadow: 0 0 0 3px rgb(var(--c-status-ok) / 0.18); }
    .entry.simulated .mark { background: var(--status-warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-warn) 20%, transparent); transform: scale(1.15); }
    .entry:not(.current) { opacity: 0.72; }

    /* Una barra por despliegue; la altura marca cuál está en producción. */
    .strip { display: flex; flex: 1 1 auto; min-width: 0; align-items: flex-end; gap: 3px; height: 28px; }
    .tick {
      flex: 1 1 0; max-width: 14px; min-width: 3px; height: 14px; border-radius: 2px;
      background: rgb(var(--c-ink-1) / 0.18); transition: height 0.3s ease-out, background-color 0.3s ease-out;
    }
    .tick.ok { background: rgb(var(--c-status-ok) / 0.55); }
    .tick.bad { background: var(--status-danger); }
    .tick.rolled { box-shadow: inset 0 2px 0 var(--status-warn); }
    .tick.on { height: 28px; background: var(--status-ok); }
    @media (prefers-reduced-motion: reduce) {
      .entry, .mark, .tick { transition: none; }
    }
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeployTimelineComponent implements OnInit {
  private readonly delivery = inject(DeliveryStatusService);
  private readonly language = inject(LanguageService);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly loaded = this.delivery.loaded;
  /** Rollback simulado en pantalla: el marcador de producción está en la versión anterior. */
  readonly simulating = signal(false);
  readonly animating = signal(false);
  private readonly expanded = signal<ReadonlySet<DeployTarget>>(new Set());
  /** Filas que se ven sin desplegar el historial. */
  readonly visible = 3;

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

  showAll(target: DeployTarget): boolean {
    return this.expanded().has(target);
  }

  toggleAll(target: DeployTarget): void {
    const next = new Set(this.expanded());
    if (!next.delete(target)) {
      next.add(target);
    }
    this.expanded.set(next);
  }

  reversed(deployments: Deployment[]): Deployment[] {
    return [...deployments].reverse();
  }

  health(deployment: Deployment): string {
    return deployment.healthy === true ? this.tr('Salud comprobada')
      : deployment.healthy === false ? this.tr('No pasó la comprobación de salud') : this.tr('Salud sin comprobar');
  }

  /** «20 despliegues · 19 sanos · 1 rollback», contado de los datos del CD. */
  summary(deployments: Deployment[]): string {
    const healthy = deployments.filter((item) => item.healthy === true).length;
    const rollbacks = deployments.filter((item) => item.kind === 'rollback').length;
    const parts = [`${deployments.length} ${this.tr(deployments.length === 1 ? 'despliegue' : 'despliegues')}`, `${healthy} ${this.tr('sanos')}`];
    if (rollbacks > 0) {
      parts.push(`${rollbacks} rollback`);
    }
    return parts.join(' · ');
  }

  /** Lo mismo que el pipe `t`, para los textos que se componen en la clase. */
  private tr(es: string): string {
    const dictionary = this.language.dictionary();
    return this.language.lang() === 'en' && dictionary ? (dictionary[es] ?? es) : es;
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
