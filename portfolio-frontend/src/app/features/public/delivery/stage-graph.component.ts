import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal,
} from '@angular/core';

import { TECH_ICONS, TechIconKey } from '../../../shared/ui/tech-icons';
import { CARD, PILL, columnsThatFit, edgePath, layoutStages } from './delivery-data';

export type NodeTone = 'ok' | 'skipped' | 'failed' | 'planned' | 'running' | 'pending' | 'idle';

export interface StageNode {
  id: string;
  stage: number;
  label: string;
  /** Línea de detalle: papel de la pieza, duración del job… */
  detail: string;
  tone: NodeTone;
  /** Lo que el lector de pantalla oye además del nombre: «correcto», «planificado»… */
  toneLabel: string;
  icon?: TechIconKey | null;
}

export interface StageEdge {
  from: string;
  to: string;
  /** Conexión decidida pero aún sin desplegar: punteada y quieta. */
  planned?: boolean;
}

/** Lo que tarda el punto de luz en recorrer una conexión. */
const SPARK_SECONDS = 3.5;

/** Por debajo de este ancho disponible no caben dos columnas con aire: el grafo pasa a vertical. */
const VERTICAL_BELOW = 520;
const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5];

/**
 * Grafo por etapas: una columna por etapa con sus conexiones (fan-out y fan-in). Se adapta al
 * ancho que tiene, sin comprimirse ni solaparse: si no caben todas las columnas, siguen en otra
 * franja debajo; si no caben ni dos, las etapas se apilan en vertical y sin líneas (móvil).
 * «Ajustar a pantalla» es la única forma de verlo entero en una sola franja, a escala.
 *
 * Al posar el cursor o el foco sobre un nodo (o elegirlo) se ilumina su camino, es decir, sus
 * conexiones de entrada y de salida con los nodos del otro extremo, y el resto se atenúa.
 */
