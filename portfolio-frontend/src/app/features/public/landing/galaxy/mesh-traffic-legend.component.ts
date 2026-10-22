import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { MeshTrafficService } from '../../data/mesh-traffic.service';
import { TraceInspectorService } from '../../data/trace-inspector.service';

/**
 * Leyenda de la malla del fondo: dice si el tráfico que se ve es real (eventos del backend por SSE)
 * o simulado, cuántos eventos lleva y, al pulsarla, abre el inspector con esos mismos eventos. Solo
 * aparece cuando la malla se dibuja. Va arriba a la izquierda, bajo la barra: en la portada ese hueco
 * está libre; al bajar se encoge a un punto con el número, que cabe en el margen de la página (y por
 * debajo de 1200 px de ancho, donde no hay margen, se oculta: el filtro sigue en el inspector).
 * La explicación es visible al pasar el cursor o al enfocarla, y además va en la descripción
 * accesible del botón.
 */
@Component({
  selector: 'app-mesh-traffic-legend',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: { class: 'contents', '(window:scroll)': 'onScroll()' },
  template: `
    @if (traffic.rendering()) {
      <div class="legend group fixed z-nav" [class.compact]="compact()" data-testid="mesh-traffic-legend">
        <button
          type="button"
          class="ui-focus inline-flex min-h-9 items-center gap-2 rounded-full border border-line-subtle bg-surface-1/80 px-3 py-1.5 font-mono text-mono-sm text-ink-2 backdrop-blur transition-colors duration-fast hover:text-ink-1"
          aria-describedby="mesh-traffic-help"
          (click)="inspector.selectTraffic()"
        >
          <span class="h-2 w-2 shrink-0 rounded-full" [class]="real() ? 'bg-accent-solid' : 'border border-ink-3'" aria-hidden="true"></span>
          @if (compact()) {
            <span class="tabular-nums">{{ count() }}</span>
            <span class="sr-only">{{ (real() ? 'Tráfico real' : 'Tráfico simulado') | t }}</span>
          } @else {
            <span>{{ (real() ? 'Tráfico real' : 'Tráfico simulado') | t }} · {{ count() }} {{ (count() === 1 ? 'evento' : 'eventos') | t }}</span>
          }
        </button>
        <p
          id="mesh-traffic-help"
          role="tooltip"
          class="help pointer-events-none absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-line-subtle bg-surface-1 px-3 py-2 text-body-sm text-ink-2 shadow-floating"
        >
          @if (real()) {
            {{ 'Cada ráfaga lima es un evento real del backend en este momento (caché, búsqueda vectorial, IA, autenticación). Las grises son tráfico de fondo.' | t }}
          } @else {
            {{ 'El servidor no está conectado: las ráfagas grises son eventos simulados en tu navegador. Con el backend en marcha, cada evento real se ve en lima.' | t }}
          }
          {{ 'Pulsa para ver los eventos.' | t }}
        </p>
      </div>
    }
  `,
  styles: `
    .legend {
      left: calc(1rem + env(safe-area-inset-left, 0px));
      top: calc(4.5rem + env(safe-area-inset-top, 0px));
    }
    @media (max-width: 1199px) { .legend.compact { display: none; } }
    .help { opacity: 0; transform: translateY(-4px); transition: opacity var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard); }
    .legend:hover .help, .legend:has(:focus-visible) .help { opacity: 1; transform: none; }
    @media (prefers-reduced-motion: reduce) { .help { transition: none; transform: none; } }
  `,
})
export class MeshTrafficLegendComponent {
  readonly traffic = inject(MeshTrafficService);
  readonly inspector = inject(TraceInspectorService);
  /** Hay eventos reales: la malla muestra el servidor, no una simulación. */
  readonly real = computed(() => this.traffic.real() > 0);
  readonly count = computed(() => (this.real() ? this.traffic.real() : this.traffic.simulated()));
  /** Fuera de la portada: solo el punto y el número, para no tapar el contenido. */
  readonly compact = signal(typeof window !== 'undefined' && window.scrollY > window.innerHeight * 0.6);

  onScroll(): void {
    const next = window.scrollY > window.innerHeight * 0.6;
    if (next !== this.compact()) this.compact.set(next);
  }
}
