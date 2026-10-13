import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import { SystemEventKind, SystemEventStep, SystemEventsService } from '../data/system-events.service';
import { TelemetryStreamService } from '../data/telemetry-stream.service';

const AMBIENT_INTERVAL_MS = 1700;

/** El color solo dice el nivel: correcto en verde, aviso en ámbar; lo demás, neutro. */
const KIND_CLASSES: Record<SystemEventKind, string> = {
  ok: 'text-status-ok',
  cache: 'text-ink-1',
  vector: 'text-ink-1',
  ai: 'text-ink-1',
  auth: 'text-ink-1',
  info: 'text-ink-1',
  warn: 'text-status-warn',
};

const random = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/** Actividad de fondo: lo que el sistema registraría con tráfico normal. */
const AMBIENT: (() => SystemEventStep)[] = [
  () => ['ok', '200 OK CacheHit Redis', `GET /public/projects · ${random(1, 4)} ms`],
  () => ['cache', 'CacheMiss → PostgreSQL', 'repoblado · TTL 10m'],
  () => ['vector', `pgvector CosineDistance: 0.${random(8, 31).toString().padStart(2, '0')}`, 'HNSW · top-5'],
  () => ['ai', `GeminiFlash ${random(96, 142)} tokens/sec`, 'generateContent'],
  () => ['auth', 'JWT Verified', 'ROLE_ADMIN · exp 1h'],
  () => ['info', `RateLimit ${random(1, 6)}/10`, 'rag-query · ventana 60 s'],
  () => ['info', 'CircuitBreaker aiEngine', 'CLOSED'],
  () => ['ok', '200 OK', `GET /telemetry/health · ${random(4, 12)} ms`],
];

/**
 * Consola de eventos con aspecto de terminal. Si el stream SSE del backend está conectado
 * muestra sus eventos reales; si no (modo demo o backend caído) genera actividad simulada.
 * Los widgets de la landing añaden además sus propias simulaciones, siempre marcadas.
 */
@Component({
  selector: 'app-event-console',
  standalone: true,
  imports: [TranslatePipe],
  host: { class: 'bento-card flex flex-col overflow-hidden !p-0' },
  template: `
    <div class="flex min-h-9 flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-1">
      <h3 class="min-w-0 flex-1 truncate font-mono text-mono-sm font-normal text-ink-2">system-events</h3>
      <span class="ui-badge" [class.ui-badge-ok]="telemetry.status() === 'live'" [class.ui-badge-warn]="telemetry.status() === 'simulated'" data-testid="console-origin">
        <span class="ui-badge-dot" aria-hidden="true"></span>{{ statusLabel() | t }}
      </span>
      <button type="button" class="ui-btn-ghost" [attr.aria-pressed]="paused()" (click)="paused.set(!paused())">
        {{ paused() ? ('Reanudar' | t) : ('Pausar' | t) }}
      </button>
    </div>

    <!-- aria-live apagado: un flujo continuo saturaría a un lector de pantalla. -->
    <div #log class="h-72 flex-1 overflow-y-auto px-4 py-3 font-mono text-mono" role="log" aria-live="off" [attr.aria-label]="'Eventos simulados del sistema' | t" tabindex="0">
      @for (event of events.events(); track event.id) {
        <!-- Dos columnas: la hora, y el evento, que al partirse sigue bajo su propia columna. -->
        <p class="log-row animate-fade-in" [class.user-event]="event.fromUser" [style.animation-delay.ms]="event.stagger">
          <span class="tabular-nums text-ink-3">@if (event.origin === 'live') {<span class="text-status-ok" [attr.title]="'Evento real del backend' | t">● </span>}{{ event.time }}</span>
          <span class="min-w-0 break-words"><span [class]="kindClasses[event.kind]">[{{ event.tag }}]</span><span class="text-ink-2"> {{ event.detail }}</span></span>
        </p>
      } @empty {
        <p class="text-ink-3">{{ 'Esperando eventos…' | t }}</p>
      }
    </div>

    <p class="border-t border-line-subtle px-4 py-2 text-caption font-normal text-ink-3">
      @if (telemetry.status() === 'live') {
        <span class="text-status-ok">●</span> Eventos reales del backend.
      }
      <span class="text-accent-text">▍</span> {{ 'Simulaciones que provocas tú en los widgets de esta página.' | t }}
    </p>
  `,
  styles: `
    .log-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      column-gap: 0.75rem;
    }
    .user-event {
      margin-left: -0.5rem;
      border-left: 2px solid var(--accent-text);
      background: rgb(var(--c-accent-text) / 0.08);
      padding-left: calc(0.5rem - 2px);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventConsoleComponent implements OnInit {
  readonly events = inject(SystemEventsService);
  readonly telemetry = inject(TelemetryStreamService);
  private readonly destroyRef = inject(DestroyRef);

  readonly kindClasses = KIND_CLASSES;
  readonly paused = signal(false);
  readonly statusLabel = computed(
    () => ({ live: 'en vivo', connecting: 'conectando…', simulated: 'simulación' })[this.telemetry.status()],
  );

  private readonly log = viewChild<ElementRef<HTMLElement>>('log');

  constructor() {
    // Sigue el final del registro a medida que llegan eventos.
    effect(() => {
      this.events.events();
      const element = this.log()?.nativeElement;
      if (element) {
        setTimeout(() => (element.scrollTop = element.scrollHeight));
      }
    });
  }

  ngOnInit(): void {
    // Con "reducir movimiento" no hay flujo ambiental: solo aparecen los eventos del visitante.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.paused.set(true);
    }
    this.telemetry.connect();
    // El generador simulado es el respaldo: calla en cuanto llegan eventos reales.
    const ticker = setInterval(() => {
      if (!this.paused() && !document.hidden && this.telemetry.status() !== 'live') {
        this.emitAmbient();
      }
    }, AMBIENT_INTERVAL_MS);
    if (this.telemetry.status() !== 'live') {
      this.emitAmbient();
    }
    this.destroyRef.onDestroy(() => {
      clearInterval(ticker);
      this.telemetry.disconnect();
    });
  }

  private emitAmbient(): void {
    const [kind, tag, detail] = AMBIENT[random(0, AMBIENT.length - 1)]();
    this.events.emit(kind, tag, detail);
  }
}
