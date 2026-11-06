import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { CANVAS_HEIGHT, CANVAS_WIDTH, NODE_HEIGHT, NODE_WIDTH } from '../cloud-topology.data';
import { FULL_VIEW, View, panView, zoomView } from '../studio-physics';
import { contentBounds } from '../zone-layout';
import { SystemDesign } from '../system/system-design';
import { labelPoint, nodeRect, roundedPath, routeAll } from '../wire-router';
import { APP_BOXES, APP_LAYERS, APP_PIECES, AppBoxKind, AppLayer, AppPiece, layerOf, pieceOf } from './app-catalog.data';
import {
  AppBox, AppGraph, AppNode, addBox, addNode, clampPoint, connect, cycleProtocol, graphFromDesign, isAsync, linkKey, moveBox, moveNode,
  removeBox, removeLink, removeNode, resizeBox, sanitizeGraph, updateNode,
} from './app-graph';
import { Protocol, connectionVerdict } from './app-protocols';
import { Finding, InfraTarget, applyFix, reviewGraph } from './app-advisor';
import { drawnJourney } from './app-journey';
import { autoArrange, settle } from './app-layout';
import { PIECE_LESSONS, PROTOCOL_LESSONS } from './app-learn.data';
import { AppAssistantComponent, levelName } from './app-assistant.component';
import { PieceLogo, attributionsFor, logoFor } from './app-brands';
import { TRADEMARK_NOTICE } from '../system/system-icons';
import { CloudProviderId } from '../cloud-topology.data';

const STORAGE_KEY = 'studio-app-canvas';
const PIECE_MIME = 'application/x-app-piece';
const HISTORY = 40;

/** Firma de las decisiones que dibujan el lienzo: si cambia, el lienzo de partida es otro. */
function designSignature(design: SystemDesign): string {
  const choices = design.choices as Record<string, string | undefined>;
  return Object.keys(choices).sort().map((key) => `${key}=${choices[key] ?? ''}`).join('&');
}
const WIRE_GAP = { from: 4, to: 10 };
/** Preferencia del orden automático del lienzo de aplicación, guardada en este navegador. */
/** Segmentos de la arquitectura y las capas que reúne cada uno, en el orden en que se leen. */
interface Segment { key: string; name: string; layers: AppLayer[] }
const SEGMENTS: Segment[] = [
  { key: 'frontend', name: 'Frontend', layers: ['client'] },
  { key: 'edge', name: 'Entrada', layers: ['edge'] },
  { key: 'backend', name: 'Backend', layers: ['service'] },
  { key: 'data', name: 'Datos', layers: ['data', 'messaging'] },
  { key: 'platform', name: 'Plataforma', layers: ['identity', 'observability', 'external'] },
];
interface Lane { key: string; name: string; color: string; x: number; y: number; w: number; h: number }
/** Margen de una banda alrededor de sus piezas, hueco entre bandas y sitio para su título. */
const LANE_PAD = 12;
const LANE_GAP = 20;
const LANE_HEADER = 50;

const APP_AUTO_TIDY_KEY = 'studio.app-auto-tidy';

/** Piezas y conexiones como texto ordenado: cambia solo si se añade o quita alguna. */
function structureOf(graph: AppGraph): string {
  return `${graph.nodes.map((node) => node.id).sort().join(',')}|${graph.links.map((link) => `${link.from}>${link.to}`).sort().join(',')}`;
}

function readAutoTidy(): boolean {
  try {
    return localStorage.getItem(APP_AUTO_TIDY_KEY) !== 'false';
  } catch {
    return true;
  }
}
const MIN_FRAME_RATIO = 0.6;

/** Vista de una pieza ya resuelta: su ficha del catálogo, su capa y su color. */
interface NodeView {
  node: AppNode;
  piece: AppPiece;
  color: string;
  layer: string;
  name: string;
  tech: string;
  /** Logo de su tecnología, si tiene. */
  logo: PieceLogo | null;
}

/**
 * Estudio de Aplicación (flag `studio.app-canvas`): el mismo tipo de lienzo que Infraestructura,
 * para dibujar cualquier arquitectura de software. Se arrastran piezas del catálogo, se conectan
 * arrastrando desde su borde y cada conexión lleva un protocolo que las reglas validan.
 */
