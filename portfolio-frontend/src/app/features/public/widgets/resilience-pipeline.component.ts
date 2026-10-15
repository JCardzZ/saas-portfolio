import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import { ContainerWidthDirective } from '../../../shared/ui/container-width.directive';
import { IconPopService } from '../../../shared/ui/icon-pop.service';
import { TECH_ICONS, TechIconKey } from '../../../shared/ui/tech-icons';
import { TheaterToggleComponent } from '../../../shared/ui/theater-toggle.component';
import { TheaterDirective } from '../../../shared/ui/theater.directive';
import { SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';

/** Cuerpo RFC 7807 que devuelve la API con el circuito abierto (mismo formato que ProblemDetailFactory). */
const CIRCUIT_OPEN_PROBLEM = `{
  "type": "https://api.example.com/saas-portfolio/errors/service-unavailable",
  "title": "Servicio no disponible",
  "status": 503,
  "detail": "El motor de IA está pausado temporalmente tras fallos repetidos. Inténtalo en unos segundos.",
  "instance": "/v1/ai/rag/query",
  "code": "SERVICE_UNAVAILABLE",
  "timestamp": "2026-10-05T10:42:07Z",
  "traceId": "3f1c9a52-8d4e-4b7a-9c61-2e5f0b7d4a18"
}`;

/** Etapas del recorrido, en el orden en que las atraviesa una petición. */
const STAGES: readonly { id: string; label: string; role: string; tech: TechIconKey | null }[] = [
  { id: 'request', label: 'Petición HTTP', role: 'visitante', tech: null },
  { id: 'redis', label: 'Redis', role: 'timeout 2 s', tech: 'redis' },
  { id: 'postgresql', label: 'PostgreSQL', role: 'fuente de verdad', tech: 'postgresql' },
  { id: 'gemini', label: 'Gemini API', role: 'circuit breaker', tech: 'gemini' },
];

const STAGE = { w: 108, h: 48 };
/** Lienzo de la disposición horizontal; con menos ancho, el recorrido pasa a vertical. */
const CANVAS = { width: 620, height: 200 };

interface PlacedStage {
  id: string;
  label: string;
  role: string;
  tech: TechIconKey | null;
  x: number;
  y: number;
  w: number;
  h: number;
  textX: number;
}

interface Point {
  x: number;
  y: number;
}

/** Todo lo que se dibuja, ya colocado para una de las dos disposiciones. */
interface Geometry {
  vertical: boolean;
  width: number;
  height: number;
  stages: PlacedStage[];
  bypass: string;
  bypassLabel: Point & { transform: string | null };
  cache: string;
  cacheLabel: Point;
  miss: string;
  missLabel: Point;
  breakerIn: string;
  breakerOut: string;
  breaker: string;
  breakerLabel: Point;
  lever: { x1: number; y1: number; x2: number; y2: number };
  labelAnchor: 'middle' | 'start';
}

function place(index: number, x: number, y: number, w: number): PlacedStage {
  const stage = STAGES[index];
  // Con el logo a la izquierda, el texto se centra en el hueco que queda.
  return { ...stage, x, y, w, h: STAGE.h, textX: x + w / 2 + (stage.tech ? 9 : 0) };
}

/** El recorrido de izquierda a derecha, con el desvío fail-open por arriba. */
function horizontal(): Geometry {
  const y = 106;
  const mid = y + STAGE.h / 2;
  return {
    vertical: false,
    ...CANVAS,
    stages: [10, 170, 338, 502].map((x, index) => place(index, x, y, STAGE.w)),
    bypass: 'M64 106 C64 34 392 34 392 106',
    bypassLabel: { x: 228, y: 40, transform: null },
    cache: `M118 ${mid} H170`,
    cacheLabel: { x: 144, y: 120 },
    miss: `M278 ${mid} H338`,
    missLabel: { x: 308, y: 120 },
    breakerIn: `M446 ${mid} H462`,
    breakerOut: `M486 ${mid} H502`,
    breaker: `M446 ${mid} H502`,
    breakerLabel: { x: 474, y: 160 },
    lever: { x1: 462, y1: mid, x2: 486, y2: mid },
    labelAnchor: 'middle',
  };
}

/** El mismo recorrido de arriba abajo: etapas a todo el ancho y el desvío por un carril a la izquierda. */
function vertical(width: number): Geometry {
  const gutter = 36;
  const gap = 40;
  const w = Math.max(0, width - gutter - 12);
  const stages = STAGES.map((_, index) => place(index, gutter, 12 + index * (STAGE.h + gap), w));
  const [request, redis, postgresql, gemini] = stages;
  const centre = gutter + w / 2;
  const bottom = (stage: PlacedStage): number => stage.y + stage.h;
  const lane = 12;
  const from = request.y + STAGE.h / 2;
  const to = postgresql.y + STAGE.h / 2;
  const leverTop = bottom(postgresql) + 8;
  const leverBottom = gemini.y - 8;
  return {
    vertical: true,
    width,
    height: bottom(gemini) + 12,
    stages,
    bypass: `M${gutter} ${from} H${lane + 8} Q${lane} ${from} ${lane} ${from + 8} V${to - 8} Q${lane} ${to} ${lane + 8} ${to} H${gutter}`,
    // El rótulo acompaña al carril, girado.
    bypassLabel: { x: lane + 16, y: (from + to) / 2, transform: `rotate(-90 ${lane + 16} ${(from + to) / 2})` },
    cache: `M${centre} ${bottom(request)} V${redis.y}`,
    cacheLabel: { x: centre + 10, y: bottom(request) + gap / 2 + 4 },
    miss: `M${centre} ${bottom(redis)} V${postgresql.y}`,
    missLabel: { x: centre + 10, y: bottom(redis) + gap / 2 + 4 },
    breakerIn: `M${centre} ${bottom(postgresql)} V${leverTop}`,
    breakerOut: `M${centre} ${leverBottom} V${gemini.y}`,
    breaker: `M${centre} ${bottom(postgresql)} V${gemini.y}`,
    breakerLabel: { x: centre + 18, y: bottom(postgresql) + gap / 2 + 4 },
    lever: { x1: centre, y1: leverTop, x2: centre, y2: leverBottom },
    labelAnchor: 'start',
  };
}

/**
 * Recorrido de una petición por caché, base de datos y motor de IA, con dos interruptores
 * para ver qué hace el sistema cuando falla Redis o Gemini. Los fallos son simulados; el
 * comportamiento mostrado es el que implementa el backend (fail-open y circuit breaker).
 */
@Component({
    selector: 'app-resilience-pipeline',
    imports: [TranslatePipe, ContainerWidthDirective, TheaterToggleComponent],
    hostDirectives: [TheaterDirective],
    host: { class: 'bento-card block' },
    templateUrl: './resilience-pipeline.component.html',
    styles: `
    /* Al pasar por la tarjeta (o en modo teatro) las tuberías ganan contraste y los logos brillan. */
    :host(:hover) .pipe:not(.pipe-cut):not(.pipe-bypass),
    :host(.theater-expanded) .pipe:not(.pipe-cut):not(.pipe-bypass) {
      stroke: rgb(var(--c-ink-1) / 0.3);
    }
    :host(:hover) .stage rect,
    :host(.theater-expanded) .stage rect {
      stroke-width: 1.4;
    }
    :host(:hover) .stage svg,
    :host(.theater-expanded) .stage svg {
      filter: drop-shadow(0 0 5px var(--brand, #fff));
    }
    .stage svg {
      transition: filter 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .pipe {
      fill: none;
      stroke: rgb(var(--c-ink-1) / 0.14);
      stroke-width: 2;
      transition: stroke 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .pipe-cut {
      stroke: var(--status-danger);
      stroke-dasharray: 3 5;
    }
    .pipe-off {
      opacity: 0.25;
    }
    .pipe-bypass {
      stroke: var(--status-ok);
      opacity: 0;
    }
    .pipe-bypass-on {
      opacity: 1;
      filter: drop-shadow(0 0 6px rgb(var(--c-status-ok) / 0.7));
    }
    .pulse {
      fill: none;
      stroke: var(--accent-text);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-dasharray: 6 94;
      filter: drop-shadow(0 0 5px var(--accent-text));
      animation: flow 1.7s linear infinite;
      transition: opacity 0.5s;
    }
    .pulse-bypass {
      stroke: var(--status-ok);
      filter: drop-shadow(0 0 6px var(--status-ok));
      animation-duration: 2.2s;
    }
    .pulse-hidden {
      opacity: 0;
    }
    @keyframes flow {
      from { stroke-dashoffset: 100; }
      to { stroke-dashoffset: 0; }
    }
    .stage-tech {
      cursor: pointer;
      outline: none;
    }
    .stage-tech:focus-visible rect {
      stroke: var(--text-1);
      stroke-width: 2;
    }
    .stage rect {
      fill: rgb(var(--c-ink-1) / 0.05);
      stroke: rgb(var(--c-ink-1) / 0.16);
      transition: fill 0.6s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.6s cubic-bezier(0.16, 1, 0.3, 1),
        filter 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .stage-down rect {
      fill: rgb(var(--c-status-danger) / 0.12);
      stroke: var(--status-danger);
      filter: drop-shadow(0 0 12px rgb(var(--c-status-danger) / 0.55));
    }
    .stage-hot rect {
      fill: rgb(var(--c-status-ok) / 0.12);
      stroke: var(--status-ok);
      filter: drop-shadow(0 0 12px rgb(var(--c-status-ok) / 0.5));
    }
    .stage-label {
      fill: var(--text-1);
      font-size: 12.5px;
      font-weight: 600;
    }
    .stage-role, .pipe-label {
      fill: var(--text-2);
      font-size: 12px;
    }
    .badge {
      opacity: 0;
      transition: opacity 0.4s;
    }
    .badge-on {
      opacity: 1;
    }
    /* La palanca del interruptor gira al abrirse el circuito. */
    .lever {
      stroke: var(--text-1);
      stroke-width: 2.5;
      stroke-linecap: round;
      transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.5s;
    }
    .lever-open {
      stroke: var(--status-danger);
      transform: rotate(-38deg);
    }
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResiliencePipelineComponent {
  private readonly events = inject(SystemEventsService);
  readonly inspector = inject(TraceInspectorService);

  private readonly box = viewChild(ContainerWidthDirective);
  /** Geometría del diagrama para el ancho que hay. */
  readonly geo = computed<Geometry>(() => {
    const box = this.box();
    return box?.narrowerThan(CANVAS.width) ? vertical(box.width() || window.innerWidth - 80) : horizontal();
  });

  readonly problem = CIRCUIT_OPEN_PROBLEM;
  readonly icons = TECH_ICONS;
  readonly redisDown = signal(false);
  readonly geminiDown = signal(false);

  /** Lo que respondería GET /telemetry/health: Redis y el circuito degradan, no tumban. */
  readonly health = computed(() => (this.redisDown() || this.geminiDown() ? 'DEGRADED' : 'UP'));

  private readonly iconPop = inject(IconPopService);

  /** Abre la traza de la etapa y hace despegar su logo: al posar el cursor (vuelve al salir) o al pulsar. */
  inspect(tech: TechIconKey, event?: Event): void {
    this.inspector.select(tech);
    const logo = (event?.currentTarget as Element | undefined)?.querySelector('svg');
    if (!logo) {
      return;
    }
    const stage = event!.currentTarget as Element;
    if (event?.type === 'mouseenter') {
      this.iconPop.hoverEnter(TECH_ICONS[tech], logo, stage);
    } else {
      this.iconPop.pop(TECH_ICONS[tech], logo, true, stage);
    }
  }

  leave(event: Event): void {
    const logo = (event.currentTarget as Element).querySelector('svg');
    if (logo) {
      this.iconPop.hoverLeave(logo);
    }
  }

  toggleRedis(): void {
    this.redisDown.update((down) => !down);
    this.events.emitFromUser(
      this.redisDown()
        ? [
            ['warn', 'Redis timeout 2s', 'Cache read failed, falling back to source'],
            ['ok', '200 OK Fail-open', 'servido desde PostgreSQL'],
            ['info', 'GET /telemetry/health', 'DEGRADED'],
          ]
        : [['ok', 'Redis recuperado', 'caché repoblada · TTL 10m']],
    );
  }

  toggleGemini(): void {
    this.geminiDown.update((down) => !down);
    this.events.emitFromUser(
      this.geminiDown()
        ? [
            ['warn', 'Gemini 429', 'cuota agotada · fallo del proveedor'],
            ['warn', 'CircuitBreaker aiEngine', 'CLOSED → OPEN (50 % de fallos)'],
            ['warn', '503 SERVICE_UNAVAILABLE', 'POST /ai/rag/query · RFC 7807'],
          ]
        : [['ok', 'CircuitBreaker aiEngine', 'HALF_OPEN → CLOSED']],
    );
  }
}
