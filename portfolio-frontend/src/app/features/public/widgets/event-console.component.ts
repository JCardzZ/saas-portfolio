import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';

import { SystemEventKind, SystemEventStep, SystemEventsService } from '../data/system-events.service';
import { TelemetryStreamService } from '../data/telemetry-stream.service';

const AMBIENT_INTERVAL_MS = 1700;

const KIND_CLASSES: Record<SystemEventKind, string> = {
  ok: 'text-emerald-400',
  cache: 'text-teal-300',
  vector: 'text-sky-400',
  ai: 'text-violet-400',
  auth: 'text-amber-300',
  info: 'text-zinc-300',
  warn: 'text-red-400',
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
  host: { class: 'bento-card flex flex-col overflow-hidden !p-0' },
  template: `
    <div class="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5">
      <span class="h-3 w-3 rounded-full bg-[#ff5f57]" aria-hidden="true"></span>
      <span class="h-3 w-3 rounded-full bg-[#febc2e]" aria-hidden="true"></span>
      <span class="h-3 w-3 rounded-full bg-[#28c840]" aria-hidden="true"></span>
      <h3 class="ml-2 min-w-0 flex-1 truncate text-center font-mono text-[11px] font-normal text-zinc-400">
        system-events — {{ statusLabel() }}
      </h3>
      <button
        type="button"
        class="focus-ring rounded-md border border-white/10 px-2 py-0.5 font-mono text-[11px] text-zinc-300 transition hover:bg-white/10"
        [attr.aria-pressed]="paused()"
        (click)="paused.set(!paused())"
      >
        {{ paused() ? 'Reanudar' : 'Pausar' }}
      </button>
    </div>

    <!-- aria-live apagado: un flujo continuo saturaría a un lector de pantalla. -->
    <div #log class="h-72 flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed" role="log" aria-live="off" aria-label="Eventos simulados del sistema" tabindex="0">
      @for (event of events.events(); track event.id) {
        <p class="animate-slide-up break-words" [class.user-event]="event.fromUser" [style.animation-delay.ms]="event.stagger">
          @if (event.origin === 'live') {
            <span class="text-emerald-400" title="Evento real del backend">●</span>
          }
          <span class="text-zinc-600">{{ event.time }}</span>
          <span [class]="kindClasses[event.kind]"> [{{ event.tag }}]</span>
          <span class="text-zinc-400"> {{ event.detail }}</span>
        </p>
      } @empty {
        <p class="text-zinc-600">Esperando eventos…</p>
      }
    </div>

    <p class="border-t border-white/10 px-4 py-2 text-[11px] text-zinc-500">
      @if (telemetry.status() === 'live') {
        <span class="text-emerald-400">●</span> Eventos reales del backend.
      }
      <span class="text-accent">▍</span> Simulaciones que provocas tú en los widgets de esta página.
    </p>
  `,
  styles: `
    .user-event {
      margin-left: -0.5rem;
      border-left: 2px solid #0a84ff;
      background: rgb(10 132 255 / 0.08);
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
