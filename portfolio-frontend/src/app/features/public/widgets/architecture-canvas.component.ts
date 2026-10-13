import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import { ContainerWidthDirective } from '../../../shared/ui/container-width.directive';
import { verticalFlow } from '../../../shared/ui/vertical-flow';
import { IconPopService } from '../../../shared/ui/icon-pop.service';
import { TECH_ICONS, TechIcon, TechIconKey } from '../../../shared/ui/tech-icons';
import { TheaterToggleComponent } from '../../../shared/ui/theater-toggle.component';
import { TheaterDirective } from '../../../shared/ui/theater.directive';
import { SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';

interface ArchitectureNode {
  id: string;
  label: string;
  role: string;
  x: number;
  y: number;
  /** Datos de la configuración real del sistema, no mediciones en vivo. */
  facts: string[];
  /** Logo de la tecnología que implementa el nodo, si es una concreta. */
  icon?: TechIconKey;
  /** Color de la regla de arquitectura que representa el nodo (nivel de código). */
  tone?: 'pure' | 'framework';
}

interface C4Level {
  id: string;
  tab: string;
  title: string;
  description: string;
  defaultNode: string;
  /** Ancho de los nodos; los nombres de paquete necesitan más que el valor por defecto. */
  nodeWidth?: number;
  nodes: ArchitectureNode[];
  /** Pares [origen, destino]; la ruta se calcula a partir de las posiciones. */
  links: [from: string, to: string][];
}

interface ArchitectureEdge {
  from: string;
  to: string;
  path: string;
  /** Duración del pulso en segundos: cada conexión late a su ritmo. */
  duration: number;
}

/** Un nodo ya colocado: la misma pieza en la disposición horizontal o en la vertical. */
interface PlacedNode {
  node: ArchitectureNode;
  x: number;
  y: number;
  w: number;
  h: number;
  textX: number;
  labelY: number;
  roleY: number;
  anchor: 'middle' | 'start';
  icon: { x: number; y: number; size: number };
}

interface Scene {
  compact: boolean;
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: ArchitectureEdge[];
}

const NODE_WIDTH = 136;
const NODE_HEIGHT = 52;
/** Lienzo de la disposición horizontal; con menos ancho que este, el diagrama pasa a vertical. */
const CANVAS = { width: 600, height: 300 };

const LEVELS: C4Level[] = [
  {
    id: 'context',
    tab: 'Contexto',
    title: 'Nivel 1 · Contexto del sistema',
    description: 'Quién usa la plataforma y de qué servicios externos depende.',
    defaultNode: 'system',
    nodes: [
      { id: 'visitor', label: 'Visitante', role: 'Reclutador o cliente', x: 80, y: 96, facts: ['Landing pública', 'Chat RAG · 10 preguntas/min'] },
      { id: 'admin', label: 'Administrador', role: 'Dueño del portafolio', x: 80, y: 204, facts: ['Login client_credentials', 'CMS de proyectos y tecnologías', 'Lanza la reindexación'] },
      { id: 'system', label: 'SaaS Portfolio', role: 'Plataforma', x: 290, y: 150, facts: ['Contract-first · OpenAPI 3', 'Arquitectura hexagonal', 'tenant_id en cada tabla'] },
      { icon: 'neon', id: 'neon', label: 'Neon', role: 'PostgreSQL gestionado', x: 510, y: 56, facts: ['PostgreSQL 16 + pgvector', 'Migraciones Flyway'] },
      { icon: 'upstash', id: 'upstash', label: 'Upstash', role: 'Redis gestionado', x: 510, y: 150, facts: ['Caché cache-aside', 'Contadores de límites'] },
      { icon: 'gemini', id: 'gemini', label: 'Gemini API', role: 'Google AI', x: 510, y: 244, facts: ['Embeddings de 768 dimensiones', 'Generación de respuestas'] },
    ],
    links: [['visitor', 'system'], ['admin', 'system'], ['system', 'neon'], ['system', 'upstash'], ['system', 'gemini']],
  },
  {
    id: 'container',
    tab: 'Contenedores',
    title: 'Nivel 2 · Contenedores',
    description: 'Las piezas desplegables y cómo se hablan.',
    defaultNode: 'api',
    nodes: [
      { icon: 'angular', id: 'frontend', label: 'Angular 18', role: 'Single Page App', x: 80, y: 150, facts: ['Standalone + Signals', 'Cliente generado desde OpenAPI', 'JWT en cabecera'] },
      { icon: 'spring', id: 'api', label: 'Spring Boot 3', role: 'API REST', x: 290, y: 150, facts: ['Java 21', 'Puertos y adaptadores', 'Errores RFC 7807', 'Login: 5 intentos/min'] },
      { icon: 'redis', id: 'redis', label: 'Redis', role: 'Caché y límites', x: 510, y: 56, facts: ['Cache-aside · TTL 10 min', 'Timeout 2 s · best-effort', 'Límites atómicos con Lua'] },
      { icon: 'postgresql', id: 'postgres', label: 'PostgreSQL', role: 'Datos y vectores', x: 510, y: 150, facts: ['pgvector · 768 dimensiones', 'Distancia coseno · HNSW', 'Flyway'] },
      { icon: 'gemini', id: 'gemini', label: 'Gemini', role: 'Motor RAG', x: 510, y: 244, facts: ['Embeddings + respuesta', 'Circuit breaker 50 % · 30 s', 'Timeout 30 s'] },
    ],
    links: [['frontend', 'api'], ['api', 'redis'], ['api', 'postgres'], ['api', 'gemini']],
  },
  {
    id: 'component',
    tab: 'Componentes',
    title: 'Nivel 3 · Componentes (hexagonal)',
    description: 'Dentro de la API: las dependencias apuntan siempre hacia el núcleo.',
    defaultNode: 'services',
    nodes: [
      { icon: 'spring', id: 'controllers', label: 'Controllers', role: 'Adaptadores de entrada', x: 70, y: 150, facts: ['Implementan las interfaces OpenAPI', 'MapStruct: DTO ↔ dominio', 'Solo delegan'] },
      { icon: 'java', id: 'services', label: 'Casos de uso', role: 'Núcleo · Java puro', x: 222, y: 150, facts: ['Sin Spring ni JPA', 'Cache-aside y límites', 'Registrados en UseCaseConfig'] },
      { icon: 'java', id: 'ports', label: 'Puertos', role: 'Interfaces de salida', x: 374, y: 150, facts: ['RepositoryPort · CachePort', 'GeminiAiPort · VectorRepositoryPort', 'RateLimiterPort'] },
      { icon: 'postgresql', id: 'persistence', label: 'Persistencia', role: 'JPA · pgvector', x: 530, y: 56, facts: ['Entidades y repositorios JPA', 'JDBC para vectores', 'Las transacciones viven aquí'] },
      { icon: 'redis', id: 'cache', label: 'Caché y límites', role: 'Redis', x: 530, y: 150, facts: ['StringRedisTemplate', 'Fail-open si Redis cae'] },
      { icon: 'gemini', id: 'ai', label: 'IA', role: 'Gemini', x: 530, y: 244, facts: ['RestClient', 'Circuit breaker Resilience4j'] },
    ],
    links: [['controllers', 'services'], ['services', 'ports'], ['ports', 'persistence'], ['ports', 'cache'], ['ports', 'ai']],
  },
  {
    id: 'code',
    tab: 'Código',
    title: 'Nivel 4 · Código y dominio puro',
    description: 'Paquetes del backend. Cada flecha es un import: todas acaban en domain.',
    defaultNode: 'domain',
    nodeWidth: 160,
    nodes: [
      { icon: 'spring', id: 'adapter', label: 'infrastructure.adapter', role: 'in.web · out.*', x: 96, y: 86, tone: 'framework', facts: ['Adapters & Frameworks', 'Spring, JPA, Redis, RestClient', 'Implementa los puertos'] },
      { icon: 'spring', id: 'config', label: 'infrastructure.config', role: 'UseCaseConfig', x: 96, y: 214, tone: 'framework', facts: ['Adapters & Frameworks', 'Registra los servicios como beans', 'Único lugar que conoce ambas capas'] },
      { icon: 'java', id: 'port', label: 'application.port', role: 'in · out', x: 306, y: 86, tone: 'pure', facts: ['Solo interfaces', 'Depende únicamente de domain', '0 imports de frameworks'] },
      { icon: 'java', id: 'service', label: 'application.service', role: 'Casos de uso', x: 306, y: 214, tone: 'pure', facts: ['Java puro', 'Usa puertos, nunca adaptadores', '0 imports de Spring/JPA'] },
      { icon: 'java', id: 'domain', label: 'domain', role: 'model · exception', x: 512, y: 150, tone: 'pure', facts: ['0 importaciones de Spring/JPA/Frameworks', 'Records de Java 21', 'No depende de ningún otro paquete'] },
    ],
    links: [['adapter', 'port'], ['config', 'service'], ['service', 'port'], ['port', 'domain'], ['service', 'domain']],
  },
];

/**
 * Diagrama de arquitectura con los tres primeros niveles del modelo C4. Pasar por un nodo
 * muestra su configuración; los pulsos recorren las conexiones en el sentido de la petición.
 */
@Component({
  selector: 'app-architecture-canvas',
  standalone: true,
  imports: [TranslatePipe, ContainerWidthDirective, TheaterToggleComponent],
  hostDirectives: [TheaterDirective],
  host: { class: 'bento-card block' },
  template: `
    <app-theater-toggle name="Arquitectura en vivo" />
    <div class="flex flex-wrap items-center justify-between gap-3 pr-10">
      <h3 class="text-title-2 text-ink-1">{{ 'Arquitectura en vivo' | t }}</h3>

      <!-- Cuatro niveles no caben en una fila estrecha: pasan a una rejilla de 2 × 2, todos a la vista. -->
      <div class="ui-segmented" [class.ui-segmented-grid]="scene().compact" role="tablist" [attr.aria-label]="'Nivel del modelo C4' | t" (keydown)="onTabKeydown($event)">
        @for (candidate of levels; track candidate.id) {
          <button
            type="button"
            role="tab"
            class="ui-segment"
            [id]="'c4-tab-' + candidate.id"
            [attr.aria-selected]="candidate.id === level().id"
            [attr.tabindex]="candidate.id === level().id ? 0 : -1"
            aria-controls="c4-panel"
            (click)="selectLevel(candidate.id)"
          >
            {{ candidate.tab }}
          </button>
        }
      </div>
    </div>

    <div id="c4-panel" role="tabpanel" [attr.aria-labelledby]="'c4-tab-' + level().id">
      <p class="mt-3 text-body-sm text-ink-2">
        <span class="font-medium text-ink-1">{{ level().title }}.</span> {{ level().description }}
      </p>

      <!-- Sin sitio para las columnas (600 px), el mismo grafo se dibuja de arriba abajo, a todo el ancho. -->
      <div class="theater-stage mt-3" appContainerWidth>
        <svg [attr.viewBox]="'0 0 ' + scene().width + ' ' + scene().height" class="block w-full" [attr.data-layout]="scene().compact ? 'vertical' : 'horizontal'" role="group" [attr.aria-label]="level().title">
          <!-- Cambiar de nivel recrea el grupo: los nodos entran escalonados en lugar de saltar. -->
          @for (current of [level()]; track current.id) {
            <g class="level">
              @for (edge of scene().edges; track edge.from + edge.to) {
                <path class="edge" [class.edge-active]="isEdgeActive(edge)" [attr.d]="edge.path" />
                <path class="pulse" [class.pulse-active]="isEdgeActive(edge)" [attr.d]="edge.path" pathLength="100" [style.animation-duration.s]="edge.duration" />
              }

              @for (placed of scene().nodes; track placed.node.id; let index = $index) {
                <g
                  class="node"
                  [class.node-active]="placed.node.id === activeId()"
                  [class.node-pure]="placed.node.tone === 'pure'"
                  [class.node-framework]="placed.node.tone === 'framework'"
                  [class.node-code]="current.id === 'code'"
                  [style.animation-delay.ms]="index * 55"
                  [style.--brand]="iconOf(placed.node)?.color"
                  tabindex="0"
                  role="button"
                  [attr.aria-label]="placed.node.label + ': ' + placed.node.role"
                  [attr.aria-pressed]="placed.node.id === activeId()"
                  (mouseenter)="activate(placed.node); hoverPop(placed.node, $event)"
                  (mouseleave)="hoverLeave($event)"
                  (focus)="activate(placed.node)"
                  (click)="activate(placed.node); pop(placed.node, $event)"
                >
                  <rect [attr.x]="placed.x" [attr.y]="placed.y" [attr.width]="placed.w" [attr.height]="placed.h" rx="8" />
                  @if (iconOf(placed.node); as icon) {
                    <svg class="node-icon" [attr.x]="placed.icon.x" [attr.y]="placed.icon.y" [attr.width]="placed.icon.size" [attr.height]="placed.icon.size" viewBox="0 0 24 24" aria-hidden="true">
                      <path [attr.d]="icon.path" [attr.fill]="icon.color" />
                    </svg>
                  }
                  <text class="node-label" [attr.x]="placed.textX" [attr.y]="placed.labelY" [attr.text-anchor]="placed.anchor">{{ placed.node.label }}</text>
                  <text class="node-role" [attr.x]="placed.textX" [attr.y]="placed.roleY" [attr.text-anchor]="placed.anchor">{{ placed.node.role }}</text>
                </g>
              }
            </g>
          }
        </svg>
      </div>

      <div class="mt-3 flex min-h-[3.25rem] flex-wrap items-center gap-2" aria-live="polite">
        <p class="mr-1 text-body-sm font-medium text-ink-1">{{ active().label }}</p>
        @for (fact of active().facts; track level().id + active().id + fact) {
          <span class="ui-badge animate-fade-in font-mono">{{ fact }}</span>
        }
      </div>
    </div>
  `,
  styles: `
    /* Nodo único del sitio (docs/DESIGN.md §9.6): superficie neutra, borde de 1 px, radio 8. El
       seleccionado se marca con el acento; el color de marca no sale del icono. */
    .edge {
      fill: none;
      stroke: var(--border-strong);
      stroke-width: 1;
      transition: stroke var(--duration-base) var(--ease-standard);
      animation: fade 0.5s var(--ease-emphasized) backwards;
    }
    .edge-active {
      stroke: var(--accent-text);
    }
    /* Un trazo corto que recorre la línea: el pulso de la petición. */
    .pulse {
      fill: none;
      stroke: var(--accent-text);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-dasharray: 4 96;
      opacity: 0.7;
      animation: flow linear infinite;
    }
    .pulse-active {
      opacity: 1;
      stroke-width: 2.5;
    }
    @keyframes flow {
      from { stroke-dashoffset: 100; }
      to { stroke-dashoffset: 0; }
    }
    @keyframes fade {
      from { opacity: 0; }
    }
    @keyframes node-in {
      from { opacity: 0; transform: translateY(8px); }
    }
    .node {
      cursor: pointer;
      outline: none;
      transform-box: fill-box;
      transform-origin: center;
      animation: node-in 0.5s var(--ease-emphasized) backwards;
    }
    .node rect {
      fill: var(--bg-surface-2);
      stroke: var(--border-subtle);
      stroke-width: 1;
      transition: stroke var(--duration-fast) var(--ease-standard);
    }
    .node:hover rect {
      stroke: var(--border-strong);
    }
    .node-active rect,
    .node-active:hover rect {
      stroke: var(--accent-text);
      stroke-width: 1.5;
    }
    /* Excepción vigente (docs/DESIGN.md §2.4): el resplandor de marca de los logos se mantiene. */
    .node-icon {
      pointer-events: none;
      transition: filter 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    :host(:hover) .node-icon,
    :host(.theater-expanded) .node-icon {
      filter: drop-shadow(0 0 4px var(--brand, #0a84ff));
    }
    .node-active .node-icon {
      filter: drop-shadow(0 0 5px var(--brand, #0a84ff));
    }
    :host(:hover) .node-active .node-icon,
    :host(.theater-expanded) .node-active .node-icon {
      filter: drop-shadow(0 0 9px var(--brand, #0a84ff));
    }
    .node-code .node-label {
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .node:focus-visible rect {
      stroke: var(--accent-text);
      stroke-width: 2;
    }
    .node-label {
      fill: var(--text-1);
      font-size: 13px;
      font-weight: 600;
      pointer-events: none;
    }
    .node-role {
      fill: var(--text-2);
      font-size: 12px;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchitectureCanvasComponent {
  private readonly events = inject(SystemEventsService);
  private readonly inspector = inject(TraceInspectorService);
  private readonly iconPop = inject(IconPopService);

  readonly levels = LEVELS;

  private readonly levelId = signal('container');
  readonly level = computed(() => LEVELS.find((level) => level.id === this.levelId()) ?? LEVELS[1]);

  readonly width = computed(() => this.level().nodeWidth ?? NODE_WIDTH);

  readonly activeId = signal(this.level().defaultNode);
  readonly active = computed(
    () => this.level().nodes.find((node) => node.id === this.activeId()) ?? this.level().nodes[0],
  );

  private readonly box = viewChild(ContainerWidthDirective);

  /** Nodos y conexiones ya colocados, para el ancho que hay: en columnas o de arriba abajo. */
  readonly scene = computed<Scene>(() => {
    const level = this.level();
    const width = this.width();
    const pulse = (index: number): number => 1.6 + (index % 4) * 0.35;
    const box = this.box();
    if (!box?.narrowerThan(CANVAS.width)) {
      const nodes = new Map(level.nodes.map((node) => [node.id, node]));
      const code = level.id === 'code';
      return {
        compact: false,
        ...CANVAS,
        nodes: level.nodes.map((node): PlacedNode => {
          const left = node.x - width / 2;
          return {
            node, x: left, y: node.y - NODE_HEIGHT / 2, w: width, h: NODE_HEIGHT, anchor: 'middle',
            // Con el logo a la izquierda, el texto se desplaza para seguir centrado en el hueco libre.
            textX: node.icon && !code ? node.x + 10 : node.x, labelY: node.y - 3, roleY: node.y + 14,
            // En el nivel de código el nombre del paquete ocupa todo el ancho: el logo baja a la línea del rol.
            icon: code ? { x: left + 12, y: node.y + 4, size: 13 } : { x: left + 10, y: node.y - 16, size: 15 },
          };
        }),
        edges: level.links.map(([from, to], index) => (
          { from, to, path: connect(nodes.get(from)!, nodes.get(to)!, width), duration: pulse(index) })),
      };
    }
    const flow = verticalFlow(level.nodes.map((node) => node.id), level.links, box.width() || window.innerWidth - 80, { nodeHeight: NODE_HEIGHT });
    const byId = new Map(level.nodes.map((node) => [node.id, node]));
    return {
      compact: true,
      width: flow.width,
      height: flow.height,
      nodes: flow.boxes.map((placed): PlacedNode => {
        const node = byId.get(placed.id)!;
        return {
          node, ...placed, anchor: 'start', textX: placed.x + (node.icon ? 36 : 14), labelY: placed.y + 23, roleY: placed.y + 40,
          icon: { x: placed.x + 12, y: placed.y + 18, size: 15 },
        };
      }),
      edges: flow.edges.map((edge, index) => ({ ...edge, duration: pulse(index) })),
    };
  });

  /** Al pulsar un nodo, su logo se desprende y flota en 3D por encima del diagrama. */
  pop(node: ArchitectureNode, event: Event): void {
    const logo = (event.currentTarget as Element).querySelector('.node-icon');
    if (node.icon && logo) {
      this.iconPop.pop(TECH_ICONS[node.icon], logo, true, event.currentTarget as Element);
    }
  }

  /** Con el cursor sobre el nodo, su logo despega solo; al salir, vuelve. */
  hoverPop(node: ArchitectureNode, event: Event): void {
    const logo = (event.currentTarget as Element).querySelector('.node-icon');
    if (node.icon && logo) {
      this.iconPop.hoverEnter(TECH_ICONS[node.icon], logo, event.currentTarget as Element);
    }
  }

  hoverLeave(event: Event): void {
    const logo = (event.currentTarget as Element).querySelector('.node-icon');
    if (logo) {
      this.iconPop.hoverLeave(logo);
    }
  }

  /** Resalta el nodo y abre el inspector de traza de su tecnología, si tiene una propia. */
  activate(node: ArchitectureNode): void {
    this.activeId.set(node.id);
    this.inspector.select(node.icon);
  }

  selectLevel(id: string): void {
    if (id === this.levelId()) {
      return;
    }
    this.levelId.set(id);
    this.activeId.set(this.level().defaultNode);
    this.events.emitFromUser([['info', 'C4', this.level().title]]);
  }

  // Patrón de pestañas: las flechas cambian de nivel y mueven el foco.
  onTabKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const index = LEVELS.findIndex((level) => level.id === this.levelId());
    const next = LEVELS[(index + step + LEVELS.length) % LEVELS.length];
    this.selectLevel(next.id);
    (event.currentTarget as HTMLElement).querySelector<HTMLElement>(`#c4-tab-${next.id}`)?.focus();
  }

  iconOf(node: ArchitectureNode): TechIcon | null {
    return node.icon ? TECH_ICONS[node.icon] : null;
  }

  isEdgeActive(edge: ArchitectureEdge): boolean {
    return edge.from === this.activeId() || edge.to === this.activeId();
  }
}

/** Recta entre nodos alineados (en horizontal o en vertical); curva suave en cualquier otro caso. */
function connect(from: ArchitectureNode, to: ArchitectureNode, width: number): string {
  if (from.x === to.x) {
    const direction = Math.sign(to.y - from.y);
    return `M${from.x} ${from.y + (direction * NODE_HEIGHT) / 2} V${to.y - (direction * NODE_HEIGHT) / 2}`;
  }
  const startX = from.x + width / 2;
  const endX = to.x - width / 2;
  if (from.y === to.y) {
    return `M${startX} ${from.y} H${endX}`;
  }
  const middle = (startX + endX) / 2;
  return `M${startX} ${from.y} C${middle} ${from.y} ${middle} ${to.y} ${endX} ${to.y}`;
}