@Component({
  selector: 'app-stage-graph',
  standalone: true,
  template: `
    @if (!vertical()) {
      <div class="tools" role="group" aria-label="Vista del diagrama">
        <button type="button" class="tool focus-ring" aria-label="Alejar" [disabled]="fit() || !canZoomOut()" (click)="zoomBy(-1)">−</button>
        <span class="level" aria-live="polite">{{ percent() }} %</span>
        <button type="button" class="tool focus-ring" aria-label="Acercar" [disabled]="fit() || !canZoomIn()" (click)="zoomBy(1)">+</button>
        <button type="button" class="tool wide focus-ring" [attr.aria-pressed]="fit()" (click)="toggleFit()">
          {{ fit() ? 'Tamaño real' : 'Ajustar a pantalla' }}
        </button>
      </div>
    }
    <div class="scroller">
      <div class="sizer" [style.width.px]="vertical() ? null : layout().width * scale()" [style.height.px]="vertical() ? null : layout().height * scale()">
        <div
          class="graph"
          [class.vertical]="vertical()"
          [class.pill]="variant() === 'pill'"
          [class.focused]="focusId() !== null"
          role="group"
          [attr.aria-label]="label()"
          [style.width.px]="vertical() ? null : layout().width"
          [style.height.px]="vertical() ? null : layout().height"
          [style.transform]="vertical() || scale() === 1 ? null : 'scale(' + scale() + ')'"
          [style.--node-width.px]="size().width"
          [style.--node-height.px]="size().height"
          (keydown)="onKey($event)"
        >
          <svg class="edges" [attr.viewBox]="'0 0 ' + layout().width + ' ' + layout().height" aria-hidden="true">
            @for (edge of paths(); track edge.key) {
              <path [attr.d]="edge.d" [class.planned]="edge.planned" [class.lit]="edge.lit" />
            }
          </svg>
          @if (animated()) {
            @for (edge of paths(); track edge.key; let index = $index) {
              @if (!edge.planned) {
                <!-- Un único punto de luz por conexión en vivo; las planificadas no se mueven. -->
                <span class="spark" [class.lit]="edge.lit" [style.offset-path]="'path(&quot;' + edge.d + '&quot;)'" [style.animation-delay.s]="-index * 0.9" aria-hidden="true"></span>
              }
            }
          }
          @for (stage of stages(); track stage.number; let column = $index) {
            <div class="stage">
              @if (stage.name) {
                <p class="stage-name" [style.--x.px]="layout().headers[column].x" [style.--y.px]="layout().headers[column].y">{{ stage.name }}</p>
              }
              @for (node of stage.nodes; track node.id) {
                <button
                  type="button"
                  [class]="'node focus-ring tone-' + node.tone"
                  [class.active]="node.id === activeId()"
                  [class.related]="related().has(node.id)"
                  [attr.data-node]="node.id"
                  [style.--x.px]="layout().positions[node.id].x"
                  [style.--y.px]="layout().positions[node.id].y"
                  [attr.aria-pressed]="node.id === activeId()"
                  [attr.aria-label]="node.label + ', ' + node.toneLabel + (node.detail ? ', ' + node.detail : '')"
                  (mouseenter)="hoverId.set(node.id)"
                  (mouseleave)="hoverId.set(null)"
                  (focus)="hoverId.set(node.id)"
                  (blur)="hoverId.set(null)"
                  (click)="picked.emit(node.id)"
                >
                  @if (node.icon; as key) {
                    <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                      <path [attr.d]="icons[key].path" [attr.fill]="icons[key].color" />
                    </svg>
                  }
                  <span class="text">
                    <span class="name">{{ node.label }}</span>
                    <span class="detail">{{ node.detail || node.toneLabel }}</span>
                  </span>
                  <span class="dot" aria-hidden="true"></span>
                </button>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .scroller { min-width: 0; overflow-x: auto; padding-bottom: 0.25rem; }
    .sizer { margin-inline: auto; }

    /* ── Controles de vista (solo cuando hay columnas) ── */
    .tools { display: flex; align-items: center; justify-content: flex-end; gap: 0.25rem; margin-bottom: 1rem; }
    .tool {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 28px; height: 28px; padding: 0 0.5rem;
      border: 1px solid rgb(255 255 255 / 0.1); border-radius: 8px; background: #18181b;
      color: #d4d4d8; font-size: 0.75rem; line-height: 1;
      transition: border-color 0.2s ease-out, color 0.2s ease-out;
    }
    .tool:hover:not(:disabled) { border-color: rgb(255 255 255 / 0.32); color: #fff; }
    .tool:disabled { opacity: 0.35; }
    .tool.wide { padding: 0 0.75rem; }
    .tool[aria-pressed='true'] { border-color: rgb(255 255 255 / 0.32); color: #fff; }
    /* Con el dedo, los controles miden 44 px. */
    @media (pointer: coarse) { .tool { min-width: 44px; height: 44px; } }
    .level { min-width: 3.25rem; text-align: center; color: #a1a1aa; font-size: 0.75rem; font-variant-numeric: tabular-nums; }

    /* ── Columnas con conexiones ── */
    .graph { position: relative; transform-origin: 0 0; }
    .stage { display: contents; }
    .stage-name {
      position: absolute; left: var(--x); top: var(--y); margin: 0;
      color: #71717a; font-size: 0.6875rem; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase;
    }
    .edges { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .edges path {
      fill: none; stroke: rgb(255 255 255 / 0.18); stroke-width: 1;
      transition: stroke 0.25s ease-out, opacity 0.25s ease-out;
    }
    .edges path.planned { stroke-dasharray: 3 4; }
    .graph.focused .edges path:not(.lit) { opacity: 0.4; }
    .edges path.lit { stroke: rgb(255 255 255 / 0.7); }

    .spark {
      position: absolute; left: 0; top: 0; width: 4px; height: 4px; margin: -2px 0 0 -2px;
      border-radius: 9999px; background: #fff; box-shadow: 0 0 6px 1px rgb(255 255 255 / 0.7);
      offset-rotate: 0deg;
      animation: travel 3.5s linear infinite;
      transition: opacity 0.25s ease-out;
    }
    .graph.focused .spark:not(.lit) { opacity: 0; }
    @keyframes travel {
      0% { offset-distance: 0%; opacity: 0; }
      8% { opacity: 1; }
      92% { opacity: 1; }
      100% { offset-distance: 100%; opacity: 0; }
    }

    /* ── Nodo ── */
    .node {
      position: absolute; left: var(--x); top: var(--y); width: var(--node-width); height: var(--node-height);
      display: flex; align-items: center; gap: 0.625rem; padding: 0 0.75rem;
      border: 1px solid rgb(255 255 255 / 0.1); border-radius: 8px;
      background: #18181b; /* un punto más claro que la tarjeta, y opaco: las líneas pasan por detrás */
      text-align: left;
      transition: opacity 0.25s ease-out, border-color 0.25s ease-out;
    }
    .node:hover, .node.active { border-color: rgb(255 255 255 / 0.32); }
    .icon { flex: none; width: 16px; height: 16px; overflow: hidden; transition: width 0.25s ease-out, height 0.25s ease-out; }
    .node.active .icon { width: 20px; height: 20px; }
    .text { display: flex; min-width: 0; flex: 1; flex-direction: column; }
    .name { color: #fafafa; font-size: 0.875rem; font-weight: 500; line-height: 1.3; }
    .detail { color: #a1a1aa; font-size: 0.75rem; line-height: 1.3; }
    /* En columnas cada texto va en una línea; el nombre completo está en la ficha y en la etiqueta accesible. */
    .name, .detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dot { flex: none; width: 8px; height: 8px; border-radius: 9999px; background: #52525b; }

    /* El estado va en el punto (y en el borde punteado de lo planificado); el fondo no cambia. */
    .tone-ok .dot { background: #34d399; }
    .tone-failed .dot { background: #f87171; }
    .tone-skipped .dot { background: #52525b; }
    .tone-skipped .name { color: #a1a1aa; }
    .tone-idle .dot, .tone-pending .dot { background: transparent; box-shadow: inset 0 0 0 1px #71717a; }
    .tone-pending { opacity: 0.4; }
    .tone-planned { border-style: dashed; border-color: rgb(255 255 255 / 0.22); }
    .tone-planned .dot { background: transparent; box-shadow: inset 0 0 0 1px #a1a1aa; }
    .tone-running .dot { background: #0a84ff; animation: pulse 0.9s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: 0.25; } }

    /* Con un nodo señalado, lo que no está en su camino baja al 40 %. */
    .graph.focused .node:not(.related) { opacity: 0.4; }

    /* ── Píldoras (jobs del pipeline) ── */
    .pill .node { border-radius: 9999px; padding: 0 0.875rem; gap: 0.5rem; }
    .pill .text { flex-direction: row; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
    .pill .name { font-size: 0.8125rem; }
    .pill .detail { flex: none; font-size: 0.6875rem; font-variant-numeric: tabular-nums; }
    .pill .dot { order: -1; }

    /* ── Vertical (no caben dos columnas): etapas apiladas, sin líneas ── */
    .graph.vertical { display: flex; flex-direction: column; gap: 1.5rem; }
    .vertical .stage { display: flex; flex-direction: column; gap: 0.5rem; }
    .vertical .edges, .vertical .spark { display: none; }
    .vertical .stage-name { position: static; }
    .vertical .node { position: static; width: 100%; height: auto; min-height: 52px; }
    .vertical.pill .node { min-height: 44px; }
    .vertical .name, .vertical .detail { white-space: normal; overflow-wrap: anywhere; }

    @media (prefers-reduced-motion: reduce) {
      .spark { display: none !important; }
      .tone-running .dot { animation: none; }
      .node, .icon, .edges path, .tool { transition: none; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StageGraphComponent {
  readonly nodes = input.required<StageNode[]>();
  readonly edges = input<StageEdge[]>([]);
  readonly activeId = input<string | null>(null);
  readonly label = input('Grafo');
  /** `card` para piezas de arquitectura; `pill` para jobs, que son muchos más y más pequeños. */
  readonly variant = input<'card' | 'pill'>('card');
  /** Nombre de cada etapa, por su número. Sin nombres no se rotulan las columnas. */
  readonly stageNames = input<string[]>([]);
  /** Punto de luz recorriendo las conexiones en vivo. */
  readonly animated = input(false);
  readonly picked = output<string>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  readonly icons = TECH_ICONS;
  readonly sparkSeconds = SPARK_SECONDS;
  /** Nodo bajo el cursor o con el foco. */
  readonly hoverId = signal<string | null>(null);
  /** Nodo cuyo camino se ilumina: el señalado y, si no hay, el elegido. */
  readonly focusId = computed(() => this.hoverId() ?? this.activeId());

  /** Ancho disponible para el diagrama. 0 = aún no se sabe (se dibuja en una franja). */
  readonly available = signal(0);
  /** Escala elegida con los botones de zoom. */
  readonly zoom = signal(1);
  /** «Ajustar a pantalla»: todas las columnas en una franja, a la escala que quepa. */
  readonly fit = signal(false);

  /** Con el dedo, las píldoras miden 44 px de alto también en la vista de columnas. */
  private readonly touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  readonly size = computed(() => {
    const pill = this.touch ? { ...PILL, height: 44 } : PILL;
    const base = this.variant() === 'pill' ? pill : CARD;
    return this.stageNames().length > 0 ? base : { ...base, top: 0 };
  });

  readonly vertical = computed(() => this.available() > 0 && this.available() < VERTICAL_BELOW);

  readonly layout = computed(() => {
    const available = this.available();
    if (available === 0 || this.fit()) {
      return layoutStages(this.nodes(), this.size());
    }
    const room = available / this.zoom();
    const single = layoutStages(this.nodes(), this.size());
    if (single.width <= room) {
      return single;
    }
    // No cabe en una franja: tantas columnas por franja como quepan, descontando el pasillo de los lados.
    return layoutStages(this.nodes(), this.size(), columnsThatFit(room - this.size().columnGap, this.size()));
  });

  /** Escala a la que se pinta: la que hace falta para ajustar, o la elegida. */
  readonly scale = computed(() => {
    if (!this.fit()) {
      return this.zoom();
    }
    const available = this.available();
    return available > 0 ? Math.min(1, available / this.layout().width) : 1;
  });
  readonly percent = computed(() => Math.round(this.scale() * 100));
  readonly canZoomIn = computed(() => this.zoom() < ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  readonly canZoomOut = computed(() => this.zoom() > ZOOM_STEPS[0]);

  readonly stages = computed(() => {
    const byId = new Map(this.nodes().map((node) => [node.id, node]));
    const { stages, stageNumbers } = this.layout();
    return stages.map((ids, index) => ({
      number: stageNumbers[index],
      name: this.stageNames()[stageNumbers[index]] ?? '',
      nodes: ids.map((id) => byId.get(id)!),
    }));
  });

  /** El nodo señalado y los que están al otro extremo de sus conexiones. */
  readonly related = computed(() => {
    const focus = this.focusId();
    const related = new Set<string>();
    if (focus !== null) {
      related.add(focus);
      for (const edge of this.edges()) {
        if (edge.from === focus) {
          related.add(edge.to);
        } else if (edge.to === focus) {
          related.add(edge.from);
        }
      }
    }
    return related;
  });

  readonly paths = computed(() => {
    const { positions, bandLanes } = this.layout();
    const focus = this.focusId();
    return this.edges()
      .filter((edge) => positions[edge.from] && positions[edge.to])
      .map((edge) => ({
        key: `${edge.from}>${edge.to}`,
        d: edgePath(positions[edge.from], positions[edge.to], this.size(), bandLanes),
        planned: edge.planned === true,
        lit: focus !== null && (edge.from === focus || edge.to === focus),
      }));
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    // El ancho se mide del propio componente: el diagrama se reorganiza con su contenedor, no con la ventana.
    afterNextRender(() => {
      if (typeof ResizeObserver !== 'function') {
        return;
      }
      const observer = new ResizeObserver(([entry]) => this.available.set(Math.floor(entry.contentRect.width)));
      observer.observe(this.host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  zoomBy(direction: 1 | -1): void {
    const index = ZOOM_STEPS.indexOf(this.zoom());
    this.zoom.set(ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, (index < 0 ? 3 : index) + direction))]);
  }

  toggleFit(): void {
    this.fit.update((fit) => !fit);
  }

  /** Flechas: izquierda y derecha cambian de etapa; arriba y abajo, de nodo dentro de la etapa. */
  onKey(event: KeyboardEvent): void {
    const current = (event.target as HTMLElement).closest<HTMLElement>('[data-node]')?.dataset['node'];
    if (!current) {
      return;
    }
    const stages = this.layout().stages;
    const column = stages.findIndex((stage) => stage.includes(current));
    const row = stages[column].indexOf(current);
    const at = (c: number, r: number): string | undefined => stages[c]?.[Math.min(r, (stages[c]?.length ?? 1) - 1)];
    const target = {
      ArrowRight: at(column + 1, row),
      ArrowLeft: at(column - 1, row),
      ArrowDown: stages[column][row + 1],
      ArrowUp: stages[column][row - 1],
      Home: stages[0][0],
      End: stages[stages.length - 1][stages[stages.length - 1].length - 1],
    }[event.key];
    if (target) {
      event.preventDefault();
      this.host.querySelector<HTMLElement>(`[data-node="${target}"]`)?.focus();
    }
  }
}

/**
 * Lleva a la vista la ficha del elemento elegido si quedó fuera de la pantalla: en el móvil el
 * grafo es una lista larga y la ficha está al final.
 */
export function revealDetail(detail: { nativeElement: HTMLElement } | undefined): void {
  const element = detail?.nativeElement;
  if (!element || typeof element.scrollIntoView !== 'function') {
    return;
  }
  const rect = element.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }
}
