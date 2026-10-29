import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ReleaseService } from '../../../core/release/release';
import { TONE_DOT, useDeployedTime } from '../../../shared/ui/release-details.component';

/**
 * Prueba en vivo encima del nombre: el estado real de la API, su latencia desde tu navegador, la
 * versión desplegada y cuándo. Sustituye al saludo de plantilla («Hola, soy»): lo primero que se ve
 * es que esto es un sistema en producción. Mismos datos que la línea de estado del pie.
 */
@Component({
  selector: 'app-hero-proof',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: { class: 'block' },
  template: `
    <a href="#entrega" class="proof ui-focus" data-testid="hero-proof">
      <span class="relative flex h-2 w-2" aria-hidden="true">
        @if (tone() === 'ok') { <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-ok opacity-40 motion-reduce:hidden"></span> }
        <span class="relative inline-flex h-2 w-2 rounded-full" [class]="dot()"></span>
      </span>
      <span class="text-ink-1">{{ label() | t }}</span>
      <!-- 0 ms es un dato: no vale @if (latency()), que lo daría por vacío. -->
      @if (latency() !== null) { <span class="sep" aria-hidden="true"></span><span class="font-mono tabular-nums">{{ latency() }} ms</span> }
      @if (release(); as r) {
        <span class="sep" aria-hidden="true"></span><span class="font-mono text-ink-1">{{ r.version }}</span>
        <span class="sep max-sm:hidden" aria-hidden="true"></span><span class="max-sm:hidden">{{ 'desplegada' | t }} {{ time.ago() }}</span>
      }
      <span class="more max-sm:hidden" aria-hidden="true">{{ 'Ver cómo está hecho' | t }} →</span>
    </a>
  `,
  styles: `
    .proof {
      display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.5rem 0.625rem;
      padding: 0.375rem 0.875rem; border-radius: 999px; border: 1px solid var(--border-subtle);
      background: rgb(var(--c-surface-1) / 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      color: var(--text-2); font-size: 0.8125rem; line-height: 1.25rem;
      transition: border-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
    }
    .proof:hover { border-color: var(--border-strong); color: var(--text-1); }
    .sep { width: 1px; height: 0.75rem; background: var(--border-strong); }
    .more { color: var(--text-3); padding-left: 0.25rem; }
    .proof:hover .more { color: var(--text-1); }
  `,
})
export class HeroProofComponent {
  private readonly service = inject(ReleaseService);

  readonly release = this.service.release;
  readonly latency = this.service.latency;
  readonly time = useDeployedTime(inject(LanguageService), signal(Date.now()), () => this.release()?.deployedAt);

  /** Aquí basta con decir si está en producción y sana: el detalle va en el pie y en Delivery. */
  private readonly state = computed(() => this.service.api().state);
  readonly label = computed(() => ({
    up: 'En producción · operativa', degraded: 'En producción · degradada', unreachable: 'API sin respuesta',
    demo: 'Modo demo', loading: 'Comprobando…',
  })[this.state()]);
  readonly tone = computed(() => ({ up: 'ok', degraded: 'warn', unreachable: 'danger', demo: 'muted', loading: 'muted' } as const)[this.state()]);
  readonly dot = computed(() => TONE_DOT[this.tone()]);

  constructor() {
    this.service.load();
  }
}
