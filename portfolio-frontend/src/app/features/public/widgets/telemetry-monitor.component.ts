import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

const BAR_COUNT = 18;
const TICK_MS = 1300;
const COUNT_UP_MS = 1600;
const RING_RADIUS = 30;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Monitor de rendimiento con valores SIMULADOS en el navegador: ilustra qué mediría
 * el sistema, pero no lee métricas reales. La etiqueta "Simulación" lo deja a la vista.
 */
@Component({
    selector: 'app-telemetry-monitor',
    imports: [TranslatePipe],
    host: { class: 'bento-card flex flex-col' },
    template: `
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 class="text-xl font-semibold tracking-tight text-ink-1">{{ 'Telemetría' | t }}</h3>
      <span class="inline-flex items-center gap-1.5 rounded-full border border-line-subtle px-2 py-0.5 text-xs text-ink-2">
        <span class="relative flex h-1.5 w-1.5">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-ok opacity-75"></span>
          <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-status-ok"></span>
        </span>
        {{ 'Simulación' | t }}
      </span>
    </div>

    <div class="mt-5 flex items-center gap-4">
      <svg viewBox="0 0 80 80" class="h-20 w-20 shrink-0" role="img" [attr.aria-label]="('Cache hit ratio simulado: ' | t) + hitRatio + ' %'">
        <circle cx="40" cy="40" [attr.r]="ringRadius" fill="none" stroke="rgb(var(--c-ink-1) / 0.08)" stroke-width="6" />
        <circle
          class="ring"
          cx="40" cy="40" [attr.r]="ringRadius" fill="none" stroke="var(--status-ok)" stroke-width="6" stroke-linecap="round"
          transform="rotate(-90 40 40)"
          [attr.stroke-dasharray]="ringCircumference"
          [attr.stroke-dashoffset]="ringOffset()"
        />
        <text x="40" y="44" text-anchor="middle" class="ring-value">{{ hitRatio }}%</text>
      </svg>
      <div class="min-w-0">
        <p class="text-sm font-medium text-ink-1">Cache hit ratio</p>
        <p class="text-xs text-ink-3">Redis · cache-aside</p>
      </div>
    </div>

    <div class="mt-5 flex min-h-[5rem] max-h-56 flex-1 flex-col">
      <div class="flex items-baseline justify-between">
        <p class="text-xs font-medium uppercase tracking-wider text-ink-3">{{ 'Latencia' | t }}</p>
        <p class="font-mono text-sm tabular-nums text-ink-1">{{ latestLatency() }} ms</p>
      </div>
      <svg viewBox="0 0 180 48" class="mt-2 min-h-12 w-full flex-1" preserveAspectRatio="none" role="img" [attr.aria-label]="'Latencia simulada de las últimas peticiones' | t">
        @for (latency of latencies(); track $index) {
          <rect
            class="bar"
            [attr.x]="$index * 10 + 1" y="0" width="7" height="48" rx="2"
            [class.bar-latest]="$last"
            [style.transform]="'scaleY(' + latency / maxLatency + ')'"
          />
        }
      </svg>
    </div>

    <div class="pt-5">
      <p class="text-xs font-medium uppercase tracking-wider text-ink-3">{{ 'Preguntas RAG procesadas' | t }}</p>
      <p class="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-ink-1">{{ formattedRequests() }}</p>
    </div>
  `,
    styles: `
    .ring {
      transition: stroke-dashoffset 1.6s cubic-bezier(0.16, 1, 0.3, 1);
      filter: drop-shadow(0 0 6px rgb(var(--c-status-ok) / 0.6));
    }
    .ring-value {
      fill: var(--text-1);
      font-size: 13px;
      font-weight: 600;
    }
    .bar {
      fill: rgb(var(--c-ink-1) / 0.22);
      transform-box: fill-box;
      transform-origin: bottom;
      transition: transform 0.9s cubic-bezier(0.16, 1, 0.3, 1), fill 0.6s;
    }
    .bar-latest {
      fill: var(--accent-text);
    }
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TelemetryMonitorComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly hitRatio = 99.8;
  readonly maxLatency = 100;
  readonly ringRadius = RING_RADIUS;
  readonly ringCircumference = RING_CIRCUMFERENCE;

  // El anillo arranca vacío y se llena al aparecer.
  private readonly ringProgress = signal(0);
  readonly ringOffset = computed(() => RING_CIRCUMFERENCE * (1 - this.ringProgress()));

  readonly latencies = signal<number[]>(Array.from({ length: BAR_COUNT }, () => randomLatency()));
  readonly latestLatency = computed(() => this.latencies()[BAR_COUNT - 1]);

  private readonly requests = signal(0);
  readonly formattedRequests = computed(() => new Intl.NumberFormat('es').format(this.requests()));

  ngOnInit(): void {
    const target = 12_480;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.ringProgress.set(this.hitRatio / 100);
      this.requests.set(target);
      return;
    }

    const ring = setTimeout(() => this.ringProgress.set(this.hitRatio / 100), 150);
    const frame = this.countUp(target);
    const ticker = setInterval(() => {
      this.latencies.update((values) => [...values.slice(1), randomLatency()]);
      this.requests.update((value) => (value >= target ? value + 1 + Math.floor(Math.random() * 3) : value));
    }, TICK_MS);

    this.destroyRef.onDestroy(() => {
      clearTimeout(ring);
      clearInterval(ticker);
      cancelAnimationFrame(frame.id);
    });
  }

  private countUp(target: number): { id: number } {
    const handle = { id: 0 };
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - progress, 4);
      this.requests.set(Math.round(target * eased));
      if (progress < 1) {
        handle.id = requestAnimationFrame(step);
      }
    };
    handle.id = requestAnimationFrame(step);
    return handle;
  }
}

function randomLatency(): number {
  return 18 + Math.round(Math.random() * 62);
}
