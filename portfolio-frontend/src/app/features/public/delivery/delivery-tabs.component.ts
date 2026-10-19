import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChildren,
} from '@angular/core';

import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { DeliveryStatusService } from './delivery-status.service';
import { DELIVERY_TABS, DeliveryTab, DeliveryTabsService, tabAnchor, tabFromHash } from './delivery-tabs.service';
import { DeployTimelineComponent } from './deploy-timeline.component';
import { TOPOLOGY } from './delivery-data';
import { LiveHealthService } from './live-health.service';
import { MergeHistoryComponent } from './merge-history.component';
import { PipelineViewComponent } from './pipeline-view.component';
import { ProductionArchitectureComponent } from './production-architecture.component';

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

interface TabMeta {
  id: DeliveryTab;
  title: string;
  /** Qué responde la vista, para quien no la ha abierto aún. */
  question: string;
}

const TABS: readonly TabMeta[] = [
  { id: 'arquitectura', title: 'Arquitectura', question: '¿Qué hay en producción?' },
  { id: 'historial', title: 'Historial Git', question: '¿Cómo se ha construido?' },
  { id: 'pipeline', title: 'Pipeline CI/CD', question: '¿Qué comprueba cada cambio?' },
  { id: 'despliegues', title: 'Despliegues', question: '¿Cómo llega y cómo se revierte?' },
];

/**
 * «Arquitectura real y entrega» en una sola tarjeta con pestañas, como el Estudio: la sección deja
 * de ocupar cuatro pantallas y cada vista sigue a un toque. Para que no se pierda nada:
 * - cada pestaña dice en su rótulo un dato real de su vista (estado de la API, commits, CI, versión);
 * - las cuatro vistas están montadas desde el principio (su texto sigue en la página, su estado se
 *   conserva al cambiar) y solo se oculta la que no está abierta;
 * - cada una tiene su ancla (`#entrega-pipeline`), así que se puede enlazar y el botón Atrás funciona;
 * - la barra marca lo ya visto y cada vista termina con un acceso a la siguiente.
 * Teclado según el patrón ARIA de pestañas: flechas, Inicio y Fin.
 */
