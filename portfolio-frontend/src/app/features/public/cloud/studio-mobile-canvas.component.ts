import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

import { ContainerWidthDirective } from '../../../shared/ui/container-width.directive';
import { TechIcon } from '../../../shared/ui/tech-icons';
import { verticalFlow } from '../../../shared/ui/vertical-flow';

/** Una pieza del lienzo tal como se lista en el móvil. */
export interface MobileRow {
  id: string;
  label: string;
  role: string;
  icon: TechIcon | null;
  /** Línea de detalle: zona de red y coste. */
  meta: string;
  /** El coste de `meta` es un precio de lista real. */
  live: boolean;
  /** Estado durante una simulación de fallos. */
  state: { label: string; level: 'ok' | 'warn' | 'down' } | null;
}

const NODE_HEIGHT = 68;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;
/** Desplazamiento a partir del cual un gesto es un arrastre y no un toque sobre un nodo. */
const DRAG_THRESHOLD = 6;

/** Recorta un texto a lo que cabe, con puntos suspensivos; el nombre completo va en la etiqueta accesible. */
export function fitText(text: string, width: number, charWidth: number): string {
  const max = Math.max(4, Math.floor(width / charWidth));
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
}

/**
 * El lienzo del Estudio para pantallas estrechas, de solo lectura: las mismas piezas y conexiones
 * del proyecto, de arriba abajo y a todo el ancho, con el texto a tamaño de lectura. Se amplía con
 * dos dedos o con los botones y, ampliado, se arrastra; «Ajustar a pantalla» lo devuelve entero.
 */
