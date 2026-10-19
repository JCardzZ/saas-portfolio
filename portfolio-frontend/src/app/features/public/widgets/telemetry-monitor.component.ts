import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, untracked,
} from '@angular/core';
import { catchError, map, of, timeout } from 'rxjs';

import { runtimeConfig } from '../../../core/config/runtime-config';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { SystemEventsService } from '../data/system-events.service';
import { ComponentState, LiveHealth, componentState, parseHealth } from '../delivery/live-health.service';

/** Muestras de latencia que se dibujan (las más recientes). */
const SAMPLES = 18;
/** Cada cuánto se vuelve a medir mientras la tarjeta está en pantalla. */
export const PROBE_EVERY_MS = 20_000;
const PROBE_TIMEOUT_MS = 8000;

type Pulse = { kind: 'demo' } | { kind: 'waiting' } | { kind: 'unreachable' } | { kind: 'ready'; health: LiveHealth };

/** Etiquetas del stream SSE (ver `telemetry-stream.service.ts`) que cuenta la tarjeta. */
const TAGS = { hit: '200 OK CacheHit Redis', miss: 'CacheMiss → PostgreSQL', rag: 'RAG query', vector: 'pgvector CosineDistance' } as const;

/**
 * Telemetría REAL de la API desplegada. Antes eran cifras simuladas en el navegador; ahora:
 * - el estado de la API y de PostgreSQL, Redis y el circuito de Gemini, de `/telemetry/health`;
 * - la latencia de esa misma petición, medida desde el navegador del visitante, cada 20 s y solo
 *   mientras la tarjeta se ve y la pestaña está activa (no se sondea por sondear);
 * - lo que ha hecho el backend desde que se abrió la página (aciertos y fallos de caché,
 *   preguntas RAG, búsquedas vectoriales), contado del stream SSE.
 * En modo demo no hay API: la tarjeta lo dice y no enseña ninguna cifra.
 */
