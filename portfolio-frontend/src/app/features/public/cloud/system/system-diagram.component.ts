import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ContainerWidthDirective } from '../../../../shared/ui/container-width.directive';
import { CloudNode, CloudProviderId } from '../cloud-topology.data';
import { SystemCategoryId } from './system-catalog.data';
import { SystemDesign } from './system-design';
import { DiagramNode, GLYPHS, buildSystemDiagram } from './system-diagram';

/**
 * El sistema de la vista de Aplicación, dibujado: se rehace con cada elección, y la pieza nueva y
 * sus conexiones entran con una animación. Si no cabe a lo ancho, las capas se apilan de arriba
 * abajo; nunca se encoge. El texto equivalente (para lectores de pantalla) es el resumen que la
 * vista conserva junto a él.
 */
@Component({
  selector: 'app-system-diagram',
  standalone: true,
  imports: [ContainerWidthDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex justify-center overflow-x-auto" appContainerWidth #box="containerWidth">
      @if (diagram(box.width()); as scene) {
        <svg
          class="system-diagram shrink-0"
          [attr.viewBox]="'0 0 ' + scene.width + ' ' + scene.height"
          [attr.width]="scene.width"
          [attr.height]="scene.height"
          [attr.data-layout]="scene.vertical ? 'vertical' : 'horizontal'"
          role="group"
          aria-label="Diagrama del sistema: sus piezas por capas y cómo se conectan"
          data-testid="system-diagram"
        >
          <defs>
            <marker id="system-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1 7 4 1 7" fill="none" stroke="context-stroke" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            </marker>
          </defs>

          @for (lane of scene.lanes; track lane.id) {
            <g aria-hidden="true">
              <rect class="lane" [attr.x]="lane.x" [attr.y]="lane.y" [attr.width]="lane.w" [attr.height]="lane.h" rx="12" />
              <text class="lane-label" [attr.x]="lane.x + 14" [attr.y]="lane.y + 19">{{ lane.label }}</text>
            </g>
          }

          @for (edge of scene.edges; track edge.id + edge.label + edge.path) {
            <g class="edge" [attr.data-kind]="edge.kind" [attr.data-edge]="edge.id" [class.edge-active]="edge.from === active() || edge.to === active()" aria-hidden="true">
              <path [attr.d]="edge.path" pathLength="1" marker-end="url(#system-arrow)" />
              @if (edge.label) {
                <rect class="edge-tag" [attr.x]="edge.labelAt[0] - (edge.label.length * 6.4 + 12) / 2" [attr.y]="edge.labelAt[1] - 9" [attr.width]="edge.label.length * 6.4 + 12" height="18" rx="9" />
                <text class="edge-label" [attr.x]="edge.labelAt[0]" [attr.y]="edge.labelAt[1] + 4" text-anchor="middle">{{ edge.label }}</text>
              }
            </g>
          }

          @for (node of scene.nodes; track node.key) {
            <g
              class="piece"
              [class.piece-active]="node.id === active()"
              [class.piece-pending]="node.pending"
              [attr.data-piece]="node.id"
              tabindex="0"
              role="button"
              [attr.aria-label]="label(node)"
              (click)="picked.emit(node.id)"
              (keydown.enter)="picked.emit(node.id)"
              (keydown.space)="picked.emit(node.id); $event.preventDefault()"
            >
              <rect [attr.x]="node.x" [attr.y]="node.y" [attr.width]="node.w" [attr.height]="node.h" rx="8" />
              <svg [attr.x]="node.x + 12" [attr.y]="node.y + 11" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path class="glyph" [attr.d]="glyphs[node.glyph]" />
              </svg>
              <text class="piece-kind" [attr.x]="node.x + 38" [attr.y]="node.y + 24">{{ node.kind }}</text>
              <!-- En una pieza estrecha, un nombre largo se ajusta a su ancho en vez de salirse. -->
              <text class="piece-title" [attr.x]="node.x + 12" [attr.y]="node.y + 46" [attr.textLength]="node.title.length * 8 > node.w - 24 ? node.w - 24 : null" lengthAdjust="spacingAndGlyphs">{{ node.title }}</text>
              @if (node.deployedOn; as target) {
                @if (target.image) {
                  <!-- Icono oficial de arquitectura de la nube, sin modificar y con el nombre al lado. -->
                  <image [attr.href]="target.image" [attr.x]="node.x + 12" [attr.y]="node.y + 54" width="14" height="14" aria-hidden="true" />
                }
                <text class="piece-where" [attr.x]="node.x + (target.image ? 31 : 12)" [attr.y]="node.y + 65">{{ target.name }}</text>
              } @else {
                <text class="piece-note" [attr.x]="node.x + 12" [attr.y]="node.y + 65">{{ node.note }}</text>
              }
            </g>
          }
        </svg>
      }
    </div>
  `,
  styles: `
    .system-diagram { display: block; max-width: none; }
    .lane { fill: var(--bg-surface-1); stroke: var(--border-subtle); stroke-width: 1; stroke-dasharray: 4 4; }
    .lane-label { fill: var(--text-3); font: 500 12px var(--font-sans, inherit); letter-spacing: 0.06em; text-transform: uppercase; }

    .piece { cursor: pointer; outline: none; animation: piece-in var(--duration-slow) var(--ease-emphasized) backwards; transform-box: fill-box; transform-origin: center; }
    .piece > rect { fill: var(--bg-surface-2); stroke: var(--border-strong); stroke-width: 1; transition: stroke var(--duration-fast) var(--ease-standard); }
    .piece:hover > rect { stroke: var(--border-control); }
    .piece-active > rect, .piece:focus-visible > rect { stroke: var(--accent-text); stroke-width: 1.5; }
    .piece-pending > rect { stroke-dasharray: 4 3; }
    .glyph { fill: none; stroke: var(--accent-text); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .piece-kind { fill: var(--text-3); font: 500 12px var(--font-sans, inherit); letter-spacing: 0.04em; text-transform: uppercase; }
    .piece-title { fill: var(--text-1); font: 600 14px var(--font-sans, inherit); }
    .piece-where { fill: var(--text-2); font: 400 12px var(--font-sans, inherit); }
    .piece-note { fill: var(--text-3); font: 400 12px var(--font-sans, inherit); }
    .piece-pending .piece-note { fill: var(--status-warn); }

    .edge path { fill: none; stroke: var(--border-control); stroke-width: 1.2; stroke-dasharray: 1; animation: edge-in var(--duration-layout) var(--ease-standard) backwards; }
    .edge[data-kind='async'] path, .edge[data-kind='auth'] path { stroke-dasharray: 0.04 0.03; animation-name: edge-fade; }
    .edge[data-kind='request'] path { stroke: var(--accent-text); }
    .edge-active path { stroke: var(--accent-text); stroke-width: 1.6; }
    .edge-tag { fill: var(--bg-canvas, var(--bg-surface-1)); stroke: var(--border-subtle); stroke-width: 1; }
    .edge-label { fill: var(--text-2); font: 500 12px var(--font-mono); }

    @keyframes piece-in { from { opacity: 0; transform: translateY(8px) scale(0.96); } }
    /* La línea se dibuja de un extremo a otro (pathLength = 1). */
    @keyframes edge-in { from { stroke-dashoffset: 1; opacity: 0; } to { stroke-dashoffset: 0; opacity: 1; } }
    @keyframes edge-fade { from { opacity: 0; } }
  `,
})
export class SystemDiagramComponent {
  readonly design = input.required<SystemDesign>();
  readonly nodes = input.required<CloudNode[]>();
  readonly provider = input.required<CloudProviderId>();
  /** Categoría resaltada (la que se está editando). */
  readonly active = input<SystemCategoryId | null>(null);
  /** El visitante ha pulsado una pieza: la vista lleva a su categoría. */
  readonly picked = output<SystemCategoryId>();

  readonly glyphs = GLYPHS;
  private readonly horizontal = computed(() => buildSystemDiagram(this.design(), this.nodes(), this.provider(), false));

  /** A lo ancho si cabe en el hueco que hay; si no, las capas se apilan. Antes de medir, a lo ancho. */
  diagram(available: number) {
    return available > 0 && this.horizontal().width > available
      ? buildSystemDiagram(this.design(), this.nodes(), this.provider(), true, available)
      : this.horizontal();
  }

  label(node: DiagramNode): string {
    const where = node.deployedOn ? `Se despliega en ${node.deployedOn.name}` : node.note;
    return `${node.kind}: ${node.fullName}. ${where}. Ir a sus opciones`;
  }
}
