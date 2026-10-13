import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

import { ContainerWidthDirective } from '../../../../shared/ui/container-width.directive';
import { CloudNode, CloudProviderId } from '../cloud-topology.data';
import { SystemCategoryId } from './system-catalog.data';
import { SystemDesign } from './system-design';
import { DiagramNode, GLYPHS, SystemDiagram, buildSystemDiagram } from './system-diagram';

/**
 * El sistema de la vista de Aplicación, dibujado: se rehace con cada elección, y la pieza nueva y
 * sus conexiones entran con una animación. Si no cabe a lo ancho, las capas se apilan de arriba
 * abajo; nunca se encoge. El texto equivalente (para lectores de pantalla) es el resumen que la
 * vista conserva junto a él.
 */
@Component({
  selector: 'app-system-diagram',
  standalone: true,
  imports: [TranslatePipe, ContainerWidthDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p class="text-xs font-medium uppercase tracking-wider text-ink-3">{{ 'Arquitectura del sistema' | t }}</p>
      <ul class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3" [attr.aria-label]="'Tipos de conexión' | t">
        <li class="flex items-center gap-1.5"><span class="legend legend-request" aria-hidden="true"></span>{{ 'petición' | t }}</li>
        <li class="flex items-center gap-1.5"><span class="legend legend-data" aria-hidden="true"></span>{{ 'datos' | t }}</li>
        <li class="flex items-center gap-1.5"><span class="legend legend-async" aria-hidden="true"></span>{{ 'asíncrono' | t }}</li>
        <li class="flex items-center gap-1.5"><span class="legend legend-auth" aria-hidden="true"></span>{{ 'identidad' | t }}</li>
      </ul>
    </div>
    <div class="canvas flex justify-center overflow-x-auto rounded-panel border border-line-subtle p-2" appContainerWidth #box="containerWidth">
      @if (diagram(box.width() - 18); as scene) {
        <svg
          class="system-diagram shrink-0"
          [attr.viewBox]="'0 0 ' + scene.width + ' ' + scene.height"
          [attr.width]="scene.width"
          [attr.height]="scene.height"
          [attr.data-layout]="scene.vertical ? 'vertical' : 'horizontal'"
          [class.is-hovering]="hovered() !== null"
          role="group"
          [attr.aria-label]="'Diagrama del sistema: sus piezas por capas y cómo se conectan' | t"
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
            <g
              class="edge"
              [attr.data-kind]="edge.kind"
              [attr.data-edge]="edge.id"
              [class.edge-active]="edge.from === active() || edge.to === active()"
              [class.edge-lit]="edge.from === hovered() || edge.to === hovered()"
              aria-hidden="true"
            >
              <path class="edge-line" [attr.d]="edge.path" pathLength="1" marker-end="url(#system-arrow)" />
              <!-- Tráfico: unos trazos que recorren la conexión en su sentido. -->
              <path class="edge-flow" [attr.d]="edge.path" pathLength="1" />
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
              [class.piece-lit]="lit(scene, node.id)"
              [attr.data-piece]="node.id"
              tabindex="0"
              role="button"
              [attr.aria-label]="label(node)"
              (mouseenter)="hovered.set(node.id)"
              (mouseleave)="hovered.set(null)"
              (focus)="hovered.set(node.id)"
              (blur)="hovered.set(null)"
              (click)="picked.emit(node.id)"
              (keydown.enter)="picked.emit(node.id)"
              (keydown.space)="picked.emit(node.id); $event.preventDefault()"
            >
              <rect [attr.x]="node.x" [attr.y]="node.y" [attr.width]="node.w" [attr.height]="node.h" rx="8" />
              @for (logo of node.logos; track logo.title; let index = $index) {
                <!-- Logo de la tecnología, en el color de su marca y con su nombre en texto debajo. -->
                <rect class="tile" [attr.x]="node.x + 10 + index * 28" [attr.y]="node.y + 8" width="24" height="24" rx="4" />
                <svg class="logo" [attr.x]="node.x + 14 + index * 28" [attr.y]="node.y + 12" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" [attr.data-logo]="logo.title">
                  <path [attr.d]="logo.path" [attr.fill]="logo.color" />
                </svg>
              } @empty {
                <rect class="tile" [attr.x]="node.x + 10" [attr.y]="node.y + 8" width="24" height="24" rx="4" />
                <svg [attr.x]="node.x + 14" [attr.y]="node.y + 12" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path class="glyph" [attr.d]="glyphs[node.glyph]" />
                </svg>
              }
              <text class="piece-kind" [attr.x]="node.x + 14 + (node.logos.length || 1) * 28" [attr.y]="node.y + 24">{{ node.kind }}</text>
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
    /* El marco es un lienzo, como el del Estudio: rejilla de puntos sobre la superficie. */
    .canvas { background-color: var(--bg-surface-1); background-image: radial-gradient(var(--border-subtle) 1px, transparent 1px); background-size: 20px 20px; }
    .legend { display: inline-block; width: 18px; height: 0; border-top: 2px solid var(--border-control); }
    .legend-request { border-top-color: var(--accent-text); }
    .legend-async { border-top-style: dashed; }
    .legend-auth { border-top-style: dotted; border-top-color: var(--status-warn); }
    .tile { fill: var(--bg-surface-3); stroke: var(--border-subtle); stroke-width: 1; }
    .lane { fill: var(--bg-surface-2); fill-opacity: 0.35; stroke: var(--border-strong); stroke-width: 1; stroke-dasharray: 4 4; }
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

    .edge path { fill: none; }
    .edge-line { stroke: var(--border-control); stroke-width: 1.2; stroke-dasharray: 1; animation: edge-in var(--duration-layout) var(--ease-standard) backwards; }
    .edge[data-kind='async'] .edge-line { stroke-dasharray: 0.04 0.03; animation-name: edge-fade; }
    .edge[data-kind='auth'] .edge-line { stroke: var(--status-warn); stroke-dasharray: 0.012 0.03; animation-name: edge-fade; }
    .edge[data-kind='request'] .edge-line { stroke: var(--accent-text); }
    .edge-active .edge-line, .edge-lit .edge-line { stroke-width: 1.8; }
    /* Tráfico en el camino de la petición y hacia los datos: tres trazos cortos que avanzan. */
    .edge-flow { stroke: var(--text-1); stroke-width: 2.2; stroke-linecap: round; stroke-dasharray: 0.03 0.303; opacity: 0; }
    .edge[data-kind='request'] .edge-flow, .edge[data-kind='data'] .edge-flow { opacity: 0.85; animation: edge-flow 2.4s linear infinite; }
    .edge[data-kind='data'] .edge-flow { animation-duration: 3.2s; opacity: 0.55; }
    .edge-tag { fill: var(--bg-surface-1); stroke: var(--border-subtle); stroke-width: 1; }
    .edge-label { fill: var(--text-2); font: 500 12px var(--font-mono); }
    /* Al señalar una pieza se iluminan sus conexiones y sus vecinas; el resto se atenúa. */
    .is-hovering .edge:not(.edge-lit), .is-hovering .piece:not(.piece-lit) { opacity: 0.35; }
    .edge, .piece { transition: opacity var(--duration-base) var(--ease-standard); }

    @keyframes piece-in { from { opacity: 0; transform: translateY(8px) scale(0.96); } }
    /* La línea se dibuja de un extremo a otro (pathLength = 1). */
    @keyframes edge-in { from { stroke-dashoffset: 1; opacity: 0; } to { stroke-dashoffset: 0; opacity: 1; } }
    @keyframes edge-fade { from { opacity: 0; } }
    @keyframes edge-flow { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
    @media (prefers-reduced-motion: reduce) { .edge-flow { display: none; } }
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
  /** Pieza bajo el cursor o con el foco: se ilumina su camino. */
  readonly hovered = signal<SystemCategoryId | null>(null);
  private readonly horizontal = computed(() => buildSystemDiagram(this.design(), this.nodes(), this.provider(), false));

  /** A lo ancho si cabe en el hueco que hay; si no, las capas se apilan. Antes de medir, a lo ancho. */
  diagram(available: number) {
    return available > 0 && this.horizontal().width > available
      ? buildSystemDiagram(this.design(), this.nodes(), this.provider(), true, available)
      : this.horizontal();
  }

  /** ¿Es la pieza señalada o una de las que se conectan con ella? */
  lit(scene: SystemDiagram, id: SystemCategoryId): boolean {
    const focus = this.hovered();
    return focus === null || focus === id || scene.edges.some((edge) => (edge.from === focus && edge.to === id) || (edge.to === focus && edge.from === id));
  }

  label(node: DiagramNode): string {
    const where = node.deployedOn ? `Se despliega en ${node.deployedOn.name}` : node.note;
    return `${node.kind}: ${node.fullName}. ${where}. Ir a sus opciones`;
  }
}