@Component({
  selector: 'app-app-canvas',
  imports: [AppAssistantComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="appc" aria-labelledby="appc-title" data-testid="app-canvas">
      <header class="appc-toolbar">
        <div class="min-w-0 flex-1">
          <h5 id="appc-title" class="text-sm font-semibold text-ink-1">Lienzo de aplicación</h5>
          <p class="text-xs text-ink-3">Arrastra piezas del catálogo, conéctalas desde su borde y elige el protocolo de cada cable.</p>
        </div>
        <div class="appc-tools">
          <div class="relative">
            <button type="button" class="ui-btn-secondary" [attr.aria-expanded]="boxMenu()" aria-controls="appc-box-menu" (click)="boxMenu.set(!boxMenu())">Añadir caja ▾</button>
            @if (boxMenu()) {
              <ul id="appc-box-menu" class="appc-menu">
                @for (box of boxKinds; track box.kind) {
                  <li><button type="button" (click)="addBoxOf(box.kind)"><span class="block font-medium text-ink-1">{{ box.name }}</span><span class="block text-xs text-ink-3">{{ box.hint }}</span></button></li>
                }
              </ul>
            }
          </div>
          <button type="button" class="ui-btn-secondary" (click)="arrange()" data-testid="appc-arrange" title="Coloca las piezas por profundidad de la petición y ajusta las cajas">Ordenar</button>
          <!-- Orden automático: al añadir o quitar piezas o conexiones, el lienzo se ordena solo. -->
          <button type="button" class="ui-btn-ghost inline-flex items-center gap-2" [attr.aria-pressed]="autoTidy()" data-testid="appc-auto-tidy" (click)="toggleAutoTidy()"
            title="Se reordena solo al añadir o quitar piezas y conexiones">
            <span class="ui-switch-mini" [class.ui-switch-mini-on]="autoTidy()" aria-hidden="true"></span>Automático
          </button>
          <button type="button" class="ui-btn-ghost" [disabled]="!history().length" (click)="undo()" aria-label="Deshacer">Deshacer</button>
          <button type="button" class="ui-btn-ghost" (click)="fromDesign()" data-testid="appc-from-design">Desde las decisiones</button>
          <div class="appc-zoom" role="group" aria-label="Zoom del lienzo">
            <button type="button" aria-label="Alejar" [disabled]="zoom() <= 50" (click)="zoomBy(1 / 1.25)">−</button>
            <button type="button" aria-label="Ajustar al diagrama" (click)="autoFrame.set(true)">{{ zoom() }} %</button>
            <button type="button" aria-label="Acercar" [disabled]="zoom() >= 250" (click)="zoomBy(1.25)">+</button>
          </div>
        </div>
      </header>

      @if (stale()) {
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-status-warn/30 bg-status-warn/10 px-4 py-2.5 text-sm text-ink-2" role="status" data-testid="appc-stale">
          <span class="min-w-0 flex-[1_1_20rem]"><strong class="font-semibold text-ink-1">Las decisiones han cambiado</strong> (otra plantilla o tecnología) y tu dibujo ya no las refleja.</span>
          <button type="button" class="ui-btn-secondary" (click)="fromDesign()">Redibujar desde las decisiones</button>
          <button type="button" class="ui-btn-ghost" (click)="keepDrawing()">Mantener mi dibujo</button>
        </div>
      }
      <div class="appc-body">
        <aside class="appc-catalog" aria-label="Piezas">
          <label class="sr-only" for="appc-search">Buscar una pieza</label>
          <input id="appc-search" type="search" class="appc-search" placeholder="Buscar: postgres, cola, gateway…" [value]="query()" (input)="query.set($any($event.target).value)" />
          <div class="appc-catalog-scroll">
            @for (group of catalog(); track group.layer.id) {
              <p class="appc-layer" [style.--layer]="group.layer.color">{{ group.layer.name }}</p>
              <ul>
                @for (piece of group.pieces; track piece.type) {
                  <li>
                    <button type="button" class="appc-piece" draggable="true" [style.--layer]="group.layer.color" [attr.data-piece]="piece.type" [title]="piece.summary"
                      (dragstart)="onPieceDrag($event, piece)" (click)="add(piece.type)">
                      <span class="appc-chip" aria-hidden="true">
                        @if (logoOf(piece); as mark) {
                          @if (mark.image) {
                            <img [src]="mark.image" alt="" class="h-[1.125rem] w-[1.125rem]" />
                          } @else {
                            <svg viewBox="0 0 24 24" class="h-[1.125rem] w-[1.125rem]"><path [attr.d]="mark.path" [style.fill]="mark.color" style="stroke: none" /></svg>
                          }
                        } @else {
                          <svg viewBox="0 0 24 24"><path [attr.d]="piece.icon" /></svg>
                        }
                      </span>
                      <span class="min-w-0"><span class="block truncate text-sm font-medium text-ink-1">{{ piece.name }}</span><span class="block truncate text-xs text-ink-3">{{ piece.tech }}</span></span>
                    </button>
                  </li>
                }
              </ul>
            } @empty {
              <p class="px-2 text-xs text-ink-3">Ninguna pieza coincide.</p>
            }
          </div>
        </aside>

        <div class="appc-stage">
          <svg #svg class="appc-svg" [attr.viewBox]="viewBox()" role="group" aria-label="Arquitectura de la aplicación" tabindex="-1"
            (pointermove)="onPointerMove($event)" (pointerup)="onPointerUp($event)" (pointerleave)="onPointerUp($event)"
            (dragover)="onDragOver($event)" (drop)="onDrop($event)" (wheel)="onWheel($event)" (keydown)="onKeydown($event)" (pointerdown)="onBackground($event)">
            <defs>
              <marker id="appc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="appc-arrow" /></marker>
              <!-- Brillo suave en la mitad de arriba de cada pieza: profundidad sin filtros. -->
              <linearGradient id="appc-sheen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" class="studio-sheen-top" />
                <stop offset="1" class="studio-sheen-bottom" />
              </linearGradient>
              <marker id="appc-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="appc-arrow-on" /></marker>
            </defs>

            <!-- Segmentos de la arquitectura: una banda por capa (frontend, entrada, backend, datos,
                 plataforma), del ancho de sus piezas y con su título arriba. -->
            @for (lane of lanes(); track lane.key) {
              <g class="appc-lane" [style.--layer]="lane.color" [attr.data-lane]="lane.key" aria-hidden="true">
                <rect [attr.x]="lane.x" [attr.y]="lane.y" [attr.width]="lane.w" [attr.height]="lane.h" rx="16" />
                <circle [attr.cx]="lane.x + 16" [attr.cy]="lane.y + 18" r="3.5" />
                <text [attr.x]="lane.x + 26" [attr.y]="lane.y + 22" class="appc-lane-label">{{ lane.name }}</text>
              </g>
            }

            @for (box of graph().boxes; track box.id) {
              <g class="appc-box" [attr.data-kind]="box.kind" [class.appc-selected]="selected() === box.id" [attr.data-box]="box.id">
                <rect [attr.x]="box.x" [attr.y]="box.y" [attr.width]="box.w" [attr.height]="box.h" rx="14" />
                <rect class="appc-box-grip" [attr.x]="box.x" [attr.y]="box.y" [attr.width]="box.w" height="28" rx="14" (pointerdown)="startBox($event, box, 'move')" />
                <text [attr.x]="box.x + 14" [attr.y]="box.y + 19" class="appc-box-label">{{ box.label || boxName(box.kind) }}</text>
                <rect class="appc-box-corner" [attr.x]="box.x + box.w - 14" [attr.y]="box.y + box.h - 14" width="12" height="12" rx="3" (pointerdown)="startBox($event, box, 'resize')" />
              </g>
            }

            @for (wire of wires(); track wire.key) {
              <g class="appc-wire" [class.appc-wire-on]="wire.active || touches(wire.key)" [class.appc-wire-async]="wire.async" [attr.data-link]="wire.key">
                <path class="appc-wire-hit" [attr.d]="wire.path" (pointerdown)="select($event, wire.key)" />
                <path class="appc-wire-line" [attr.d]="wire.path" [attr.marker-end]="wire.active || touches(wire.key) ? 'url(#appc-arrow-on)' : 'url(#appc-arrow)'" />
                <g class="appc-wire-label" [attr.transform]="'translate(' + wire.label[0] + ' ' + wire.label[1] + ')'" (pointerdown)="select($event, wire.key)" (dblclick)="cycle(wire.key)">
                  <!-- Solo el texto, con un halo del color del fondo; el rectángulo, invisible, es la zona de clic. -->
                  <rect class="appc-wire-label-hit" [attr.x]="-wire.labelWidth / 2" y="-10" [attr.width]="wire.labelWidth" height="20" rx="10" />
                  <text text-anchor="middle" y="4">{{ wire.protocol }}</text>
                </g>
              </g>
            }

            @if (preview(); as line) {
              <path class="appc-preview" [class.appc-preview-no]="line.refused" [attr.d]="line.path" />
            }

            @for (item of views(); track item.node.id) {
              <g class="appc-node" tabindex="0" role="button"
                [class.appc-selected]="selected() === item.node.id"
                [class.appc-target-ok]="targets()?.get(item.node.id) === true"
                [class.appc-target-no]="targets()?.get(item.node.id) === false"
                [class.appc-hl]="highlight()?.has(item.node.id)"
                [class.appc-dim]="highlight() && !highlight()!.has(item.node.id)"
                [style.--layer]="item.color" [attr.data-node]="item.node.id" [attr.aria-label]="item.name + ', ' + item.tech"
                [attr.transform]="'translate(' + (item.node.x - w / 2) + ' ' + (item.node.y - h / 2) + ')'"
                (pointerdown)="startNode($event, item.node)" (focus)="selected.set(item.node.id)"
                (pointerenter)="hovered.set(item.node.id)" (pointerleave)="hovered.set(null)">
                <!-- El mismo lenguaje que el lienzo de Infraestructura: logo arriba, nombre y tecnología
                     centrados, y debajo del borde, dónde corre. La capa, en una línea fina de su color. -->
                <rect class="appc-node-shadow" y="2" [attr.width]="w" [attr.height]="h" rx="10" aria-hidden="true" />
                <!-- El cuerpo va en su propio grupo: es lo que se eleva al pasar el ratón (la posición de la
                     pieza está en el transform del grupo de fuera y no se toca). -->
                <g class="appc-node-body">
                <rect class="appc-node-card" [attr.width]="w" [attr.height]="h" rx="10" />
                <rect class="appc-node-sheen" [attr.width]="w" [attr.height]="h / 2" rx="10" fill="url(#appc-sheen)" aria-hidden="true" />
                <rect class="appc-node-bar" x="18" y="0" [attr.width]="w - 36" height="2" rx="1" />
                <g [attr.transform]="'translate(' + (w / 2 - 10) + ' 6)'">
                  @if (item.logo?.image; as image) {
                    <image [attr.href]="image" width="20" height="20" data-logo="image" />
                  } @else if (item.logo?.path; as path) {
                    <g transform="translate(1 1) scale(0.75)"><path [attr.d]="path" [attr.fill]="item.logo?.color" data-logo="path" /></g>
                  } @else {
                    <g transform="translate(1 1) scale(0.75)"><path class="appc-node-icon" [attr.d]="item.piece.icon" /></g>
                  }
                </g>
                <text [attr.x]="w / 2" y="41" text-anchor="middle" class="appc-node-name">{{ clip(item.name, 16) }}</text>
                <text [attr.x]="w / 2" y="56" text-anchor="middle" class="appc-node-tech">{{ clip(item.tech, 18) }}</text>
                @if (item.node.runsOn) {
                  @let runs = '▸ ' + clip(infraName(item.node.runsOn), 15);
                  <g class="appc-node-runs-chip" aria-hidden="true">
                    <title>{{ 'Corre en ' + infraName(item.node.runsOn) }}</title>
                    <rect [attr.x]="w / 2 - (runs.length * 6.8 + 16) / 2" [attr.y]="h - 9" [attr.width]="runs.length * 6.8 + 16" height="18" rx="9" />
                    <text [attr.x]="w / 2" [attr.y]="h + 4" text-anchor="middle" class="appc-node-runs">{{ runs }}</text>
                  </g>
                }
                @if (review().marks.get(item.node.id); as level) {
                  <circle class="appc-mark" [attr.data-level]="level" [attr.cx]="w - 10" cy="10" r="5"><title>{{ markTitle(level) }}</title></circle>
                }
                </g>
                <g class="appc-handle" (pointerdown)="startConnect($event, item.node)" [attr.transform]="'translate(' + w + ' ' + h / 2 + ')'">
                  <circle r="11" class="appc-handle-hit" />
                  <circle r="6" class="appc-handle-dot" />
                </g>
              </g>
            }
          </svg>

          @if (notice(); as message) {
            <div class="appc-notice" [class.appc-notice-ok]="message.ok" [attr.role]="message.ok ? 'status' : 'alert'" data-testid="appc-notice">
              <span><strong class="font-semibold text-ink-1">{{ message.title }}</strong> {{ message.reason }} <span class="text-ink-1">{{ message.suggestion }}</span></span>
              <button type="button" class="ui-btn-ghost" (click)="notice.set(null)">Entendido</button>
            </div>
          }
          @if (graph().nodes.length) {
            <!-- Cómo leer el lienzo, en una línea. -->
            <ul class="appc-legend" data-testid="appc-legend">
              <li><svg viewBox="0 0 28 6" aria-hidden="true"><path class="appc-legend-line" d="M1 3h26" /></svg>Llamada síncrona</li>
              <li><svg viewBox="0 0 28 6" aria-hidden="true"><path class="appc-legend-line appc-legend-async" d="M1 3h26" /></svg>Asíncrona (eventos y colas)</li>
              <li><span class="appc-legend-runs" aria-hidden="true">▸</span>Dónde corre, en Infraestructura</li>
              <li><span class="appc-legend-mark" aria-hidden="true"></span>Aviso del asistente</li>
            </ul>
          }
          @if (!graph().nodes.length) {
            <p class="appc-empty">Arrastra aquí una pieza del catálogo, o pulsa «Desde las decisiones».</p>
          }
        </div>

        <app-app-assistant class="appc-assistant-slot" [review]="review()" [journey]="journey()" [hasNodes]="graph().nodes.length > 0"
          [node]="selectedNode()" [link]="selectedLink()" [linkNames]="linkNames()" [alternatives]="alternatives()"
          (fixed)="fix($event)" (highlighted)="highlightIds.set($event)" />
      </div>

      <!-- Los logos identifican cada tecnología; el aviso va siempre con ellos. -->
      <p class="border-t border-line-subtle px-4 py-2 text-xs leading-snug text-ink-3" data-testid="appc-trademark">
        {{ trademarkNotice }}
        @for (line of attributions(); track line) { <span class="block">{{ line }}</span> }
      </p>
      @if (selectedNode(); as item) {
        <div class="appc-inspector" [style.--layer]="item.color" data-testid="appc-inspector">
          <span class="appc-chip" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="item.piece.icon" /></svg></span>
          <label>Nombre <input type="text" maxlength="40" [placeholder]="item.piece.name" [value]="item.node.name ?? ''" (change)="rename(item.node.id, $any($event.target).value)" /></label>
          <label>Tecnología <input type="text" maxlength="40" [placeholder]="item.piece.tech" [value]="item.node.tech ?? ''" (change)="retech(item.node.id, $any($event.target).value)" /></label>
          @if (targetsFor(item.node.type); as options) {
            @if (options.length) {
              <label>Corre en
                <select (change)="runOn(item.node.id, $any($event.target).value)" data-testid="appc-runs-on">
                  <option value="" [selected]="!item.node.runsOn">Sin desplegar</option>
                  @for (target of options; track target.id) {
                    <option [value]="target.id" [selected]="item.node.runsOn === target.id">{{ target.name }}</option>
                  }
                </select>
              </label>
            } @else if ((lessonOf(item.node.type)?.runsOn ?? []).length) {
              <span class="text-xs text-ink-3">Añade en Infraestructura dónde correr esta pieza.</span>
            }
          }
          <span class="flex-1"></span>
          <button type="button" class="ui-btn-ghost" (click)="deleteSelected()">Quitar</button>
        </div>
      } @else if (selectedLink(); as link) {
        <div class="appc-inspector" data-testid="appc-inspector">
          <span class="text-sm text-ink-1">{{ nameOf(link.from) }} → {{ nameOf(link.to) }}</span>
          <div class="ui-segmented" role="radiogroup" aria-label="Protocolo">
            @for (protocol of protocolsOf(link.from, link.to); track protocol) {
              <button type="button" role="radio" class="ui-segment" [attr.aria-checked]="link.protocol === protocol" (click)="setProtocol(link, protocol)">{{ protocol }}</button>
            }
          </div>
          <span class="flex-1"></span>
          <button type="button" class="ui-btn-ghost" (click)="deleteSelected()">Quitar conexión</button>
        </div>
      }
    </section>
  `,
  styles: [`
    .appc { container-type: inline-size; border-radius: var(--radius-panel); border: 1px solid var(--border-subtle); background: rgb(var(--c-surface-1) / 0.6); overflow: hidden; }
    .appc-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-subtle); }
    .appc-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
    .appc-menu { position: absolute; right: 0; top: calc(100% + 0.35rem); z-index: 20; width: 16rem; padding: 0.35rem; border-radius: var(--radius-panel); border: 1px solid var(--border-strong); background: var(--bg-surface-2); box-shadow: var(--shadow-floating); }
    .appc-menu button { display: block; width: 100%; padding: 0.45rem 0.6rem; border-radius: var(--radius-control); text-align: left; }
    .appc-menu button:hover { background: var(--bg-surface-3); }
    .appc-zoom { display: inline-flex; overflow: hidden; border-radius: var(--radius-control); border: 1px solid var(--border-subtle); }
    .appc-zoom button { min-width: 2.25rem; height: 2.25rem; padding: 0 0.5rem; font-size: 0.875rem; color: var(--text-2); font-variant-numeric: tabular-nums; }
    .appc-zoom button:hover:not(:disabled) { background: var(--bg-surface-3); color: var(--text-1); }
    .appc-zoom button:disabled { opacity: 0.35; }

    /* El lienzo manda: el asistente va al costado solo en pantallas muy anchas; si no, debajo. */
    .appc-body { display: grid; grid-template-columns: 14rem minmax(0, 1fr); min-height: 0; }
    .appc-assistant-slot { grid-column: 1 / -1; display: flex; min-height: 0; border-top: 1px solid var(--border-subtle); max-height: 30rem; }
    
    @container (min-width: 88rem) {
      .appc-body { grid-template-columns: 14rem minmax(0, 1fr) 20rem; }
      .appc-assistant-slot { grid-column: auto; border-top: 0; border-left: 1px solid var(--border-subtle); max-height: 44rem; }
      .appc-assistant-slot { --assistant-columns: minmax(0, 1fr); }
    }
    @media (max-width: 900px) { .appc-body { grid-template-columns: minmax(0, 1fr); } .appc-catalog { max-height: 14rem; border-right: 0; border-bottom: 1px solid var(--border-subtle); } }
    .appc-catalog { display: flex; flex-direction: column; min-height: 0; max-height: 44rem; border-right: 1px solid var(--border-subtle); }
    .appc-search { margin: 0.6rem; padding: 0.45rem 0.6rem; border-radius: var(--radius-control); border: 1px solid var(--border-strong); background: var(--bg-surface-2); color: var(--text-1); font-size: 0.8125rem; }
    .appc-search:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
    .appc-catalog-scroll { flex: 1; overflow-y: auto; padding: 0 0.4rem 0.6rem; }
    .appc-layer { display: flex; align-items: center; gap: 0.4rem; margin: 0.7rem 0.35rem 0.25rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-3); }
    .appc-layer::before { content: ''; width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: var(--layer); }
    .appc-piece { display: flex; align-items: center; gap: 0.6rem; width: 100%; padding: 0.35rem 0.4rem; border-radius: var(--radius-control); border: 1px solid transparent; text-align: left; cursor: grab; transition: background var(--duration-fast), border-color var(--duration-fast); }
    .appc-piece:hover { background: var(--bg-surface-2); border-color: var(--border-subtle); }
    .appc-piece:active { cursor: grabbing; }
    .appc-piece:focus-visible { outline: 2px solid var(--accent-text); outline-offset: -2px; }
    .appc-chip { display: grid; place-items: center; flex: none; width: 1.75rem; height: 1.75rem; border-radius: 0.5rem; background: color-mix(in srgb, var(--layer) 16%, transparent); color: var(--layer); }
    .appc-chip svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

    .appc-stage { position: relative; min-width: 0; }
    .appc-svg { display: block; width: 100%; max-height: calc(100dvh - 12rem); touch-action: none; user-select: none;
      background-image: radial-gradient(var(--border-subtle) 1px, transparent 1px); background-size: 24px 24px; }
    .appc-svg:focus { outline: none; }
    .appc-empty { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; font-size: 0.875rem; color: var(--text-3); }

    .appc-box rect:first-child { fill: rgb(var(--c-surface-2) / 0.35); stroke: var(--border-strong); stroke-dasharray: 6 5; }
    .appc-box[data-kind='public'] rect:first-child { stroke-dasharray: none; }
    .appc-box[data-kind='domain'] rect:first-child { fill: rgb(var(--c-accent-solid) / 0.03); stroke: rgb(var(--c-accent-solid) / 0.35); }
    .appc-box.appc-selected rect:first-child { stroke: var(--accent-text); stroke-dasharray: none; }
    .appc-box-grip { fill: transparent; cursor: move; }
    .appc-box-label { fill: var(--text-2); font-size: 12px; font-weight: 600; letter-spacing: 0.04em; pointer-events: none; }
    .appc-box-corner { fill: var(--bg-surface-3); stroke: var(--border-strong); cursor: nwse-resize; }

    .appc-wire-line { fill: none; stroke: var(--text-3); stroke-width: 1.25; }
    .appc-wire-async .appc-wire-line { stroke-dasharray: 6 4; }
    .appc-wire-hit { fill: none; stroke: transparent; stroke-width: 12; cursor: pointer; }
    .appc-wire-on .appc-wire-line { stroke: var(--accent-text); stroke-width: 1.75; }
    .appc-arrow { fill: var(--text-3); }
    .appc-arrow-on { fill: var(--accent-text); }
    .appc-wire-label { cursor: pointer; }
    .appc-wire-on .appc-wire-label text { fill: var(--accent-text); }
    .appc-preview { fill: none; stroke: var(--accent-text); stroke-width: 1.5; stroke-dasharray: 5 4; pointer-events: none; }
    .appc-preview-no { stroke: var(--status-danger); }

    .appc-node { cursor: grab; outline: none; }
    .appc-node-card { fill: var(--bg-surface-2); stroke: var(--border-subtle); transition: stroke var(--duration-fast); }
    .appc-node:hover .appc-node-card { stroke: var(--border-strong); }
    .appc-node.appc-selected .appc-node-card, .appc-node:focus-visible .appc-node-card { stroke: var(--layer); stroke-width: 1.5; }
    .appc-node-bar { fill: var(--layer); opacity: 0.9; }
    .appc-node-icon { fill: none; stroke: var(--layer); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
    .appc-node-name { fill: var(--text-1); font-size: 12px; font-weight: 600; }
    .appc-node-tech { fill: var(--text-2); font-size: 12px; }
    .appc-node text { pointer-events: none; }
    .appc-handle { cursor: crosshair; opacity: 0; transition: opacity var(--duration-fast); }
    .appc-node:hover .appc-handle, .appc-node.appc-selected .appc-handle, .appc-node:focus-visible .appc-handle { opacity: 1; }
    .appc-handle-hit { fill: transparent; }
    .appc-handle-dot { fill: var(--bg-surface-1); stroke: var(--layer); stroke-width: 2; }
    .appc-target-ok .appc-node-card { stroke: var(--status-ok); stroke-width: 1.75; }
    .appc-target-no { opacity: 0.35; }

    .appc-notice { position: absolute; left: 50%; bottom: 0.75rem; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; width: min(40rem, calc(100% - 1.5rem));
      transform: translateX(-50%); padding: 0.6rem 0.8rem; border-radius: var(--radius-panel); border: 1px solid rgb(var(--c-status-warn) / 0.35); background: var(--bg-surface-2); box-shadow: var(--shadow-floating); font-size: 0.8125rem; color: var(--text-2); }
    .appc-notice > span { flex: 1 1 18rem; }

    .appc-mark { stroke: var(--bg-surface-2); stroke-width: 2; }
    .appc-mark[data-level='risk'] { fill: var(--status-danger); }
    .appc-mark[data-level='warn'] { fill: var(--status-warn); }
    .appc-mark[data-level='tip'] { fill: var(--accent-text); }
    .appc-node-runs { fill: var(--accent-text); font-size: 12px; }
    .appc-hl .appc-node-card { stroke: var(--layer); stroke-width: 2; }
    .appc-dim { opacity: 0.3; }
    .appc-notice-ok { border-color: rgb(var(--c-status-ok) / 0.35); }

    .appc-inspector select { max-width: 13rem; padding: 0.3rem 0.5rem; border-radius: var(--radius-control); border: 1px solid var(--border-strong); background: var(--bg-surface-2); color: var(--text-1); font-size: 0.8125rem; }
    .appc-inspector { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; padding: 0.65rem 1rem; border-top: 1px solid var(--border-subtle); background: rgb(var(--c-surface-2) / 0.5); }
    .appc-inspector label { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--text-3); }
    .appc-inspector input { width: 11rem; padding: 0.3rem 0.5rem; border-radius: var(--radius-control); border: 1px solid var(--border-strong); background: var(--bg-surface-2); color: var(--text-1); font-size: 0.8125rem; }
    .appc-inspector input:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
    @media (prefers-reduced-motion: reduce) { .appc-piece, .appc-node-card, .appc-handle { transition: none; } }
  `],
})
export class AppCanvasComponent implements OnInit {
  readonly design = input.required<SystemDesign>();
  /** Piezas de la vista de Infraestructura en las que puede correr cada una de estas. */
  readonly infra = input<InfraTarget[]>([]);
  /** Nube activa: los iconos oficiales de una nube solo salen en un diseño de esa nube. */
  readonly provider = input<CloudProviderId>('aws');
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');

  readonly w = NODE_WIDTH;
  readonly h = NODE_HEIGHT;
  readonly full = FULL_VIEW;
  readonly boxKinds = APP_BOXES;

  readonly graph = signal<AppGraph>({ nodes: [], links: [], boxes: [] });
  readonly history = signal<AppGraph[]>([]);
  readonly selected = signal<string | null>(null);
  readonly notice = signal<{ title: string; reason: string; suggestion: string; ok?: boolean } | null>(null);
  readonly boxMenu = signal(false);
  readonly query = signal('');
  readonly camera = signal<View>(FULL_VIEW);
  /** La vista sigue al diagrama (con margen para soltar piezas) hasta que el visitante hace zoom. */
  readonly autoFrame = signal(true);
  /** Encuadre congelado mientras dura un gesto, para que el lienzo no se mueva bajo el cursor. */
  private readonly frozen = signal<View | null>(null);
  readonly frame = computed<View>(() => {
    const { nodes, boxes } = this.graph();
    if (!nodes.length && !boxes.length) {
      return FULL_VIEW;
    }
    const bounds = contentBounds(nodes, boxes, 640);
    const pad = 56;
    const x = Math.max(0, bounds.x - pad);
    const w = Math.min(CANVAS_WIDTH, bounds.x + bounds.w + pad) - x;
    // Proporción mínima: un diagrama muy apaisado no deja el lienzo bajito con un hueco debajo;
    // se centra en vertical, al mismo tamaño, con sitio para soltar piezas.
    const content = { y: Math.max(0, bounds.y - pad), h: Math.min(CANVAS_HEIGHT, bounds.y + bounds.h + pad) - Math.max(0, bounds.y - pad) };
    const h = Math.min(CANVAS_HEIGHT, Math.max(content.h, w * MIN_FRAME_RATIO));
    const y = Math.round(content.y - (h - content.h) / 2);
    return { x, y, w, h };
  });
  readonly shown = computed<View>(() => (this.autoFrame() ? this.frozen() ?? this.frame() : this.camera()));
  readonly zoom = computed(() => Math.round((this.frame().w / this.shown().w) * 100));
  readonly viewBox = computed(() => {
    const { x, y, w, h } = this.shown();
    return `${Math.round(x)} ${Math.round(y)} ${Math.round(w)} ${Math.round(h)}`;
  });

  /** Gesto en curso: mover una pieza, mover o agrandar una caja, o trazar una conexión. */
  private gesture:
    | { kind: 'node'; id: string; dx: number; dy: number; moved: boolean }
    | { kind: 'box'; id: string; mode: 'move' | 'resize'; start: { x: number; y: number }; before: AppGraph; moved: boolean }
    | { kind: 'connect'; from: string }
    | null = null;
  readonly connecting = signal<{ from: string; x: number; y: number; over: string | null } | null>(null);

  readonly catalog = computed(() => {
    const query = this.query().trim().toLowerCase();
    return APP_LAYERS.map((layer) => ({
      layer,
      pieces: APP_PIECES.filter((piece) => piece.layer === layer.id
        && (!query || `${piece.name} ${piece.tech} ${piece.summary} ${layer.name}`.toLowerCase().includes(query))),
    })).filter((group) => group.pieces.length);
  });

  readonly views = computed<NodeView[]>(() => this.graph().nodes.flatMap((node) => {
    const piece = pieceOf(node.type);
    if (!piece) {
      return [];
    }
    const layer = layerOf(piece.layer);
    const tech = node.tech?.trim() || piece.tech;
    return [{ node, piece, color: layer.color, layer: layer.name, name: node.name?.trim() || piece.name, tech, logo: logoFor(tech, this.provider()) }];
  }));

  /**
   * Segmentos de la arquitectura, de izquierda a derecha: una banda por grupo de capas con piezas, del
   * ancho de esas piezas. Si dos grupos se mezclan (una pieza movida a mano), la frontera queda en medio.
   */
  readonly lanes = computed<Lane[]>(() => {
    const views = this.views();
    if (views.length < 2) {
      return [];
    }
    const groups = new Map<string, { segment: Segment; min: number; max: number }>();
    for (const view of views) {
      const segment = SEGMENTS.find((candidate) => candidate.layers.includes(view.piece.layer))!;
      const group = groups.get(segment.key) ?? { segment, min: Infinity, max: -Infinity };
      group.min = Math.min(group.min, view.node.x - NODE_WIDTH / 2);
      group.max = Math.max(group.max, view.node.x + NODE_WIDTH / 2);
      groups.set(segment.key, group);
    }
    const ordered = [...groups.values()].sort((a, b) => a.min + a.max - (b.min + b.max));
    if (ordered.length < 2) {
      return [];
    }
    for (let i = 1; i < ordered.length; i++) {
      const [left, right] = [ordered[i - 1], ordered[i]];
      if (left.max + LANE_GAP > right.min) {
        const middle = (left.max + right.min) / 2;
        left.max = middle - LANE_GAP / 2;
        right.min = middle + LANE_GAP / 2;
      }
    }
    const { nodes, boxes } = this.graph();
    const top = Math.min(...nodes.map((node) => node.y - NODE_HEIGHT / 2), ...boxes.map((box) => box.y)) - LANE_HEADER;
    const bottom = Math.max(...nodes.map((node) => node.y + NODE_HEIGHT / 2 + 9), ...boxes.map((box) => box.y + box.h)) + 22;
    return ordered.map(({ segment, min, max }) => ({
      key: segment.key, name: segment.name, color: layerOf(segment.layers[0]).color,
      x: Math.round(min - LANE_PAD), y: Math.round(top), w: Math.round(max - min + LANE_PAD * 2), h: Math.round(bottom - top),
    }));
  });

  /** Mientras se traza una conexión: qué piezas la admiten (verde) y cuáles no (atenuadas). */
  readonly targets = computed(() => {
    const from = this.connecting()?.from;
    const source = from ? this.graph().nodes.find((node) => node.id === from) : null;
    if (!source) {
      return null;
    }
    return new Map(this.graph().nodes.filter((node) => node.id !== source.id).map((node) => [node.id, connectionVerdict(source.type, node.type).allowed]));
  });

  readonly wires = computed(() => {
    const { nodes, links } = this.graph();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    // Todos a la vez, para que no se crucen; con aire en los dos extremos: el cable no nace pegado a la
    // pieza y la punta no toca el borde. Los títulos de las cajas son obstáculos: un cable no pasa por
    // encima de «Red privada».
    const titles = [
      ...this.graph().boxes.map((box) => ({ x: box.x + 8, y: box.y + 4, w: (box.label || this.boxName(box.kind)).length * 7.6 + 16, h: 22 })),
      ...this.lanes().map((lane) => ({ x: lane.x + 8, y: lane.y + 6, w: lane.name.length * 8.4 + 30, h: 24 })),
    ];
    const routes = routeAll(links, byId, WIRE_GAP, this.frozen() !== null, titles);
    const selected = this.selected();
    // La pastilla del protocolo se pinta 4 px más alta que la caja de `labelBox`: ese margen alrededor de cada pieza.
    // La pastilla de «dónde corre» asoma 7 px bajo cada pieza: también se reserva.
    const taken = [...nodes.map((node) => ({ ...nodeRect(node, 4), h: nodeRect(node, 4).h + 8 })), ...this.graph().boxes.flatMap((box) => [
      { x: box.x, y: box.y, w: box.w, h: 30 },
      // Los otros tres bordes de la caja: una pastilla encima de la línea discontinua se lee mal.
      { x: box.x - 2, y: box.y, w: 4, h: box.h }, { x: box.x + box.w - 2, y: box.y, w: 4, h: box.h }, { x: box.x, y: box.y + box.h - 2, w: box.w, h: 4 },
    ])];
    // Cada cable como una línea fina: la pastilla de un cable no tapa a los demás.
    const lines = new Map([...routes].map(([key, points]) => [key, points.slice(1).map((point, i) => ({
      x: Math.min(point[0], points[i][0]) - 2, y: Math.min(point[1], points[i][1]) - 2,
      w: Math.abs(point[0] - points[i][0]) + 4, h: Math.abs(point[1] - points[i][1]) + 4,
    }))]));
    return links.flatMap((link) => {
      const points = routes.get(linkKey(link));
      if (!points) {
        return [];
      }
      const key = linkKey(link);
      const labelWidth = link.protocol.length * 7 + 12;
      const others = [...lines].filter(([other]) => other !== key).flatMap(([, rects]) => rects);
      const label = labelPoint(points, [...taken, ...others], labelWidth);
      // Lo que ocupa la pastilla pintada (de -10 a +10), con el mismo margen que las piezas.
      taken.push({ x: label[0] - labelWidth / 2 - 4, y: label[1] - 14, w: labelWidth + 8, h: 28 });
      return [{
        key, protocol: link.protocol, async: isAsync(link.protocol), path: roundedPath(points), label,
        labelWidth,
        active: selected === key || selected === link.from || selected === link.to,
      }];
    });
  });

  readonly preview = computed(() => {
    const line = this.connecting();
    const source = line ? this.graph().nodes.find((node) => node.id === line.from) : null;
    if (!line || !source) {
      return null;
    }
    const x0 = source.x + NODE_WIDTH / 2;
    const midX = (x0 + line.x) / 2;
    return {
      path: `M${x0} ${source.y} C${midX} ${source.y} ${midX} ${line.y} ${line.x} ${line.y}`,
      refused: line.over !== null && this.targets()?.get(line.over) === false,
    };
  });

  readonly review = computed(() => reviewGraph(this.graph(), this.infra()));
  readonly journey = computed(() => drawnJourney(this.graph()));
  /** Piezas resaltadas por un hallazgo o un salto bajo el cursor; las demás se atenúan. */
  readonly highlightIds = signal<string[] | null>(null);
  readonly highlight = computed(() => {
    const ids = this.highlightIds();
    return ids ? new Set(ids) : null;
  });
  /** Para el asistente: los nombres del cable elegido y los protocolos que admite. */
  readonly linkNames = computed(() => {
    const link = this.selectedLink();
    return link ? `${this.nameOf(link.from)} → ${this.nameOf(link.to)}` : '';
  });
  readonly alternatives = computed(() => {
    const link = this.selectedLink();
    return link ? this.protocolsOf(link.from, link.to) : [];
  });
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  readonly trademarkNotice = TRADEMARK_NOTICE;
  /** Las frases que piden las marcas cuyo logo está ahora en pantalla (lienzo o catálogo). */
  readonly attributions = computed(() => attributionsFor([
    ...this.views().map((item) => item.logo),
    ...this.catalog().flatMap((group) => group.pieces.map((piece) => this.logoOf(piece))),
  ]));

  logoOf(piece: AppPiece): PieceLogo | null {
    return logoFor(piece.tech, this.provider());
  }

  readonly selectedNode = computed(() => this.views().find((item) => item.node.id === this.selected()) ?? null);
  readonly selectedLink = computed(() => this.graph().links.find((link) => linkKey(link) === this.selected()) ?? null);

  /** Hasta cargar lo guardado no se guarda nada: si no, el lienzo vacío lo pisaría. */
  private readonly ready = signal(false);
  /** Decisiones de las que salió el lienzo (su firma) y si el visitante lo ha tocado desde entonces. */
  private readonly source = signal<string | null>(null);
  readonly edited = signal(false);
  /** Las decisiones (o la plantilla) cambiaron y el dibujo editado ya no las refleja. */
  readonly stale = computed(() => this.ready() && this.edited() && this.source() !== designSignature(this.design()));

  ngOnInit(): void {
    const saved = this.restore();
    const signature = designSignature(this.design());
    // Lo guardado vale si salió de estas mismas decisiones o si el visitante lo editó (no se pisa su trabajo).
    if (saved && (saved.source === signature || saved.edited)) {
      this.graph.set(saved.graph);
      this.source.set(saved.source);
      this.edited.set(saved.edited);
    } else {
      this.regenerate(false);
    }
    this.ready.set(true);
  }

  constructor() {
    effect(() => {
      const record = { graph: this.graph(), source: this.source(), edited: this.edited() };
      if (!this.ready()) {
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
      } catch {
        // Sin almacenamiento (modo privado): el lienzo funciona igual, solo no se recuerda.
      }
    });
    // Cambian las decisiones (otra plantilla, otra base de datos…): si el lienzo no se ha tocado,
    // se redibuja solo; si se ha editado, se avisa y el visitante decide.
    effect(() => {
      const signature = designSignature(this.design());
      if (untracked(this.ready) && !untracked(this.edited) && signature !== untracked(this.source)) {
        untracked(() => this.regenerate(true));
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.gesture = null;
      clearTimeout(this.noticeTimer);
    });
  }

  /** Lo guardado: el lienzo, de qué decisiones salió y si se editó. Lo de versiones anteriores (solo el lienzo) cuenta como editado. */
  private restore(): { graph: AppGraph; source: string | null; edited: boolean } | null {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { graph?: unknown; source?: unknown; edited?: unknown } | null;
      if (!saved) {
        return null;
      }
      const legacy = !('graph' in saved);
      const graph = sanitizeGraph(legacy ? saved : saved.graph);
      return graph ? { graph, source: !legacy && typeof saved.source === 'string' ? saved.source : null, edited: legacy || saved.edited === true } : null;
    } catch {
      return null;
    }
  }

  /** Redibuja el lienzo desde las decisiones y lo ordena por capas. */
  private regenerate(record: boolean): void {
    if (record) {
      this.history.update((past) => [...past.slice(-HISTORY + 1), this.graph()]);
    }
    // Cada pieza, unida a la primera de Infraestructura donde puede correr: es el mismo proyecto.
    const drawn = graphFromDesign(this.design());
    const placed = {
      ...drawn,
      nodes: drawn.nodes.map((node) => {
        const target = this.targetsFor(node.type)[0];
        return target ? { ...node, runsOn: target.id } : node;
      }),
    };
    this.graph.set(autoArrange(placed));
    this.source.set(designSignature(this.design()));
    this.edited.set(false);
    this.selected.set(null);
    this.autoFrame.set(true);
  }

  /** Mantener el dibujo editado aunque las decisiones hayan cambiado. */
  keepDrawing(): void {
    this.source.set(designSignature(this.design()));
  }

  // ---------- Edición ----------
  /** Cada cambio deja el lienzo sin choques; `anchor` es lo que el visitante acaba de tocar. */
  private commit(next: AppGraph, anchor?: string): void {
    const before = this.graph();
    this.history.update((past) => [...past.slice(-HISTORY + 1), before]);
    const settled = settle(next, anchor);
    // Con el orden automático, un cambio de piezas o conexiones deja el lienzo ordenado en el mismo
    // paso (un solo «Deshacer» lo revierte todo).
    const restructured = this.autoTidy() && structureOf(settled) !== structureOf(before);
    this.graph.set(restructured ? autoArrange(settled) : settled);
    if (restructured) {
      this.autoFrame.set(true);
    }
    this.edited.set(true);
  }

  /** Pieza bajo el cursor: sus cables se resaltan mientras tanto. */
  readonly hovered = signal<string | null>(null);

  /** ¿Sale o llega este cable a la pieza bajo el cursor? */
  touches(key: string): boolean {
    const id = this.hovered();
    return !!id && (key.startsWith(`${id}>`) || key.endsWith(`>${id}`));
  }

  /** Orden automático: el lienzo se ordena solo al añadir o quitar piezas o conexiones. */
  readonly autoTidy = signal(readAutoTidy());

  toggleAutoTidy(): void {
    const on = !this.autoTidy();
    this.autoTidy.set(on);
    try {
      localStorage.setItem(APP_AUTO_TIDY_KEY, String(on));
    } catch {
      // Sin almacenamiento: la preferencia dura lo que la página.
    }
    if (on && this.graph().nodes.length) {
      this.arrange();
    }
  }

  arrange(): void {
    this.commit(autoArrange(this.graph()));
    this.autoFrame.set(true);
  }

  fix(finding: Finding): void {
    this.history.update((past) => [...past.slice(-HISTORY + 1), this.graph()]);
    this.graph.set(applyFix(this.graph(), finding));
    this.edited.set(true);
    this.highlightIds.set(null);
    this.flash({ title: 'Hecho.', reason: finding.fix!.label + '.', suggestion: 'Puedes deshacerlo si no te convence.', ok: true });
  }

  runOn(id: string, target: string): void {
    this.commit(updateNode(this.graph(), id, { runsOn: target || undefined }));
  }

  /** Piezas de Infraestructura donde puede correr, de la más indicada a la menos (orden de la lección). */
  targetsFor(type: string): InfraTarget[] {
    const kinds = PIECE_LESSONS[type]?.runsOn ?? [];
    return this.infra().filter((target) => kinds.includes(target.type)).sort((a, b) => kinds.indexOf(a.type) - kinds.indexOf(b.type));
  }

  lessonOf(type: string) {
    return PIECE_LESSONS[type];
  }

  infraName(id: string): string {
    return this.infra().find((target) => target.id === id)?.name ?? id;
  }

  markTitle(level: string): string {
    return `${levelName(level)}: mira la revisión del asistente`;
  }

  /** Aviso que se va solo (las explicaciones de lo que sí aplica). */
  private flash(message: { title: string; reason: string; suggestion: string; ok?: boolean }): void {
    clearTimeout(this.noticeTimer);
    this.notice.set(message);
    this.noticeTimer = setTimeout(() => this.notice.set(null), 5000);
  }

  undo(): void {
    const past = this.history();
    if (!past.length) {
      return;
    }
    this.graph.set(past[past.length - 1]);
    this.history.set(past.slice(0, -1));
    this.selected.set(null);
  }

  fromDesign(): void {
    this.regenerate(true);
  }

  add(type: string, at?: { x: number; y: number }): void {
    const { graph, id } = addNode(this.graph(), type, at ?? this.freeSpot());
    this.commit(graph);
    this.selected.set(id);
    this.notice.set(null);
  }

  /** Sin punto de soltado: el centro de lo que se ve. */
  private freeSpot(): { x: number; y: number } {
    const { x, y, w, h } = this.shown();
    return clampPoint({ x: x + w / 2, y: y + h / 2 });
  }

  addBoxOf(kind: AppBoxKind): void {
    this.boxMenu.set(false);
    const next = addBox(this.graph(), kind);
    this.commit(next);
    this.selected.set(next.boxes[next.boxes.length - 1].id);
  }

  rename(id: string, name: string): void {
    this.commit(updateNode(this.graph(), id, { name: name.trim() || undefined }));
  }

  retech(id: string, tech: string): void {
    this.commit(updateNode(this.graph(), id, { tech: tech.trim() || undefined }));
  }

  cycle(key: string): void {
    this.commit(cycleProtocol(this.graph(), key));
  }

  setProtocol(link: { from: string; to: string }, protocol: Protocol): void {
    this.commit({ ...this.graph(), links: this.graph().links.map((item) => (linkKey(item) === linkKey(link) ? { ...item, protocol } : item)) });
  }

  protocolsOf(from: string, to: string): Protocol[] {
    const source = this.graph().nodes.find((node) => node.id === from);
    const target = this.graph().nodes.find((node) => node.id === to);
    const verdict = source && target ? connectionVerdict(source.type, target.type) : null;
    return verdict?.allowed ? verdict.protocols : [];
  }

  nameOf(id: string): string {
    return this.views().find((item) => item.node.id === id)?.name ?? id;
  }

  boxName(kind: AppBoxKind): string {
    return APP_BOXES.find((box) => box.kind === kind)?.name ?? kind;
  }

  clip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  deleteSelected(): void {
    const id = this.selected();
    if (!id) {
      return;
    }
    const graph = this.graph();
    if (graph.nodes.some((node) => node.id === id)) {
      this.commit(removeNode(graph, id));
    } else if (graph.links.some((link) => linkKey(link) === id)) {
      this.commit(removeLink(graph, id));
    } else if (graph.boxes.some((box) => box.id === id)) {
      this.commit(removeBox(graph, id));
    }
    this.selected.set(null);
  }

  // ---------- Puntero ----------
  private toCanvas(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const svg = this.svg()?.nativeElement;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) {
      return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
    }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  select(event: Event, id: string): void {
    event.stopPropagation();
    this.selected.set(id);
  }

  onBackground(event: PointerEvent): void {
    if (event.target === this.svg()?.nativeElement) {
      this.selected.set(null);
      this.boxMenu.set(false);
    }
  }

  startNode(event: PointerEvent, node: AppNode): void {
    event.stopPropagation();
    const point = this.toCanvas(event);
    this.selected.set(node.id);
    this.gesture = { kind: 'node', id: node.id, dx: node.x - point.x, dy: node.y - point.y, moved: false };
    this.frozen.set(this.frame());
    this.history.update((past) => [...past.slice(-HISTORY + 1), this.graph()]);
  }

  startBox(event: PointerEvent, box: AppBox, mode: 'move' | 'resize'): void {
    event.stopPropagation();
    this.selected.set(box.id);
    this.gesture = { kind: 'box', id: box.id, mode, start: this.toCanvas(event), before: this.graph(), moved: false };
    this.frozen.set(this.frame());
    this.history.update((past) => [...past.slice(-HISTORY + 1), this.graph()]);
  }

  startConnect(event: PointerEvent, node: AppNode): void {
    event.stopPropagation();
    const point = this.toCanvas(event);
    this.gesture = { kind: 'connect', from: node.id };
    this.frozen.set(this.frame());
    this.connecting.set({ from: node.id, x: point.x, y: point.y, over: null });
    this.notice.set(null);
  }

  onPointerMove(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture) {
      return;
    }
    const point = this.toCanvas(event);
    if (gesture.kind === 'node') {
      gesture.moved = true;
      this.graph.set(moveNode(this.graph(), gesture.id, { x: point.x + gesture.dx, y: point.y + gesture.dy }));
    } else if (gesture.kind === 'box') {
      gesture.moved = true;
      const dx = point.x - gesture.start.x;
      const dy = point.y - gesture.start.y;
      const box = gesture.before.boxes.find((candidate) => candidate.id === gesture.id)!;
      this.graph.set(gesture.mode === 'move' ? moveBox(this.graph(), gesture.id, dx, dy, gesture.before) : resizeBox(this.graph(), gesture.id, box.w + dx, box.h + dy));
    } else {
      this.connecting.set({ from: gesture.from, x: point.x, y: point.y, over: this.nodeAt(point)?.id ?? null });
    }
  }

  onPointerUp(event: PointerEvent): void {
    const gesture = this.gesture;
    this.gesture = null;
    this.frozen.set(null);
    if (!gesture) {
      return;
    }
    if (gesture.kind === 'node') {
      if (!gesture.moved) {
        this.history.update((past) => past.slice(0, -1));
        return;
      }
      // Sin montarse ni salirse de su caja: las demás se apartan, la caja crece.
      this.graph.set(settle(this.graph(), gesture.id));
      this.edited.set(true);
    } else if (gesture.kind === 'box') {
      if (!gesture.moved) {
        this.history.update((past) => past.slice(0, -1));
      } else {
        this.graph.set(settle(this.graph(), gesture.id));
        this.edited.set(true);
      }
    } else {
      const target = event.type === 'pointerup' ? this.nodeAt(this.toCanvas(event)) : null;
      this.connecting.set(null);
      if (target && target.id !== gesture.from) {
        this.tryConnect(gesture.from, target.id);
      }
    }
  }

  private tryConnect(from: string, to: string): void {
    const result = connect(this.graph(), from, to);
    if (result.ok) {
      this.commit(result.graph);
      this.selected.set(linkKey(result.link));
      const lesson = PROTOCOL_LESSONS[result.link.protocol];
      const others = this.protocolsOf(from, to).filter((protocol) => protocol !== result.link.protocol);
      this.flash({
        title: `Aplica: ${result.link.protocol}.`, reason: `${lesson.what} ${lesson.when}`,
        suggestion: others.length ? `También vale ${others.join(', ')}: cámbialo en el inspector.` : '', ok: true,
      });
    } else {
      this.notice.set({ title: 'Conexión no creada.', reason: result.reason, suggestion: result.suggestion });
    }
  }

  private nodeAt(point: { x: number; y: number }): AppNode | null {
    return this.graph().nodes.find((node) => Math.abs(node.x - point.x) <= NODE_WIDTH / 2 && Math.abs(node.y - point.y) <= NODE_HEIGHT / 2) ?? null;
  }

  // ---------- Arrastrar del catálogo ----------
  onPieceDrag(event: DragEvent, piece: AppPiece): void {
    event.dataTransfer?.setData(PIECE_MIME, piece.type);
    event.dataTransfer?.setData('text/plain', piece.name);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes(PIECE_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDrop(event: DragEvent): void {
    const type = event.dataTransfer?.getData(PIECE_MIME);
    if (type && pieceOf(type)) {
      event.preventDefault();
      this.add(type, this.toCanvas(event));
    }
  }

  // ---------- Zoom y teclado ----------
  zoomBy(factor: number): void {
    const { x, y, w, h } = this.shown();
    this.setCamera(zoomView(this.shown(), factor, { x: x + w / 2, y: y + h / 2 }, this.frame().w));
  }

  private setCamera(view: View): void {
    this.camera.set(view);
    this.autoFrame.set(false);
  }

  onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.setCamera(zoomView(this.shown(), Math.exp(-event.deltaY * 0.0025), this.toCanvas(event), this.frame().w));
    } else if (this.zoom() > 100) {
      event.preventDefault();
      const scale = this.shown().w / Math.max(1, this.svg()?.nativeElement.clientWidth ?? CANVAS_WIDTH);
      this.setCamera(panView(this.shown(), event.deltaX * scale, event.deltaY * scale));
    }
  }

  onKeydown(event: KeyboardEvent): void {
    const id = this.selected();
    if ((event.key === 'Delete' || event.key === 'Backspace') && id && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      this.deleteSelected();
      return;
    }
    if (event.key === 'Escape') {
      this.gesture = null;
      this.connecting.set(null);
      this.selected.set(null);
      return;
    }
    const step: Record<string, [number, number]> = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
    const node = id ? this.graph().nodes.find((candidate) => candidate.id === id) : null;
    if (node && step[event.key]) {
      event.preventDefault();
      const [dx, dy] = step[event.key];
      this.commit(moveNode(this.graph(), node.id, { x: node.x + dx, y: node.y + dy }));
    }
  }
}