@Component({
  selector: 'app-telemetry-monitor',
  imports: [TranslatePipe],
  host: { class: 'bento-card flex flex-col' },
  template: `
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 class="text-xl font-semibold tracking-tight text-ink-1">{{ 'Telemetría' | t }}</h3>
      <span class="badge" [attr.data-tone]="badge().tone" data-testid="telemetry-badge">
        <span class="badge-dot" aria-hidden="true"></span>{{ badge().label | t }}
      </span>
    </div>

    @if (pulse(); as state) {
      <!-- En modo demo se ve la misma estructura, con guiones: la tarjeta no queda vacía ni inventa cifras. -->
        <div class="mt-5 flex items-baseline justify-between gap-3">
          <p class="api-status" [attr.data-tone]="statusTone()" data-testid="telemetry-status">
            API {{ state.kind === 'ready' ? state.health.status : state.kind === 'unreachable' ? ('sin respuesta' | t) : state.kind === 'demo' ? '—' : '…' }}
          </p>
          <p class="font-mono text-sm tabular-nums text-ink-1" data-testid="telemetry-latency">{{ latest() ?? '—' }}<span class="text-ink-3"> ms</span></p>
        </div>
        @if (pieces().length) {
          <ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2" [attr.aria-label]="'Piezas' | t">
            @for (piece of pieces(); track piece.name) {
              <li class="inline-flex items-center gap-1.5" [attr.data-piece]="piece.name">
                <span class="dot" [attr.data-tone]="piece.state ?? 'unknown'" aria-hidden="true"></span>{{ piece.name }}
                <span class="sr-only">{{ (piece.state === 'ok' ? 'correcto' : piece.state === 'degraded' ? 'degradado' : piece.state === 'down' ? 'caído' : 'sin datos') | t }}</span>
              </li>
            }
          </ul>
        }

        <div class="mb-4 mt-4">
          <!-- Altura fija: las mediciones llegan de una en una y los huecos que faltan se ven como tales. -->
          <svg viewBox="0 0 180 48" class="h-14 w-full" preserveAspectRatio="none" role="img"
            [attr.aria-label]="('Latencia de las últimas comprobaciones, en milisegundos: ' | t) + (samples().join(', ') || '—')">
            @for (slot of slots(); track $index) {
              @if (slot === null) {
                <rect class="slot" [attr.x]="$index * 10 + 1" y="44" width="7" height="4" rx="2" />
              } @else {
                <rect class="bar" [class.bar-latest]="$last" [attr.x]="$index * 10 + 1" y="0" width="7" height="48" rx="2"
                  [style.transform]="'scaleY(' + barScale(slot) + ')'" />
              }
            }
          </svg>
          <p class="mt-1.5 text-xs leading-snug text-ink-3">{{ 'Latencia de GET /telemetry/health medida desde tu navegador, cada 20 s.' | t }}</p>
        </div>

        <!-- Al pie de la tarjeta, que se estira a la altura del diagrama de al lado. -->
        <div class="mt-auto border-t border-line-subtle pt-3">
          <p class="text-xs font-medium uppercase tracking-wider text-ink-3">{{ 'Desde que abriste la página' | t }}</p>
          <dl class="mt-2 grid grid-cols-3 gap-2" data-testid="telemetry-session">
            <div><dt class="text-xs text-ink-3">{{ 'Caché' | t }}</dt><dd class="font-mono text-base tabular-nums text-ink-1">{{ hitRatio() }}</dd></div>
            <div><dt class="text-xs text-ink-3">RAG</dt><dd class="font-mono text-base tabular-nums text-ink-1">{{ state.kind === 'demo' ? '—' : counts().rag }}</dd></div>
            <div><dt class="text-xs text-ink-3">{{ 'Vectores' | t }}</dt><dd class="font-mono text-base tabular-nums text-ink-1">{{ state.kind === 'demo' ? '—' : counts().vector }}</dd></div>
          </dl>
          @if (state.kind === 'demo') {
            <p class="mt-1.5 text-xs leading-snug text-ink-3" data-testid="telemetry-demo">{{ 'Modo demo: sin API no hay cifras reales que enseñar.' | t }}</p>
          } @else if (!counts().hit && !counts().miss && !counts().rag) {
            <p class="mt-1.5 text-xs leading-snug text-ink-3">{{ 'Pregúntale algo a la IA y lo verás aquí.' | t }}</p>
          }
        </div>
    }
  `,
  styles: `
    .badge {
      display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.125rem 0.5rem;
      border: 1px solid var(--border-subtle); border-radius: 999px; font-size: 0.75rem; color: var(--text-2);
    }
    .badge-dot, .dot { width: 0.375rem; height: 0.375rem; border-radius: 999px; background: var(--text-3); }
    [data-tone='ok'] .badge-dot, .dot[data-tone='ok'] { background: var(--status-ok); }
    [data-tone='degraded'] .badge-dot, .dot[data-tone='degraded'] { background: var(--status-warn); }
    [data-tone='down'] .badge-dot, .dot[data-tone='down'] { background: var(--status-danger); }
    .api-status { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.01em; color: var(--text-1); }
    .api-status[data-tone='ok'] { color: var(--status-ok); }
    .api-status[data-tone='degraded'] { color: var(--status-warn); }
    .api-status[data-tone='down'] { color: var(--status-danger); }
    .bar {
      fill: rgb(var(--c-ink-1) / 0.22);
      transform-box: fill-box;
      transform-origin: bottom;
      transition: transform var(--duration-slow) var(--ease-emphasized);
    }
    .bar-latest { fill: var(--accent-text); }
    .slot { fill: rgb(var(--c-ink-1) / 0.08); }
    @media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TelemetryMonitorComponent {
  private readonly http = inject(HttpClient);
  private readonly events = inject(SystemEventsService);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  readonly SAMPLES = SAMPLES;
  readonly pulse = signal<Pulse>(runtimeConfig.mockMode ? { kind: 'demo' } : { kind: 'waiting' });
  /** Latencias medidas, en ms, de la más antigua a la más reciente. */
  readonly samples = signal<number[]>([]);
  readonly latest = computed(() => this.samples().at(-1) ?? null);
  /** Las 18 posiciones del gráfico: huecos (null) a la izquierda hasta que lleguen mediciones. */
  readonly slots = computed<(number | null)[]>(() => [...Array<null>(SAMPLES - this.samples().length).fill(null), ...this.samples()]);
  readonly counts = signal({ hit: 0, miss: 0, rag: 0, vector: 0 });

  readonly statusTone = computed<ComponentState | 'unknown'>(() => {
    const state = this.pulse();
    return state.kind === 'ready' ? componentState(state.health, 'status') ?? 'unknown' : state.kind === 'unreachable' ? 'down' : 'unknown';
  });
  readonly badge = computed(() => {
    const state = this.pulse();
    if (state.kind === 'demo') return { label: 'Modo demo', tone: 'unknown' };
    if (state.kind === 'unreachable') return { label: 'Sin respuesta', tone: 'down' };
    if (state.kind === 'waiting') return { label: 'Comprobando…', tone: 'unknown' };
    return { label: 'En vivo', tone: this.statusTone() };
  });
  readonly pieces = computed(() => {
    const state = this.pulse();
    // Sin datos todavía (o en demo), las piezas se nombran sin estado: punto gris.
    if (state.kind !== 'ready') return [{ name: 'PostgreSQL', state: null }, { name: 'Redis', state: null }, { name: 'Gemini', state: null }];
    return [
      { name: 'PostgreSQL', state: componentState(state.health, 'database') },
      { name: 'Redis', state: componentState(state.health, 'redisCache') },
      { name: 'Gemini', state: componentState(state.health, 'aiEngine') },
    ];
  });
  readonly hitRatio = computed(() => {
    const { hit, miss } = this.counts();
    return hit + miss ? `${Math.round((hit / (hit + miss)) * 100)} %` : '—';
  });

  private lastSeenId = -1;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Solo cuenta lo que llega del backend a partir de ahora, no lo que ya estaba en la consola.
    this.lastSeenId = Math.max(-1, ...untracked(() => this.events.events()).map((event) => event.id));
    effect(() => {
      const fresh = this.events.events().filter((event) => event.origin === 'live' && event.id > this.lastSeenId);
      if (!fresh.length) return;
      this.lastSeenId = Math.max(...fresh.map((event) => event.id));
      untracked(() => this.counts.update((counts) => {
        const next = { ...counts };
        for (const event of fresh) {
          if (event.tag === TAGS.hit) next.hit++;
          else if (event.tag === TAGS.miss) next.miss++;
          else if (event.tag === TAGS.rag) next.rag++;
          else if (event.tag === TAGS.vector) next.vector++;
        }
        return next;
      }));
    });

    if (runtimeConfig.mockMode) {
      return;
    }
    afterNextRender(() => {
      let visible = false;
      const tick = () => {
        if (visible && document.visibilityState === 'visible') this.probe();
      };
      const observer = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([entry]) => {
          const was = visible;
          visible = entry.isIntersecting;
          if (visible && !was) this.probe();
        })
        : null;
      if (observer) observer.observe(this.host); else { visible = true; this.probe(); }
      const timer = setInterval(tick, PROBE_EVERY_MS);
      destroyRef.onDestroy(() => {
        observer?.disconnect();
        clearInterval(timer);
      });
    });
  }

  /** Escala a la medición más alta (con margen), para que se vea la variación aunque todas sean rápidas. */
  barScale(sample: number): number {
    const max = Math.max(20, ...this.samples()) * 1.15;
    return Math.max(0.08, sample / max);
  }

  /** Una comprobación real: GET /telemetry/health, cronometrada desde aquí. */
  probe(): void {
    const started = performance.now();
    this.http.get<Record<string, unknown>>(`${runtimeConfig.apiBaseUrl}/telemetry/health`).pipe(
      timeout(PROBE_TIMEOUT_MS),
      map((body) => parseHealth(body, started)),
      // 503: la API responde sin base de datos. Es un estado real, no una caída de red.
      catchError((error: unknown) => of(error instanceof HttpErrorResponse && error.status === 503
        ? parseHealth({ status: 'DOWN', database: 'Database - Unavailable' }, started)
        : null)),
    ).subscribe((health) => {
      if (!health) {
        this.pulse.set({ kind: 'unreachable' });
        return;
      }
      this.pulse.set({ kind: 'ready', health });
      this.samples.update((values) => [...values, health.latencyMs].slice(-SAMPLES));
    });
  }
}
