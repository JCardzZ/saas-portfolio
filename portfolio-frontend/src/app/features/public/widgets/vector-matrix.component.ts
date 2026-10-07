import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { SystemEventsService } from '../data/system-events.service';

interface VectorPoint {
  id: number;
  x: number;
  y: number;
  source: string;
}

interface Query {
  x: number;
  y: number;
}

interface Match extends VectorPoint {
  similarity: number;
}

const WIDTH = 600;
const HEIGHT = 260;
const NEAREST = 5;
const SIMILARITY_RANGE = 170;
/** Al mover el cursor se registra como mucho un evento cada tanto, y solo si cambia el mejor resultado. */
const EVENT_THROTTLE_MS = 450;

/** Fuentes reales del índice, agrupadas como quedarían al proyectar sus embeddings. */
const CLUSTERS: { x: number; y: number; sources: string[] }[] = [
  { x: 130, y: 85, sources: ['TechnologyService.java', 'RedisCacheAdapter.java', 'CachePort.java', 'RedisRateLimiterAdapter.java', 'CacheKeys.java'] },
  { x: 300, y: 165, sources: ['RAGService.java', 'GeminiAiAdapter.java', 'PgVectorRepositoryAdapter.java', 'RAGIndexingService.java', 'TextChunker.java'] },
  { x: 465, y: 80, sources: ['rag-chat.component.ts', 'landing-page.component.html', 'auth.service.ts', 'jwt.interceptor.ts', 'crud-store.ts'] },
  { x: 480, y: 195, sources: ['cms/projects · SaaS Portfolio', 'cms/projects · Motor RAG', 'cms/technologies · Java 21', 'cms/technologies · Angular 18', 'cms/projects · Rate limiter'] },
  { x: 115, y: 195, sources: ['SecurityConfig.java', 'JwtTokenService.java', 'CLAUDE.md', 'saas-portfolio-v1.openapi.yaml', 'V3__ai_rag_and_multitenancy.sql'] },
];
const POINTS_PER_CLUSTER = 14;

/**
 * Ilustra la búsqueda por similitud de pgvector: la pregunta es un punto y se conecta
 * con sus vecinos más cercanos. Es una proyección 2D con posiciones generadas; el índice
 * real tiene 768 dimensiones y usa distancia coseno.
 */
