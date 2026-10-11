import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

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

/**
 * Recorrido de una petición por caché, base de datos y motor de IA, con dos interruptores
 * para ver qué hace el sistema cuando falla Redis o Gemini. Los fallos son simulados; el
 * comportamiento mostrado es el que implementa el backend (fail-open y circuit breaker).
 */
@Component({
  selector: 'app-resilience-pipeline',
  standalone: true,
  imports: [TheaterToggleComponent],
  hostDirectives: [TheaterDirective],
  host: { class: 'bento-card block' },
  templateUrl: './resilience-pipeline.component.html',
  styles: `
    /* Al pasar por la tarjeta (o en modo teatro) las tuberías ganan contraste y los logos brillan. */
    :host(:hover) .pipe:not(.pipe-cut):not(.pipe-bypass),
    :host(.theater-expanded) .pipe:not(.pipe-cut):not(.pipe-bypass) {
      stroke: rgb(255 255 255 / 0.3);
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
      stroke: rgb(255 255 255 / 0.14);
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
      filter: drop-shadow(0 0 6px rgb(52 211 153 / 0.7));
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
      fill: rgb(255 255 255 / 0.05);
      stroke: rgb(255 255 255 / 0.16);
      transition: fill 0.6s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.6s cubic-bezier(0.16, 1, 0.3, 1),
        filter 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .stage-down rect {
      fill: rgb(248 113 113 / 0.12);
      stroke: var(--status-danger);
      filter: drop-shadow(0 0 12px rgb(248 113 113 / 0.55));
    }
    .stage-hot rect {
      fill: rgb(52 211 153 / 0.12);
      stroke: var(--status-ok);
      filter: drop-shadow(0 0 12px rgb(52 211 153 / 0.5));
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
      transform-origin: 462px 130px;
      transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.5s;
    }
    .lever-open {
      stroke: var(--status-danger);
      transform: rotate(-38deg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResiliencePipelineComponent {
  private readonly events = inject(SystemEventsService);
  readonly inspector = inject(TraceInspectorService);

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
