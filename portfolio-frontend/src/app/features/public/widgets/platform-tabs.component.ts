import { ChangeDetectionStrategy, Component, ElementRef, computed, signal, viewChildren } from '@angular/core';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ArchitectureCanvasComponent } from './architecture-canvas.component';
import { IngestionSandboxComponent } from './ingestion-sandbox.component';
import { MultiTenantShieldComponent } from './multi-tenant-shield.component';
import { ResiliencePipelineComponent } from './resilience-pipeline.component';
import { TelemetryMonitorComponent } from './telemetry-monitor.component';
import { VectorMatrixComponent } from './vector-matrix.component';

export type PlatformTab = 'c4' | 'vectores' | 'ingesta' | 'resiliencia' | 'tenants';

/** Cada vista, con el dato que la resume (de la propia plataforma: no son cifras de ejemplo). */
const TABS: readonly { id: PlatformTab; title: string; fact: string }[] = [
  { id: 'c4', title: 'Diagrama C4', fact: '4 niveles' },
  { id: 'vectores', title: 'Búsqueda vectorial', fact: '768 dimensiones' },
  { id: 'ingesta', title: 'Ingesta RAG', fact: 'Texto → vector' },
  { id: 'resiliencia', title: 'Resiliencia', fact: 'Fail-open · breaker' },
  { id: 'tenants', title: 'Multi-tenant', fact: 'Filtro tenant_id' },
];

/**
 * «Arquitectura» en una sola tarjeta con pestañas (como Entrega): antes eran seis tarjetas
 * apiladas, cada una con cajas dentro. La telemetría, que es lo único en vivo, queda fija al lado.
 * Las cinco vistas están montadas (su estado se conserva al cambiar) y solo se oculta la que no
 * está abierta. Teclado según el patrón ARIA de pestañas: flechas, Inicio y Fin.
 */
@Component({
  selector: 'app-platform-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe, ArchitectureCanvasComponent, VectorMatrixComponent, IngestionSandboxComponent,
    ResiliencePipelineComponent, MultiTenantShieldComponent, TelemetryMonitorComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="layout">
      <div class="min-w-0">
        <div class="tabbar-wrap">
          <div class="tabbar" role="tablist" [attr.aria-label]="'Vistas de la arquitectura' | t" (keydown)="onKey($event)" data-testid="platform-tabs">
            @for (tab of tabs; track tab.id) {
              <button
                #tabButton
                type="button"
                role="tab"
                class="tab ui-focus"
                [id]="'ptab-' + tab.id"
                [attr.aria-selected]="active() === tab.id"
                [attr.aria-controls]="'ppanel-' + tab.id"
                [attr.tabindex]="active() === tab.id ? 0 : -1"
                [attr.data-platform-tab]="tab.id"
                (click)="active.set(tab.id)"
              >
                <span class="tab-title">{{ tab.title | t }}</span>
                <span class="tab-fact">{{ tab.fact | t }}</span>
              </button>
            }
          </div>
        </div>

        <div class="panels">
          @for (tab of tabs; track tab.id) {
            <div role="tabpanel" class="panel" [id]="'ppanel-' + tab.id" [attr.aria-labelledby]="'ptab-' + tab.id" [hidden]="active() !== tab.id">
              @switch (tab.id) {
                @case ('c4') { <app-architecture-canvas /> }
                @case ('vectores') { <app-vector-matrix /> }
                @case ('ingesta') { <app-ingestion-sandbox /> }
                @case ('resiliencia') { <app-resilience-pipeline /> }
                @case ('tenants') { <app-multi-tenant-shield /> }
              }
            </div>
          }
        </div>
      </div>

      <!-- Lo único en vivo de la sección: siempre a la vista, al lado (debajo en pantallas estrechas). -->
      <app-telemetry-monitor class="telemetry" />
    </div>
  `,
  styles: `
    .layout { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 1024px) {
      .layout { grid-template-columns: minmax(0, 1fr) 19rem; align-items: start; }
      .telemetry { position: sticky; top: calc(5rem + env(safe-area-inset-top, 0px)); }
    }
    /* La consulta de contenedor va en el envoltorio, no en el host: un contenedor con container-type
       es el bloque de referencia de los fixed interiores y el modo teatro dejaría de ocupar la ventana. */
    .tabbar-wrap { container-type: inline-size; }
    .tabbar {
      display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.25rem; padding: 0.25rem;
      border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--bg-surface-1);
    }
    .tab {
      display: flex; min-width: 0; min-height: 3.5rem; flex-direction: column; justify-content: center; gap: 0.125rem;
      padding: 0.5rem 0.75rem; border-radius: var(--radius-control); text-align: left; color: var(--text-2);
      transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard);
    }
    .tab:hover { color: var(--text-1); background: rgb(var(--c-ink-1) / 0.04); }
    .tab[aria-selected='true'] { color: var(--text-1); background: var(--bg-surface-3); box-shadow: inset 0 -2px 0 var(--accent-text); }
    .tab-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.875rem; font-weight: 600; }
    .tab-fact { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: var(--text-3); }
    @container (max-width: 44rem) {
      .tabbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tab:last-child { grid-column: 1 / -1; }
    }
    @media (pointer: coarse) { .tab { min-height: 3.5rem; } }
    .panels { margin-top: 0.75rem; }
    .panel:not([hidden]) { display: grid; grid-template-columns: minmax(0, 1fr); animation: enter var(--duration-slow) var(--ease-emphasized) backwards; }
    .panel > * { min-width: 0; }
    /* Si se amplía una tarjeta mientras aún entra, el transform de la animación atraparía el fixed. */
    .panel:has(.theater-expanded) { animation: none !important; }
    @keyframes enter { from { opacity: 0; transform: translateY(0.5rem); } }
    @media (prefers-reduced-motion: reduce) { .panel:not([hidden]) { animation: none; } .tab { transition: none; } }
  `,
})
export class PlatformTabsComponent {
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  readonly tabs = TABS;
  readonly active = signal<PlatformTab>('c4');
  private readonly index = computed(() => TABS.findIndex((tab) => tab.id === this.active()));

  onKey(event: KeyboardEvent): void {
    const last = TABS.length - 1;
    const index = this.index();
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
    if (next < 0) {
      return;
    }
    event.preventDefault();
    this.active.set(TABS[next].id);
    this.buttons()[next]?.nativeElement.focus({ preventScroll: true });
  }
}
