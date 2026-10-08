import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { TechIconComponent } from '../../../shared/ui/tech-icon.component';
import { TECH_ICONS, TechIconKey } from '../../../shared/ui/tech-icons';
import { CARD_HEIGHT, CARD_WIDTH, edgePath, layoutStages } from './delivery-data';

export type NodeTone = 'ok' | 'skipped' | 'failed' | 'planned' | 'running' | 'pending' | 'idle';

export interface StageNode {
  id: string;
  stage: number;
  label: string;
  /** Segunda línea: duración, papel de la pieza… */
  detail: string;
  tone: NodeTone;
  /** Lo que el lector de pantalla oye además del nombre: «correcto», «planificado»… */
  toneLabel: string;
  icon?: TechIconKey | null;
}

export interface StageEdge {
  from: string;
  to: string;
  planned?: boolean;
}

/**
 * Grafo por etapas. En pantallas anchas, columnas de izquierda a derecha con sus conexiones
 * (fan-out y fan-in); en el móvil, las mismas etapas apiladas en vertical, sin líneas. Es una sola
 * lista de botones: el cambio de disposición es solo CSS.
 */
@Component({
  selector: 'app-stage-graph',
  standalone: true,
  imports: [TechIconComponent],
  template: `
    <div class="scroller" tabindex="-1">
      <div
        class="graph"
        role="group"
        [attr.aria-label]="label()"
        [style.--graph-width.px]="layout().width"
        [style.--graph-height.px]="layout().height"
        [style.--card-width.px]="cardWidth"
        [style.--card-height.px]="cardHeight"
      >
        <svg class="edges" [attr.viewBox]="'0 0 ' + layout().width + ' ' + layout().height" aria-hidden="true">
          @for (edge of paths(); track edge.key) {
            <path [attr.d]="edge.d" [class.edge-planned]="edge.planned" [class.edge-active]="edge.active" />
          }
        </svg>
        @for (stage of stages(); track $index; let last = $last) {
          <div class="stage">
            @for (node of stage; track node.id) {
              <button
                type="button"
                class="node focus-ring"
                [class]="'node tone-' + node.tone"
                [class.node-active]="node.id === activeId()"
                [style.--x.px]="layout().positions[node.id].x"
                [style.--y.px]="layout().positions[node.id].y"
                [attr.aria-pressed]="node.id === activeId()"
                [attr.aria-label]="node.label + ', ' + node.toneLabel + (node.detail ? ', ' + node.detail : '')"
                (click)="picked.emit(node.id)"
              >
                @if (node.icon) {
                  <app-tech-icon [icon]="icons[node.icon]" [size]="18" />
                }
                <span class="text">
                  <span class="name">{{ node.label }}</span>
                  <span class="detail">{{ node.detail || node.toneLabel }}</span>
                </span>
                <span class="dot" aria-hidden="true"></span>
              </button>
            }
          </div>
          @if (!last) {
            <span class="between" aria-hidden="true">↓</span>
          }
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .graph { display: flex; flex-direction: column; gap: 0.5rem; }
    .stage { display: flex; flex-direction: column; gap: 0.5rem; }
    .between { align-self: center; color: rgb(255 255 255 / 0.3); font-size: 0.75rem; line-height: 1; }
    .edges { display: none; }

    .node {
      display: flex; align-items: center; gap: 0.625rem;
      min-height: 3.75rem; width: 100%;
      padding: 0.5rem 0.75rem;
      border-radius: 1rem; border: 1px solid rgb(255 255 255 / 0.12);
      /* Opaco: las conexiones pasan por detrás de las tarjetas, no por encima del texto. */
      background: #141416;
      text-align: left;
      transition: border-color 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s;
    }
    .node-active { border-color: #0a84ff; background: #0d2238; }
    .text { display: flex; min-width: 0; flex: 1; flex-direction: column; }
    .name { color: #fff; font-size: 0.8125rem; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
    .detail { color: #a1a1aa; font-size: 0.6875rem; line-height: 1.3; }
    .dot { height: 0.5rem; width: 0.5rem; flex: none; border-radius: 9999px; background: #52525b; }

    .tone-ok .dot { background: #34d399; }
    .tone-failed { border-color: rgb(248 113 113 / 0.6); }
    .tone-failed .dot { background: #f87171; }
    .tone-skipped { opacity: 0.55; }
    .tone-pending { opacity: 0.4; }
    /* Planificado: decidido pero sin desplegar. El borde punteado lo distingue sin depender del color. */
    .tone-planned { border-style: dashed; border-color: rgb(255 255 255 / 0.28); background: #0c0c0d; }
    .tone-planned .dot { background: transparent; border: 1px dashed #a1a1aa; }
    .tone-running { border-color: #0a84ff; }
    .tone-running .dot { background: #0a84ff; animation: pulse-dot 0.9s ease-in-out infinite; }
    @keyframes pulse-dot { 50% { opacity: 0.25; } }

    /* Pantallas anchas: columnas por etapa con las conexiones dibujadas. */
    @media (min-width: 640px) {
      .scroller { overflow-x: auto; padding-bottom: 0.25rem; }
      .graph { position: relative; display: block; width: var(--graph-width); height: var(--graph-height); }
      .stage { display: contents; }
      .between { display: none; }
      .edges { display: block; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
      .edges path { fill: none; stroke: rgb(255 255 255 / 0.2); stroke-width: 1.5; transition: stroke 0.4s; }
      .edges .edge-planned { stroke-dasharray: 4 5; }
      .edges .edge-active { stroke: #0a84ff; stroke-width: 2; }
      .node { position: absolute; left: var(--x); top: var(--y); width: var(--card-width); height: var(--card-height); min-height: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .tone-running .dot { animation: none; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StageGraphComponent {
  readonly nodes = input.required<StageNode[]>();
  readonly edges = input<StageEdge[]>([]);
  readonly activeId = input<string | null>(null);
  readonly label = input('Grafo');
  readonly picked = output<string>();

  readonly icons = TECH_ICONS;
  readonly cardWidth = CARD_WIDTH;
  readonly cardHeight = CARD_HEIGHT;

  readonly layout = computed(() => layoutStages(this.nodes()));
  readonly stages = computed(() => {
    const byId = new Map(this.nodes().map((node) => [node.id, node]));
    return this.layout().stages.map((stage) => stage.map((id) => byId.get(id)!));
  });
  readonly paths = computed(() => {
    const { positions } = this.layout();
    const active = this.activeId();
    return this.edges()
      .filter((edge) => positions[edge.from] && positions[edge.to])
      .map((edge) => ({
        key: `${edge.from}>${edge.to}`,
        d: edgePath(positions[edge.from], positions[edge.to]),
        planned: edge.planned === true,
        active: active !== null && (edge.from === active || edge.to === active),
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
