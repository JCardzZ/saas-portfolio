import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';

import { LanguageService } from '../../../core/i18n/language.service';
import { ContainerWidthDirective } from '../../../shared/ui/container-width.directive';
import { TECH_ICONS, TechIcon, TechIconKey } from '../../../shared/ui/tech-icons';
import { Topology, TopologyFlow, TopologyNode } from './delivery-data';
import { ComponentState } from './live-health.service';

/** Medidas del lienzo ancho, en unidades del viewBox (px a escala 1). */
const COL_W = 210;
const ROW_H = 118;
const NODE_W = 182;
const NODE_H = 74;
const MARGIN = 16;
/** Franja de la cabecera de cada zona, por encima de su primera fila. */
const ZONE_HEAD = 30;
const ZONE_PAD = 14;
/**
 * El texto más pequeño del lienzo mide 13 unidades: por debajo de este ancho se vería a menos de
 * 12 px y el diagrama pasa a tarjetas por zona (nunca se encoge ni se desplaza dentro del marco).
 */
const MIN_SCALE = 12 / 13;

/**
 * Símbolos propios para lo que no es una marca o cuya guía no permite mostrar el logo
 * (Cloudflare, Gemini). No imitan ningún logo.
 */
const GLYPHS: Record<string, string> = {
  visitor: 'M12 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 9c4 0 7 2 7 4.5V20H5v-2.5C5 15 8 13 12 13Z',
  package: 'M12 3 4 7v10l8 4 8-4V7l-8-4Zm0 2.2L17.6 8 12 10.8 6.4 8 12 5.2ZM6 9.6l5 2.5v6.3l-5-2.5V9.6Zm7 8.8v-6.3l5-2.5v6.3l-5 2.5Z',
  edge: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm6.9 8h-3.1a14 14 0 0 0-1.3-5.4A7 7 0 0 1 18.9 11ZM12 5c.9 1.2 1.6 3.4 1.8 6h-3.6c.2-2.6.9-4.8 1.8-6ZM9.5 5.6A14 14 0 0 0 8.2 11H5.1a7 7 0 0 1 4.4-5.4ZM5.1 13h3.1a14 14 0 0 0 1.3 5.4A7 7 0 0 1 5.1 13Zm6.9 6c-.9-1.2-1.6-3.4-1.8-6h3.6c-.2 2.6-.9 4.8-1.8 6Zm2.5-.6a14 14 0 0 0 1.3-5.4h3.1a7 7 0 0 1-4.4 5.4Z',
  workflow: 'M5 3h4v4H5V3Zm0 7h4v4H5v-4Zm10-7h4v4h-4V3Zm-8 4v3h1V7H7Zm10 0v6h-6v3h-2v4h4v-4h-1v-1h7V7h-2Zm-12 9h4v4H5v-4Zm1 1v2h2v-2H6Z',
  database: 'M12 3c4.4 0 8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3V6c0-1.7 3.6-3 8-3Zm6 5.3C16.6 9 14.4 9.5 12 9.5S7.4 9 6 8.3V12c0 .6 2.3 1.5 6 1.5s6-.9 6-1.5V8.3Zm0 6C16.6 15 14.4 15.5 12 15.5S7.4 15 6 14.3V18c0 .6 2.3 1.5 6 1.5s6-.9 6-1.5v-3.7ZM12 5C8.3 5 6 5.9 6 6.5S8.3 8 12 8s6-.9 6-1.5S15.7 5 12 5Z',
  ai: 'M9 3h6v2h2a2 2 0 0 1 2 2v2h2v6h-2v2a2 2 0 0 1-2 2h-2v2H9v-2H7a2 2 0 0 1-2-2v-2H3V9h2V7a2 2 0 0 1 2-2h2V3Zm-2 4v10h10V7H7Zm3 3h4v4h-4v-4Z',
};
const GLYPH_FOR_NODE: Record<string, string> = { visitor: 'visitor', ghcr: 'package', pages: 'edge', gemini: 'ai', actions: 'workflow', postgres: 'database' };

export interface CanvasNode {
  node: TopologyNode;
  x: number;
  y: number;
  label: string;
  role: string;
  /** Marca a mostrar, o el símbolo propio. */
  icon: TechIcon | null;
  glyph: string | null;
  live: ComponentState | null;
  /** Dato en vivo para la tercera línea, si lo hay. */
  fact: string | null;
}