@Component({
    selector: 'app-studio-mobile-canvas',
    imports: [TranslatePipe, ContainerWidthDirective],
    host: { class: 'block' },
    template: `
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-1" role="group" [attr.aria-label]="'Zoom del diagrama' | t">
        <button type="button" class="ui-btn-secondary ui-btn-icon" [attr.aria-label]="'Alejar' | t" [disabled]="zoom() <= minZoom" (click)="zoomBy(-step)">
          <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 8h9" /></svg>
        </button>
        <span class="min-w-[3.25rem] text-center font-mono text-mono-sm text-ink-2" aria-live="polite" data-testid="mobile-zoom">{{ percent() }}</span>
        <button type="button" class="ui-btn-secondary ui-btn-icon" [attr.aria-label]="'Acercar' | t" [disabled]="zoom() >= maxZoom" (click)="zoomBy(step)">
          <svg viewBox="0 0 16 16" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" /></svg>
        </button>
      </div>
      <button type="button" class="ui-btn-secondary" [disabled]="zoom() === minZoom" (click)="fit()">{{ 'Ajustar a pantalla' | t }}</button>
      <p class="w-full text-caption font-normal text-ink-3">{{ 'Solo lectura. Pellizca para ampliar y arrastra para moverte; la edición necesita una pantalla más ancha.' | t }}</p>
    </div>

    <div
      appContainerWidth
      class="viewport overflow-hidden rounded-panel"
      [style.touch-action]="zoom() > minZoom ? 'none' : 'pan-y'"
      [style.height.px]="scene().height"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerEnd($event)"
      (pointercancel)="onPointerEnd($event)"
      (pointerleave)="onPointerEnd($event)"
    >
      <svg
        [attr.viewBox]="'0 0 ' + scene().width + ' ' + scene().height"
        [attr.width]="scene().width"
        [attr.height]="scene().height"
        class="block origin-top-left"
        data-layout="vertical"
        role="group"
        [attr.aria-label]="'Piezas del proyecto, de arriba abajo en el sentido de la petición' | t"
        [style.transform]="'translate(' + offset().x + 'px,' + offset().y + 'px) scale(' + zoom() + ')'"
      >
        @for (edge of scene().edges; track edge.from + edge.to) {
          <path class="wire" [class.wire-active]="edge.from === activeId() || edge.to === activeId()" [attr.d]="edge.path" />
        }
        @for (placed of scene().nodes; track placed.row.id) {
          <g
            class="node"
            [class.node-active]="placed.row.id === activeId()"
            [attr.data-level]="placed.row.state?.level ?? null"
            [attr.data-node-id]="placed.row.id"
            [style.--brand]="placed.row.icon?.color"
            tabindex="0"
            role="button"
            [attr.aria-label]="placed.row.label + ': ' + placed.row.role + '. ' + placed.row.meta + (placed.row.state ? '. Estado: ' + placed.row.state.label : '')"
            [attr.aria-pressed]="placed.row.id === activeId()"
            (click)="picked.emit({ id: placed.row.id, event: $event })"
            (keydown.enter)="picked.emit({ id: placed.row.id, event: $event })"
          >
            <rect [attr.x]="placed.x" [attr.y]="placed.y" [attr.width]="placed.w" [attr.height]="placed.h" rx="8" />
            @if (placed.row.icon; as icon) {
              @if (icon.image) {
                <image class="node-icon" [attr.href]="icon.image" [attr.x]="placed.x + 12" [attr.y]="placed.y + 12" width="20" height="20" aria-hidden="true" />
              } @else {
                <svg class="node-icon" [attr.x]="placed.x + 13" [attr.y]="placed.y + 13" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path [attr.d]="icon.path" [attr.fill]="icon.color" />
                </svg>
              }
            }
            <text class="node-service" [attr.x]="placed.textX" [attr.y]="placed.y + 22">{{ placed.label }}</text>
            <text class="node-role" [attr.x]="placed.textX" [attr.y]="placed.y + 39">{{ placed.role }}</text>
            <text class="node-meta" [class.node-meta-live]="placed.row.live" [attr.x]="placed.textX" [attr.y]="placed.y + 56">{{ placed.meta }}</text>
          </g>
        }
      </svg>
    </div>
  `,
    styles: `
    .viewport { cursor: grab; }
    svg { will-change: transform; }
    .wire { fill: none; stroke: var(--border-strong); stroke-width: 1; }
    .wire-active { stroke: var(--accent-text); stroke-width: 1.5; }
    .node { cursor: pointer; outline: none; }
    .node rect { fill: var(--bg-surface-2); stroke: var(--border-subtle); stroke-width: 1; }
    .node-active rect { stroke: var(--accent-text); stroke-width: 1.5; }
    .node:focus-visible rect { stroke: var(--accent-text); stroke-width: 2; }
    .node[data-level='down'] rect { stroke: var(--status-danger); }
    .node[data-level='warn'] rect { stroke: var(--status-warn); }
    .node[data-level='ok'] rect { stroke: var(--status-ok); }
    .node-icon { pointer-events: none; }
    .node-service { fill: var(--text-1); font-size: 13px; font-weight: 600; pointer-events: none; }
    .node-role { fill: var(--text-2); font-size: 12px; pointer-events: none; }
    .node-meta { fill: var(--text-3); font-size: 12px; pointer-events: none; font-variant-numeric: tabular-nums; }
    .node-meta-live { fill: var(--accent-text); }
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class StudioMobileCanvasComponent {
  readonly rows = input.required<MobileRow[]>();
  readonly links = input.required<[string, string][]>();
  readonly activeId = input<string | null>(null);
  readonly picked = output<{ id: string; event: Event }>();

  readonly minZoom = MIN_ZOOM;
  readonly maxZoom = MAX_ZOOM;
  readonly step = ZOOM_STEP;
  readonly zoom = signal(MIN_ZOOM);
  readonly offset = signal({ x: 0, y: 0 });
  readonly percent = computed(() => `${Math.round(this.zoom() * 100)} %`);

  private readonly box = viewChild(ContainerWidthDirective);

  /** Las piezas apiladas en el orden de la petición, a todo el ancho que hay. */
  readonly scene = computed(() => {
    const rows = this.rows();
    const width = this.box()?.width() || 320;
    const flow = verticalFlow(rows.map((row) => row.id), this.links(), width, { nodeHeight: NODE_HEIGHT, gap: 16 });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      width: flow.width,
      height: flow.height,
      edges: flow.edges,
      nodes: flow.boxes.map((placed) => {
        const row = byId.get(placed.id)!;
        const textX = placed.x + (row.icon ? 44 : 14);
        const room = placed.x + placed.w - textX - 10;
        return {
          ...placed, row, textX,
          label: fitText(row.label + (row.state ? ` · ${row.state.label}` : ''), room, 7.4),
          role: fitText(row.role, room, 6.6),
          meta: fitText(row.meta, room, 6.6),
        };
      }),
    };
  });

  constructor() {
    // Tras arrastrar o pellizcar, el toque que cierra el gesto no selecciona el nodo que haya debajo.
    // Se escucha en fase de captura: el nodo no llega a enterarse.
    const host: HTMLElement = inject(ElementRef).nativeElement;
    host.addEventListener('click', (event) => {
      if (this.dragged && (event.target as Element).closest('.viewport')) {
        event.stopPropagation();
        this.dragged = false;
      }
    }, true);
  }

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { distance: number; zoom: number } | null = null;
  private dragged = false;
  private travelled = 0;

  fit(): void {
    this.zoom.set(MIN_ZOOM);
    this.offset.set({ x: 0, y: 0 });
  }

  /** Amplía o reduce alrededor del centro de lo que se ve. */
  zoomBy(delta: number): void {
    const scene = this.scene();
    this.zoomAround(this.zoom() + delta, scene.width / 2, Math.min(scene.height, 480) / 2);
  }

  onPointerDown(event: PointerEvent): void {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.travelled = 0;
    this.dragged = false;
    if (this.pointers.size === 2) {
      this.pinch = { distance: this.spread(), zoom: this.zoom() };
    }
  }

  onPointerMove(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) {
      return;
    }
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.travelled += Math.hypot(dx, dy);
    if (this.travelled > DRAG_THRESHOLD) {
      this.dragged = true;
    }
    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const origin = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.zoomAround(this.pinch.zoom * (this.spread() / (this.pinch.distance || 1)), (a.x + b.x) / 2 - origin.left, (a.y + b.y) / 2 - origin.top);
    } else if (this.zoom() > MIN_ZOOM) {
      // Ampliado, un dedo mueve el diagrama; sin ampliar, desplaza la página.
      event.preventDefault();
      this.offset.set(this.clamp({ x: this.offset().x + dx, y: this.offset().y + dy }, this.zoom()));
    }
  }

  onPointerEnd(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) {
      this.pinch = null;
    }
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Cambia el zoom dejando quieto el punto (x, y) del visor. */
  private zoomAround(target: number, x: number, y: number): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target));
    const current = this.zoom();
    const offset = this.offset();
    const ratio = next / current;
    this.zoom.set(next);
    this.offset.set(this.clamp({ x: x - (x - offset.x) * ratio, y: y - (y - offset.y) * ratio }, next));
  }

  /** El diagrama nunca deja hueco: sus bordes no entran más allá de los del visor. */
  private clamp(offset: { x: number; y: number }, zoom: number): { x: number; y: number } {
    const scene = this.scene();
    return {
      x: Math.min(0, Math.max(scene.width * (1 - zoom), offset.x)),
      y: Math.min(0, Math.max(scene.height * (1 - zoom), offset.y)),
    };
  }
}