@Component({
  selector: 'app-delivery-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ProductionArchitectureComponent, MergeHistoryComponent, PipelineViewComponent, DeployTimelineComponent],
  host: { class: 'block' },
  template: `
    <!-- La consulta de contenedor va en este envoltorio y no en el host: un contenedor con
         \`container-type\` es el bloque de referencia de los \`fixed\` interiores, y el modo teatro
         de las tarjetas de las vistas dejaría de ocupar la ventana. -->
    <div class="tabbar-wrap">
    <div class="tabbar" role="tablist" [attr.aria-label]="'Vistas de entrega' | t" (keydown)="onKey($event)" data-testid="delivery-tabs">
      @for (tab of tabs; track tab.id; let i = $index) {
        <button
          #tabButton
          type="button"
          role="tab"
          class="tab ui-focus"
          [id]="'tab-' + tab.id"
          [attr.aria-selected]="active() === tab.id"
          [attr.aria-controls]="'panel-' + tab.id"
          [attr.tabindex]="active() === tab.id ? 0 : -1"
          [attr.data-delivery-tab]="tab.id"
          (click)="open(tab.id)"
        >
          <span class="tab-top">
            <span class="step" [class.seen]="visited().has(tab.id)" aria-hidden="true">
              @if (visited().has(tab.id) && active() !== tab.id) { ✓ } @else { {{ i + 1 }} }
            </span>
            <span class="tab-title">{{ tab.title | t }}</span>
          </span>
          <span class="tab-status" [attr.data-tone]="status()[tab.id].tone">
            <span class="dot" aria-hidden="true"></span>
            <span class="truncate">{{ status()[tab.id].text }}</span>
          </span>
        </button>
      }
      <span class="ink" aria-hidden="true" [style.--i]="activeIndex()"></span>
    </div>
    </div>

    <p class="tour" aria-live="polite">
      <span class="tour-q">{{ current().question | t }}</span>
      <span class="tour-count">{{ visited().size }}/{{ tabs.length }} {{ 'vistas' | t }}</span>
    </p>

    <div class="panels">
      @for (tab of tabs; track tab.id; let i = $index) {
        <div
          role="tabpanel"
          class="panel"
          [id]="'panel-' + tab.id"
          [attr.aria-labelledby]="'tab-' + tab.id"
          [hidden]="active() !== tab.id"
          [attr.data-dir]="direction()"
        >
          @switch (tab.id) {
            @case ('arquitectura') { <app-production-architecture /> }
            @case ('historial') { <app-merge-history /> }
            @case ('pipeline') { <app-pipeline-view /> }
            @case ('despliegues') { <app-deploy-timeline /> }
          }
          @if (tabs[i + 1]; as next) {
            <button type="button" class="next ui-focus" (click)="open(next.id, true)" [attr.data-next]="next.id">
              <span class="next-label">{{ 'Siguiente' | t }}</span>
              <span class="next-title">{{ next.title | t }} <span aria-hidden="true">→</span></span>
              <span class="next-q">{{ next.question | t }}</span>
            </button>
          } @else {
            <button type="button" class="next ui-focus" (click)="open(tabs[0].id, true)" data-next="arquitectura">
              <span class="next-label">{{ 'Has visto las cuatro vistas' | t }}</span>
              <span class="next-title">{{ 'Volver a la arquitectura' | t }} <span aria-hidden="true">↺</span></span>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { --tabs: 4; }
    .tabbar-wrap { container-type: inline-size; }
    .tabbar {
      position: relative;
      display: grid;
      grid-template-columns: repeat(var(--tabs), minmax(0, 1fr));
      gap: 0.25rem;
      padding: 0.25rem;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--bg-surface-1);
    }
    .tab {
      position: relative;
      z-index: 1;
      display: flex;
      min-width: 0;
      min-height: 3.75rem;
      flex-direction: column;
      justify-content: center;
      gap: 0.25rem;
      padding: 0.5rem 0.75rem;
      border-radius: var(--radius-control);
      text-align: left;
      color: var(--text-2);
      transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard);
    }
    .tab:hover { color: var(--text-1); background: rgb(var(--c-ink-1) / 0.04); }
    .tab[aria-selected='true'] { color: var(--text-1); background: transparent; }
    .tab-top { display: flex; min-width: 0; align-items: center; gap: 0.5rem; }
    .tab-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.875rem; font-weight: 600; }
    .step {
      display: inline-grid;
      width: 1.25rem;
      height: 1.25rem;
      flex: none;
      place-items: center;
      border: 1px solid var(--border-control);
      border-radius: 999px;
      font: 600 0.75rem/1 var(--font-mono);
      color: var(--text-3);
      transition: all var(--duration-base) var(--ease-emphasized);
    }
    .step.seen { border-color: transparent; background: color-mix(in srgb, var(--status-ok) 20%, transparent); color: var(--status-ok); }
    .tab[aria-selected='true'] .step { border-color: var(--accent-text); background: var(--accent-solid); color: var(--accent-on); }
    .tab-status { display: flex; min-width: 0; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: var(--text-3); font-variant-numeric: tabular-nums; }
    .dot { width: 0.5rem; height: 0.5rem; flex: none; border-radius: 999px; background: var(--text-3); }
    [data-tone='ok'] .dot { background: var(--status-ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--status-ok) 22%, transparent); animation: beat 2.4s var(--ease-standard) infinite; }
    [data-tone='warn'] .dot { background: var(--status-warn); }
    [data-tone='bad'] .dot { background: var(--status-danger); }
    @keyframes beat { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--status-ok) 0%, transparent); } }

    /* La pastilla de la pestaña abierta se desliza a su sitio (una sola pieza que se mueve, no cuatro fondos). */
    .ink {
      position: absolute;
      top: 0.25rem;
      bottom: 0.25rem;
      left: 0.25rem;
      width: calc((100% - 0.5rem - 0.75rem) / var(--tabs));
      border: 1px solid var(--border-control);
      border-radius: var(--radius-control);
      background: var(--bg-surface-3);
      box-shadow: inset 0 -2px 0 var(--accent-text);
      transform: translateX(calc(var(--i, 0) * (100% + 0.25rem)));
      transition: transform var(--duration-layout) var(--ease-emphasized);
    }

    .tour { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem; margin: 0.75rem 0.25rem; }
    .tour-q { font-size: 0.875rem; color: var(--text-2); }
    .tour-count { font: 500 0.75rem var(--font-mono); color: var(--text-3); }

    .panel:not([hidden]) { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; animation: enter var(--duration-slow) var(--ease-emphasized) both; }
    /* Como antes en la rejilla de la página: una vista nunca empuja la tarjeta más allá de su ancho. */
    .panel > * { min-width: 0; }
    .panel[data-dir='back']:not([hidden]) { animation-name: enter-back; }
    /* Una animación con transform convierte al panel (y a la sección) en el bloque de referencia de
       los fixed: si se amplía una tarjeta mientras aún entra, el modo teatro no ocuparía la ventana. */
    :host(:has(.theater-expanded)), .panel:has(.theater-expanded) { animation: none !important; }
    @keyframes enter { from { opacity: 0; transform: translateX(1.5rem); } }
    @keyframes enter-back { from { opacity: 0; transform: translateX(-1.5rem); } }

    .next {
      display: grid;
      justify-items: start;
      gap: 0.125rem;
      padding: 1rem 1.25rem;
      border: 1px dashed var(--border-control);
      border-radius: var(--radius-card);
      text-align: left;
      transition: border-color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard);
    }
    .next:hover { border-style: solid; border-color: var(--accent-text); background: var(--bg-surface-1); }
    .next-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); }
    .next-title { font-size: 1rem; font-weight: 600; color: var(--text-1); }
    .next-q { font-size: 0.875rem; color: var(--text-2); }

    /* Estrecho: dos por fila, sin pastilla deslizante (no hay una sola fila por la que deslizarse). */
    @container (max-width: 40rem) {
      .tabbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .ink { display: none; }
      .tab[aria-selected='true'] { background: var(--bg-surface-3); box-shadow: inset 0 -2px 0 var(--accent-text); }
    }
    @media (pointer: coarse) { .tab { min-height: 3.75rem; } }
    @media (prefers-reduced-motion: reduce) {
      .ink, .step { transition: none; }
      .panel:not([hidden]) { animation: none; }
      [data-tone='ok'] .dot { animation: none; }
    }
  `,
})
export class DeliveryTabsComponent {
  private readonly tabsState = inject(DeliveryTabsService);
  private readonly statusService = inject(DeliveryStatusService);
  private readonly health = inject(LiveHealthService);
  private readonly language = inject(LanguageService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  readonly tabs = TABS;
  readonly active = this.tabsState.active;
  readonly visited = this.tabsState.visited;
  readonly activeIndex = computed(() => DELIVERY_TABS.indexOf(this.active()));
  readonly current = computed(() => TABS[this.activeIndex()]);
  /** Hacia dónde entra la vista nueva: desde la derecha si avanza, desde la izquierda si vuelve. */
  readonly direction = signal<'forward' | 'back'>('forward');

  /** Un dato real por pestaña. Sin datos, lo dice: nunca un valor de relleno. */
  readonly status = computed<Record<DeliveryTab, { text: string; tone: Tone }>>(() => {
    const es = this.language.lang() === 'es';
    const status = this.statusService.status();
    const state = this.health.state();
    const live = TOPOLOGY.nodes.filter((node) => node.status === 'live').length;

    let arquitectura: { text: string; tone: Tone };
    if (state.kind === 'ready') {
      const tone: Tone = state.health.status === 'UP' ? 'ok' : state.health.status === 'DEGRADED' ? 'warn' : 'bad';
      arquitectura = { text: `API ${state.health.status} · ${state.health.latencyMs} ms`, tone };
    } else if (state.kind === 'unreachable') {
      arquitectura = { text: es ? 'API sin respuesta' : 'API not responding', tone: 'bad' };
    } else {
      arquitectura = { text: es ? `${live} piezas en producción` : `${live} pieces live`, tone: 'neutral' };
    }

    const commits = status?.commits.length ?? 0;
    const merges = status?.merges.length ?? 0;
    const historial = commits
      ? { text: es ? `${commits} commits · ${merges} PR` : `${commits} commits · ${merges} PRs`, tone: 'neutral' as Tone }
      : { text: es ? 'Sin datos todavía' : 'No data yet', tone: 'neutral' as Tone };

    const ci = status?.workflows.ci;
    const pipeline = ci
      ? {
        text: ci.conclusion === 'success' ? (es ? `CI correcta · #${ci.runNumber}` : `CI passed · #${ci.runNumber}`) : (es ? `CI con fallos · #${ci.runNumber}` : `CI failed · #${ci.runNumber}`),
        tone: (ci.conclusion === 'success' ? 'ok' : 'bad') as Tone,
      }
      : { text: es ? 'Sin datos todavía' : 'No data yet', tone: 'neutral' as Tone };

    const last = status?.deployments.frontend[0] ?? status?.deployments.backend[0];
    const despliegues = last
      ? { text: es ? `v${last.runNumber} en producción` : `v${last.runNumber} in production`, tone: (last.healthy === false ? 'bad' : last.healthy ? 'ok' : 'neutral') as Tone }
      : { text: es ? 'Sin despliegues todavía' : 'No deployments yet', tone: 'neutral' as Tone };

    return { arquitectura, historial, pipeline, despliegues };
  });

  constructor() {
    this.statusService.load();
    this.health.load();
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      // Un enlace a una vista (#entrega-pipeline) la abre; también con Atrás y Adelante.
      const fromHash = () => {
        const tab = tabFromHash(location.hash);
        if (tab) {
          this.select(tab);
          this.host.nativeElement.closest('section')?.scrollIntoView({ block: 'start' });
        }
      };
      fromHash();
      window.addEventListener('hashchange', fromHash);
      destroyRef.onDestroy(() => window.removeEventListener('hashchange', fromHash));
    });
  }

  /** Abre una vista. Desde «Siguiente», además lleva la barra a la vista para leerla desde arriba. */
  open(tab: DeliveryTab, fromNext = false): void {
    this.select(tab);
    history.replaceState(history.state, '', `#${tabAnchor(tab)}`);
    if (fromNext) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.host.nativeElement.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      this.focusTab(DELIVERY_TABS.indexOf(tab));
    }
  }

  onKey(event: KeyboardEvent): void {
    const last = TABS.length - 1;
    const index = this.activeIndex();
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
    if (next < 0) {
      return;
    }
    event.preventDefault();
    this.open(DELIVERY_TABS[next]);
    this.focusTab(next);
  }

  private select(tab: DeliveryTab): void {
    this.direction.set(DELIVERY_TABS.indexOf(tab) >= this.activeIndex() ? 'forward' : 'back');
    this.tabsState.select(tab);
  }

  private focusTab(index: number): void {
    this.buttons()[index]?.nativeElement.focus({ preventScroll: true });
  }
}