export interface CanvasEdge {
  from: string;
  to: string;
  flow: TopologyFlow;
  planned: boolean;
  label: string;
  d: string;
  /** Tramo que recorre la comprobación de salud (navegador → API → base de datos y caché). */
  probe: boolean;
  /** Dónde va el rótulo (a mitad de camino); sin rótulo si el tramo es corto (lo dice la ficha). */
  lx: number;
  ly: number;
  showLabel: boolean;
  anchor: 'middle' | 'start';
}

/**
 * Lienzo de la arquitectura en producción, al estilo del Estudio: zonas (GitHub, Cloudflare,
 * Google Cloud, datos) con sus piezas, la petición de un visitante (con pulsos) y el camino del
 * código hasta producción. Solo dibuja lo que dice deploy/topology.json y el estado en vivo que le
 * pasan; no inventa nada. Por debajo de su ancho natural se convierte en tarjetas por zona.
 */
@Component({
  selector: 'app-production-canvas',
  imports: [ContainerWidthDirective],
  template: `
    <div appContainerWidth #box="containerWidth" class="min-w-0">
      @if (!box.narrowerThan(minWidth)) {
        <svg class="block h-auto w-full select-none" [attr.viewBox]="'0 0 ' + width + ' ' + height" role="group"
          [attr.aria-label]="en() ? 'Production architecture: zones, pieces and connections' : 'Arquitectura en producción: zonas, piezas y conexiones'"
          data-testid="production-canvas" [class.has-focus]="focusId() !== null">
          <defs>
            <marker id="pc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" fill="var(--text-3)" />
            </marker>
            <marker id="pc-arrow-req" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" fill="var(--accent-text)" />
            </marker>
          </defs>

          @for (zone of zones(); track zone.id) {
            <g class="zone" [attr.data-zone]="zone.id">
              <rect [attr.x]="zone.x" [attr.y]="zone.y" [attr.width]="zone.w" [attr.height]="zone.h" rx="14" fill="var(--bg-surface-1)" stroke="var(--border-strong)" stroke-dasharray="5 5" />
              @if (zone.icon; as icon) {
                <g [attr.transform]="'translate(' + (zone.x + 12) + ' ' + (zone.y + 8) + ') scale(0.75)'">
                  @if (icon.image) {
                    <image [attr.href]="icon.image" width="24" height="24" />
                  } @else {
                    <path [attr.d]="icon.path" [attr.fill]="markFill(icon)" />
                  }
                </g>
              }
              <text [attr.x]="zone.x + (zone.icon ? 36 : 14)" [attr.y]="zone.y + 21" font-size="13" font-weight="600" fill="var(--text-2)">{{ zone.label }}</text>
            </g>
          }

          @for (edge of edges(); track edge.from + edge.to) {
            <g class="edge" [class.lit]="isLit(edge)" [class.request]="edge.flow === 'request'" [class.planned]="edge.planned">
              <path class="wire" [attr.d]="edge.d" fill="none"
                [attr.marker-end]="edge.flow === 'request' ? 'url(#pc-arrow-req)' : 'url(#pc-arrow)'" />
              @if (edge.flow === 'request' && !edge.planned) {
                <path class="pulse" [attr.d]="edge.d" fill="none" />
              }
              @if (edge.probe && probing()) {
                <!-- Recorrido de la comprobación real que se acaba de hacer. -->
                <path class="probe" [attr.d]="edge.d" fill="none" />
              }
              @if (isLit(edge) && edge.showLabel) {
                <text class="edge-label" [attr.x]="edge.lx" [attr.y]="edge.ly" [attr.text-anchor]="edge.anchor" font-size="13">{{ edge.label }}</text>
              }
            </g>
          }

          @for (item of canvasNodes(); track item.node.id) {
            <g class="node" tabindex="0" role="button" [attr.data-node]="item.node.id"
              [attr.transform]="'translate(' + (item.x - nodeW / 2) + ' ' + (item.y - nodeH / 2) + ')'"
              [class.planned]="item.node.status === 'planned'" [class.active]="item.node.id === activeId()" [class.flash]="item.node.id === flashId()"
              [class.dim]="focusId() !== null && !isNear(item.node.id)"
              [attr.aria-label]="ariaOf(item)" [attr.aria-pressed]="item.node.id === activeId()"
              (click)="picked.emit(item.node.id)" (keydown.enter)="picked.emit(item.node.id)" (keydown.space)="$event.preventDefault(); picked.emit(item.node.id)"
              (mouseenter)="focusId.set(item.node.id)" (mouseleave)="focusId.set(null)" (focus)="focusId.set(item.node.id)" (blur)="focusId.set(null)">
              <rect class="card" [attr.width]="nodeW" [attr.height]="nodeH" rx="10" />
              <g transform="translate(12 16)">
                @if (item.icon; as icon) {
                  @if (icon.image) {
                    <image [attr.href]="icon.image" width="24" height="24" />
                  } @else {
                    <path [attr.d]="icon.path" [attr.fill]="markFill(icon)" />
                  }
                } @else if (item.glyph) {
                  <path [attr.d]="item.glyph" fill="var(--text-2)" />
                }
              </g>
              <text x="46" y="25" font-size="14" font-weight="600" fill="var(--text-1)">{{ item.label }}</text>
              <text x="46" y="43" font-size="13" fill="var(--text-2)">{{ item.role }}</text>
              @if (item.fact) {
                <!-- El dato en vivo de la pieza (último commit, CI, despliegue, latencia…). -->
                <text class="fact" x="46" y="61" font-size="13">{{ item.fact }}</text>
              }
              <circle class="dot" [attr.cx]="nodeW - 13" cy="13" r="4" [attr.data-state]="dotState(item)" />
            </g>
          }
        </svg>
      } @else {
        <!-- Estrecho: una tarjeta por zona, con sus piezas. Mismo contenido, sin cables. -->
        <div class="grid items-start gap-3 sm:grid-cols-2 [&>*]:min-w-0" data-testid="production-cards">
          @for (group of groups(); track group.id) {
            <section class="rounded-panel border border-dashed border-line-strong p-3" [attr.aria-label]="group.label">
              <p class="flex items-center gap-2 text-caption font-semibold text-ink-2">
                @if (group.icon; as icon) {
                  <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" aria-hidden="true">
                    @if (icon.image) { <image [attr.href]="icon.image" width="24" height="24" /> } @else { <path [attr.d]="icon.path" [attr.fill]="markFill(icon)" /> }
                  </svg>
                }
                {{ group.label }}
              </p>
              <ul class="mt-2 grid gap-2">
                @for (item of group.items; track item.node.id) {
                  <li>
                    <button type="button" class="node-row focus-ring" [class.planned]="item.node.status === 'planned'" [class.active]="item.node.id === activeId()"
                      [attr.data-node]="item.node.id" [attr.aria-label]="ariaOf(item)" [attr.aria-pressed]="item.node.id === activeId()" (click)="picked.emit(item.node.id)">
                      <svg viewBox="0 0 24 24" class="h-6 w-6 shrink-0" aria-hidden="true">
                        @if (item.icon; as icon) {
                          @if (icon.image) { <image [attr.href]="icon.image" width="24" height="24" /> } @else { <path [attr.d]="icon.path" [attr.fill]="markFill(icon)" /> }
                        } @else if (item.glyph) {
                          <path [attr.d]="item.glyph" fill="var(--text-2)" />
                        }
                      </svg>
                      <span class="min-w-0 flex-1 text-left">
                        <span class="block truncate text-body-sm font-semibold text-ink-1">{{ item.label }}</span>
                        <span class="block truncate text-caption text-ink-2">{{ item.role }}</span>
                        @if (item.fact) { <span class="block truncate font-mono text-caption text-accent-text">{{ item.fact }}</span> }
                      </span>
                      <span class="dot-html" [attr.data-state]="dotState(item)" aria-hidden="true"></span>
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .zone text { pointer-events: none; }
    .node { cursor: pointer; outline: none; transition: opacity 0.2s ease-out; }
    .node .card { fill: var(--bg-surface-2); stroke: var(--border-strong); stroke-width: 1; transition: stroke 0.2s ease-out; }
    .node.planned .card { stroke-dasharray: 5 4; fill: transparent; }
    .node.planned text, .node.planned image, .node.planned path { opacity: 0.6; }
    .node:hover .card, .node:focus-visible .card { stroke: var(--text-2); }
    .node.active .card { stroke: var(--accent-text); stroke-width: 1.5; }
    .node:focus-visible .card { stroke: var(--accent-text); stroke-width: 2; }
    .node.dim { opacity: 0.35; }
    .dot[data-state='ok'] { fill: var(--status-ok); }
    .dot[data-state='warn'] { fill: var(--status-warn); }
    .dot[data-state='down'] { fill: var(--status-danger); }
    .dot[data-state='planned'] { fill: transparent; stroke: var(--text-2); stroke-width: 1.2; }

    .edge .wire { stroke: var(--text-3); stroke-width: 1.2; stroke-dasharray: 4 4; transition: opacity 0.2s ease-out, stroke 0.2s ease-out; }
    .edge.request .wire { stroke: var(--accent-text); stroke-opacity: 0.55; stroke-width: 1.6; stroke-dasharray: none; }
    .edge.planned .wire { stroke-opacity: 0.4; stroke-dasharray: 3 5; }
    .edge.lit .wire { stroke-opacity: 1; stroke-width: 2; }
    .edge.lit:not(.request) .wire { stroke: var(--text-1); }
    svg.has-focus .edge:not(.lit) { opacity: 0.25; }
    .edge-label { fill: var(--text-1); paint-order: stroke; stroke: var(--bg-surface-1); stroke-width: 5px; stroke-linejoin: round; pointer-events: none; }
    /* Pulsos de la petición: viajan por el cable hacia su destino. */
    .pulse { stroke: var(--accent-text); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 2 220; animation: pc-pulse 2.6s linear infinite; }
    @keyframes pc-pulse { from { stroke-dashoffset: 222; } to { stroke-dashoffset: 0; } }
    .fact { fill: var(--accent-text); font-variant-numeric: tabular-nums; }
    /* La pieza que acaba de responder: su borde se enciende y la tarjeta late una vez. */
    .node.flash .card { animation: pc-flash 0.9s cubic-bezier(0.22, 1, 0.36, 1) 1; }
    .node.flash .fact { animation: pc-fact 0.9s ease-out 1; }
    @keyframes pc-flash {
      0% { stroke: var(--accent-text); stroke-width: 1; filter: drop-shadow(0 0 0 transparent); }
      30% { stroke: var(--accent-text); stroke-width: 2.5; filter: drop-shadow(0 0 10px var(--accent-text)); }
      100% { stroke: var(--border-strong); stroke-width: 1; filter: drop-shadow(0 0 0 transparent); }
    }
    @keyframes pc-fact { 0%, 40% { fill: var(--text-1); } 100% { fill: var(--accent-text); } }
    .node.planned .fact { fill: var(--text-3); }
    /* Una pasada brillante por el recorrido de la comprobación real. */
    .probe { stroke: var(--text-1); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 26 400; animation: pc-probe 1.6s ease-out 1 forwards; filter: drop-shadow(0 0 4px var(--accent-text)); }
    @keyframes pc-probe { from { stroke-dashoffset: 26; } to { stroke-dashoffset: -400; } }
    @media (prefers-reduced-motion: reduce) { .node.flash .card, .node.flash .fact { animation: none; } .pulse { display: none; } .probe { animation: none; stroke-dasharray: none; stroke-opacity: 0.6; filter: none; } .node, .edge .wire { transition: none; } }

    .node-row {
      display: flex; width: 100%; min-height: 3.25rem; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem;
      border-radius: var(--radius-control); border: 1px solid var(--border-strong); background: var(--bg-surface-2);
      transition: border-color 0.2s ease-out;
    }
    .node-row.planned { border-style: dashed; background: transparent; }
    .node-row.active { border-color: var(--accent-text); }
    .dot-html { width: 0.5rem; height: 0.5rem; border-radius: 9999px; flex: none; }
    .dot-html[data-state='ok'] { background: var(--status-ok); }
    .dot-html[data-state='warn'] { background: var(--status-warn); }
    .dot-html[data-state='down'] { background: var(--status-danger); }
    .dot-html[data-state='planned'] { box-shadow: inset 0 0 0 1px var(--text-2); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductionCanvasComponent {
  readonly topology = input.required<Topology>();
  /** Estado en vivo de cada pieza (id → estado), cuando la API lo ha dicho. */
  readonly live = input<ReadonlyMap<string, ComponentState>>(new Map());
  readonly activeId = input<string | null>(null);
  /** id → dato en vivo de la pieza (sale de pipeline-status.json y de /telemetry/health). */
  readonly facts = input<ReadonlyMap<string, string>>(new Map());
  /** Cambia cada vez que termina una comprobación de salud real: anima su recorrido. */
  readonly probe = input(0);
  /** Pieza que acaba de responder en la comprobación (su línea llega al inspector a la vez). */
  readonly flashId = input<string | null>(null);
  readonly picked = output<string>();
  readonly probing = signal(false);

  private readonly language = inject(LanguageService);
  readonly en = computed(() => this.language.lang() === 'en');
  /** Pieza señalada (cursor o foco): ilumina sus conexiones y atenúa el resto. */
  readonly focusId = signal<string | null>(null);

  readonly nodeW = NODE_W;
  readonly nodeH = NODE_H;

  private readonly cols = computed(() => Math.max(...this.topology().nodes.map((node) => node.col)) + 1);
  private readonly rows = computed(() => Math.max(...this.topology().nodes.map((node) => node.row)) + 1);
  get width(): number { return MARGIN * 2 + this.cols() * COL_W; }
  get height(): number { return MARGIN * 2 + ZONE_HEAD + this.rows() * ROW_H; }
  /** Ancho a partir del cual el lienzo se ve con su texto a 12 px o más. */
  get minWidth(): number { return Math.ceil(this.width * MIN_SCALE); }

  private center(node: TopologyNode): { x: number; y: number } {
    return { x: MARGIN + node.col * COL_W + COL_W / 2, y: MARGIN + ZONE_HEAD + node.row * ROW_H + ROW_H / 2 };
  }

  readonly canvasNodes = computed<CanvasNode[]>(() => this.topology().nodes.map((node) => {
    const { x, y } = this.center(node);
    const en = this.en();
    return {
      node, x, y,
      label: en ? node.en.label : node.label,
      role: en ? node.en.role : node.role,
      icon: node.icon ? TECH_ICONS[node.icon as TechIconKey] ?? null : null,
      glyph: node.icon ? null : GLYPHS[GLYPH_FOR_NODE[node.id] ?? 'package'],
      live: this.live().get(node.id) ?? null,
      fact: this.facts().get(node.id) ?? null,
    };
  }));

  readonly zones = computed(() => {
    const en = this.en();
    return this.topology().zones.flatMap((zone) => {
      const members = this.canvasNodes().filter((item) => item.node.zone === zone.id);
      if (members.length === 0) {
        return [];
      }
      const x0 = Math.min(...members.map((item) => item.x)) - NODE_W / 2 - ZONE_PAD;
      const x1 = Math.max(...members.map((item) => item.x)) + NODE_W / 2 + ZONE_PAD;
      const y0 = Math.min(...members.map((item) => item.y)) - NODE_H / 2 - ZONE_HEAD - 4;
      const y1 = Math.max(...members.map((item) => item.y)) + NODE_H / 2 + ZONE_PAD;
      const icon = zone.icon ? TECH_ICONS[zone.icon as TechIconKey] ?? null : null;
      return [{ id: zone.id, label: en ? zone.labelEn : zone.label, icon, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
    });
  });

  /** Mismas piezas, agrupadas por zona (la disposición estrecha). Lo que no va en ninguna, aparte. */
  readonly groups = computed(() => {
    const byZone = this.zones().map((zone) => ({ id: zone.id, label: zone.label, icon: zone.icon, items: this.canvasNodes().filter((item) => item.node.zone === zone.id) }));
    const loose = this.canvasNodes().filter((item) => item.node.zone === null);
    return loose.length ? [{ id: 'internet', label: 'Internet', icon: null, items: loose }, ...byZone] : byZone;
  });

  readonly edges = computed<CanvasEdge[]>(() => {
    const nodes = new Map(this.canvasNodes().map((item) => [item.node.id, item]));
    const en = this.en();
    return this.topology().links.map((link) => {
      const a = nodes.get(link.from)!;
      const b = nodes.get(link.to)!;
      const planned = a.node.status === 'planned' || b.node.status === 'planned';
      let d: string;
      if (a.node.col === b.node.col) {
        // Misma columna: de un borde (arriba o abajo) al otro, en recto.
        const down = b.y > a.y;
        const y1 = a.y + (down ? NODE_H / 2 : -NODE_H / 2);
        const y2 = b.y + (down ? -NODE_H / 2 : NODE_H / 2) + (down ? -2 : 2);
        d = `M${a.x} ${y1} L${b.x} ${y2}`;
      } else {
        const right = b.x > a.x;
        const x1 = a.x + (right ? NODE_W / 2 : -NODE_W / 2);
        const x2 = b.x + (right ? -NODE_W / 2 : NODE_W / 2) + (right ? -2 : 2);
        const bend = Math.max(30, Math.abs(x2 - x1) / 2);
        d = `M${x1} ${a.y} C${x1 + (right ? bend : -bend)} ${a.y} ${x2 - (right ? bend : -bend)} ${b.y} ${x2} ${b.y}`;
      }
      const vertical = a.node.col === b.node.col;
      // Rótulo junto a la línea: a su derecha si es vertical; encima, si es horizontal y hay sitio.
      const gap = vertical ? Math.abs(b.y - a.y) - NODE_H : Math.abs(b.x - a.x) - NODE_W;
      const showLabel = vertical ? gap >= 36 : gap >= 120 && a.node.row === b.node.row;
      const lx = vertical ? a.x + 8 : (a.x + b.x) / 2;
      // En vertical, justo debajo del origen: a media altura podría cruzarse con otra conexión.
      const ly = vertical ? Math.min(a.y, b.y) + NODE_H / 2 + 20 : a.y - 8;
      // La comprobación de salud entra por la pieza con salud «status» (la API) y consulta las que
      // tienen base de datos y caché: es el recorrido real de GET /telemetry/health.
      const probe = link.flow === 'request' && !planned && (
        (a.node.zone === null && b.node.health === 'status')
        || (a.node.health === 'status' && (b.node.health === 'database' || b.node.health === 'redisCache')));
      return { from: link.from, to: link.to, flow: link.flow, planned, probe, label: en ? link.labelEn : link.label, d, lx, ly, showLabel, anchor: vertical ? 'start' as const : 'middle' as const };
    });
  });

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      if (this.probe() > 0) {
        this.probing.set(true);
        clearTimeout(timer);
        timer = setTimeout(() => this.probing.set(false), 1800);
      }
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  isLit(edge: CanvasEdge): boolean {
    const id = this.focusId() ?? this.activeId();
    return id !== null && (edge.from === id || edge.to === id);
  }

  /** La pieza señalada y las que están al otro lado de sus conexiones. */
  isNear(id: string): boolean {
    const focus = this.focusId();
    return focus === null || focus === id || this.topology().links.some((link) =>
      (link.from === focus && link.to === id) || (link.to === focus && link.from === id));
  }

  dotState(item: CanvasNode): 'ok' | 'warn' | 'down' | 'planned' {
    if (item.node.status === 'planned') {
      return 'planned';
    }
    return item.live === 'down' ? 'down' : item.live === 'degraded' ? 'warn' : 'ok';
  }

  ariaOf(item: CanvasNode): string {
    const en = this.en();
    const state = item.node.status === 'planned'
      ? (en ? 'planned' : 'planificado')
      : item.live === 'down' || item.live === 'degraded'
        ? (en ? 'in production, failing' : 'en producción · con fallos')
        : item.live === 'ok' ? (en ? 'in production, healthy' : 'en producción · sano') : (en ? 'in production' : 'en producción');
    return `${item.label}, ${state}, ${item.role}`;
  }

  /** Las marcas de un solo color casi negro se pintan con el color del texto (su versión para fondo oscuro). */
  markFill(icon: TechIcon): string {
    const hex = icon.color.replace('#', '');
    if (hex.length !== 6) {
      return icon.color;
    }
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18 ? 'var(--text-1)' : icon.color;
  }
}
