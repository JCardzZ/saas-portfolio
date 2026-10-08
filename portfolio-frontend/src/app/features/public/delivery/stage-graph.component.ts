import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { TECH_ICONS, TechIconKey } from '../../../shared/ui/tech-icons';
import { CARD, PILL, edgePath, layoutStages } from './delivery-data';

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

/**
 * Grafo por etapas. En pantallas anchas, una columna por etapa con sus conexiones (fan-out y
 * fan-in); por debajo de 640 px, las mismas etapas apiladas en vertical y sin líneas. Es una sola
 * lista de botones: el cambio de disposición es solo CSS.
 *
 * Al posar el cursor o el foco sobre un nodo (o elegirlo) se ilumina su camino, es decir, sus
 * conexiones de entrada y de salida con los nodos del otro extremo, y el resto se atenúa.
 */
@Component({
  selector: 'app-stage-graph',
  standalone: true,
  template: `
    <div class="scroller">
      <div
        class="graph"
        [class.pill]="variant() === 'pill'"
        [class.focused]="focusId() !== null"
        role="group"
        [attr.aria-label]="label()"
        [style.--graph-width.px]="layout().width"
        [style.--graph-height.px]="layout().height"
        [style.--node-width.px]="size().width"
        [style.--node-height.px]="size().height"
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
              <p class="stage-name" [style.--x.px]="column * (size().width + size().columnGap)">{{ stage.name }}</p>
            }
            @for (node of stage.nodes; track node.id) {
              <button
                type="button"
                [class]="'node focus-ring tone-' + node.tone"
                [class.active]="node.id === activeId()"
                [class.related]="related().has(node.id)"
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
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .scroller { min-width: 0; }

    /* ── Móvil: etapas apiladas en vertical, sin líneas ── */
    .graph { display: flex; flex-direction: column; gap: 1rem; }
    .stage { display: flex; flex-direction: column; gap: 0.5rem; }
    .edges, .spark { display: none; }
    .stage-name {
      margin: 0; color: #71717a; font-size: 0.6875rem; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase;
    }

    /* ── Nodo ── */
    .node {
      display: flex; align-items: center; gap: 0.625rem;
      width: 100%; min-height: 52px; padding: 0 0.75rem;
      border: 1px solid rgb(255 255 255 / 0.1); border-radius: 8px;
      background: #18181b; /* un punto más claro que la tarjeta, y opaco: las líneas pasan por detrás */
      text-align: left;
      transition: opacity 0.25s ease-out, border-color 0.25s ease-out;
    }
    .node:hover, .node.active { border-color: rgb(255 255 255 / 0.32); }
    .icon { flex: none; width: 16px; height: 16px; overflow: hidden; transition: width 0.25s ease-out, height 0.25s ease-out; }
    .node.active .icon { width: 20px; height: 20px; }
    .text { display: flex; min-width: 0; flex: 1; flex-direction: column; }
    .name { color: #fafafa; font-size: 0.875rem; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; }
    .detail { color: #a1a1aa; font-size: 0.75rem; line-height: 1.3; overflow-wrap: anywhere; }
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
    .pill .node { min-height: 44px; border-radius: 9999px; padding: 0 0.875rem; gap: 0.5rem; }
    .pill .text { flex-direction: row; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
    .pill .name { font-size: 0.8125rem; }
    .pill .detail { flex: none; font-size: 0.6875rem; font-variant-numeric: tabular-nums; }
    .pill .dot { order: -1; }

    /* ── Pantallas anchas: columnas por etapa con las conexiones dibujadas ── */
    @media (min-width: 640px) {
      .scroller { overflow-x: auto; padding-bottom: 0.25rem; }
      .graph { position: relative; display: block; width: var(--graph-width); height: var(--graph-height); margin-inline: auto; }
      .stage { display: contents; }
      .stage-name { position: absolute; left: var(--x); top: 0; }
      .node { position: absolute; left: var(--x); top: var(--y); width: var(--node-width); height: var(--node-height); min-height: 0; }
      .pill .node { min-height: 0; }
      /* En columnas cada texto va en una línea; el nombre completo está en la ficha y en la etiqueta accesible. */
      .name, .detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      .edges { display: block; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
      .edges path {
        fill: none; stroke: rgb(255 255 255 / 0.18); stroke-width: 1;
        transition: stroke 0.25s ease-out, opacity 0.25s ease-out;
      }
      .edges path.planned { stroke-dasharray: 3 4; }
      .graph.focused .edges path:not(.lit) { opacity: 0.4; }
      .edges path.lit { stroke: rgb(255 255 255 / 0.7); }

      .spark {
        display: block; position: absolute; left: 0; top: 0; width: 4px; height: 4px; margin: -2px 0 0 -2px;
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
    }
    /* Con el dedo, en la vista de columnas los nodos conservan su alto de diseño; en vertical miden 52 o 44. */
    @media (prefers-reduced-motion: reduce) {
      .spark { display: none !important; }
      .tone-running .dot { animation: none; }
      .node, .icon, .edges path { transition: none; }
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

  readonly icons = TECH_ICONS;
  readonly sparkSeconds = SPARK_SECONDS;
  /** Nodo bajo el cursor o con el foco. */
  readonly hoverId = signal<string | null>(null);
  /** Nodo cuyo camino se ilumina: el señalado y, si no hay, el elegido. */
  readonly focusId = computed(() => this.hoverId() ?? this.activeId());

  /** Con el dedo, las píldoras miden 44 px de alto también en la vista de columnas. */
  private readonly touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  readonly size = computed(() => {
    const pill = this.touch ? { ...PILL, height: 44, rowGap: 8 } : PILL;
    const base = this.variant() === 'pill' ? pill : CARD;
    return this.stageNames().length > 0 ? base : { ...base, top: 0 };
  });
  readonly layout = computed(() => layoutStages(this.nodes(), this.size()));
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
    const { positions } = this.layout();
    const focus = this.focusId();
    return this.edges()
      .filter((edge) => positions[edge.from] && positions[edge.to])
      .map((edge) => ({
        key: `${edge.from}>${edge.to}`,
        d: edgePath(positions[edge.from], positions[edge.to], this.size()),
        planned: edge.planned === true,
        lit: focus !== null && (edge.from === focus || edge.to === focus),
      }));
  });
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