@Component({
  selector: 'app-vector-matrix',
  standalone: true,
  host: { class: 'bento-card block' },
  template: `
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h3 class="text-xl font-semibold tracking-tight text-white">Búsqueda vectorial</h3>
      <p class="text-xs text-zinc-500">Mueve el cursor por el mapa o elige una pregunta</p>
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      @for (suggestion of suggestions; track suggestion.label) {
        <button
          type="button"
          class="focus-ring rounded-full border px-3 py-1 text-xs transition duration-300 ease-spring"
          [class]="activeSuggestion() === suggestion.label ? 'border-accent bg-accent/20 text-white' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'"
          [attr.aria-pressed]="activeSuggestion() === suggestion.label"
          (click)="select(suggestion)"
        >
          {{ suggestion.label }}
        </button>
      }
    </div>

    <div class="mt-4 grid gap-5 md:grid-cols-3">
      <svg
        [attr.viewBox]="viewBox"
        class="w-full cursor-crosshair touch-none rounded-2xl border border-white/10 bg-black/40 md:col-span-2"
        role="img"
        aria-label="Mapa de fragmentos indexados; la pregunta se conecta con los cinco más afines"
        (pointermove)="follow($event)"
        (pointerdown)="follow($event)"
      >
        @for (point of points; track point.id) {
          <circle class="point" [attr.cx]="point.x" [attr.cy]="point.y" r="2.2" />
        }
        @for (match of matches(); track match.id) {
          <line class="link" [attr.x1]="query().x" [attr.y1]="query().y" [attr.x2]="match.x" [attr.y2]="match.y" [style.opacity]="0.25 + match.similarity * 0.75" />
          <circle class="match" [attr.cx]="match.x" [attr.cy]="match.y" r="4.5" />
        }
        <circle class="query-halo" [attr.cx]="query().x" [attr.cy]="query().y" r="9" />
        <circle class="query" [attr.cx]="query().x" [attr.cy]="query().y" r="4" />
      </svg>

      <div aria-live="polite">
        <p class="text-xs font-medium uppercase tracking-wider text-zinc-500">Más afines</p>
        <ol class="mt-2 space-y-1.5">
          @for (match of matches(); track match.id) {
            <li class="flex animate-fade-in items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
              <span class="min-w-0 truncate font-mono text-[11px] text-zinc-200">{{ match.source }}</span>
              <span class="shrink-0 font-mono text-[11px] tabular-nums text-accent">{{ match.similarity.toFixed(2) }}</span>
            </li>
          }
        </ol>
        <p class="mt-3 text-[11px] leading-snug text-zinc-500">
          Proyección 2D ilustrativa. El índice real compara vectores de 768 dimensiones por distancia coseno.
        </p>
      </div>
    </div>
  `,
  styles: `
    .point {
      fill: rgb(255 255 255 / 0.22);
    }
    .match {
      fill: #0a84ff;
      filter: drop-shadow(0 0 6px rgb(10 132 255 / 0.9));
      animation: pop 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
      transform-box: fill-box;
      transform-origin: center;
    }
    .link {
      stroke: #7dd3fc;
      stroke-width: 1.2;
      stroke-linecap: round;
      filter: drop-shadow(0 0 3px #38bdf8);
    }
    .query {
      fill: #fff;
      filter: drop-shadow(0 0 8px #fff);
    }
    .query-halo {
      fill: none;
      stroke: rgb(255 255 255 / 0.5);
      stroke-width: 1;
      transform-box: fill-box;
      transform-origin: center;
      animation: halo 1.8s ease-out infinite;
    }
    @keyframes pop {
      from { transform: scale(0.3); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    @keyframes halo {
      from { transform: scale(0.6); opacity: 0.9; }
      to { transform: scale(2); opacity: 0; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorMatrixComponent {
  private readonly events = inject(SystemEventsService);
  private lastEventAt = 0;
  private lastTopMatch = -1;

  readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  readonly points = generatePoints();

  readonly suggestions: (Query & { label: string })[] = [
    { label: '¿Cómo funciona la caché?', x: 138, y: 92 },
    { label: '¿Cómo se genera una respuesta?', x: 305, y: 160 },
    { label: '¿Qué proyectos hay?', x: 474, y: 190 },
  ];

  readonly activeSuggestion = signal<string | null>(this.suggestions[0].label);
  readonly query = signal<Query>(this.suggestions[0]);

  /** Los vecinos más cercanos a la pregunta, del más al menos afín. */
  readonly matches = computed<Match[]>(() => {
    const { x, y } = this.query();
    return this.points
      .map((point) => ({ point, distance: Math.hypot(point.x - x, point.y - y) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, NEAREST)
      .map(({ point, distance }) => ({ ...point, similarity: Math.max(0, 1 - distance / SIMILARITY_RANGE) }));
  });

  select(suggestion: Query & { label: string }): void {
    this.activeSuggestion.set(suggestion.label);
    this.query.set({ x: suggestion.x, y: suggestion.y });
    this.logSearch(true);
  }

  follow(event: PointerEvent): void {
    const bounds = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    this.activeSuggestion.set(null);
    this.query.set({
      x: ((event.clientX - bounds.left) / bounds.width) * WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * HEIGHT,
    });
    this.logSearch(false);
  }

  private logSearch(force: boolean): void {
    const [top] = this.matches();
    const now = Date.now();
    if (!top || (!force && (top.id === this.lastTopMatch || now - this.lastEventAt < EVENT_THROTTLE_MS))) {
      return;
    }
    this.lastTopMatch = top.id;
    this.lastEventAt = now;
    this.events.emitFromUser([
      ['vector', `pgvector CosineDistance: ${(1 - top.similarity).toFixed(2)}`, `embedding <=> query · top-${NEAREST}`],
      ['ok', 'match', top.source],
    ]);
  }
}

// Generador con semilla fija: el mapa es idéntico en cada carga.
function generatePoints(): VectorPoint[] {
  let seed = 20261005;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const points: VectorPoint[] = [];
  for (const cluster of CLUSTERS) {
    for (let i = 0; i < POINTS_PER_CLUSTER; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 14 + random() * 52;
      points.push({
        id: points.length,
        x: clamp(cluster.x + Math.cos(angle) * radius * 1.25, 12, WIDTH - 12),
        y: clamp(cluster.y + Math.sin(angle) * radius * 0.8, 12, HEIGHT - 12),
        // Cada punto es un fragmento (chunk) de su archivo, como en el índice real.
        source: `${cluster.sources[i % cluster.sources.length]} · #${Math.floor(i / cluster.sources.length) + 1}`,
      });
    }
  }
  return points;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
