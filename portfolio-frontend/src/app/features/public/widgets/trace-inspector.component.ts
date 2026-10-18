import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { capturePointer } from '../../../shared/ui/pointer-capture';

import { runtimeConfig } from '../../../core/config/runtime-config';
import { DemoNoticeComponent, DemoNoticeHost } from '../../../shared/ui/demo-notice.component';
import { ghostOf, playGenie } from '../../../shared/ui/genie';
import { TechIconComponent } from '../../../shared/ui/tech-icon.component';
import { TECH_ICONS } from '../../../shared/ui/tech-icons';
import { SystemEventKind } from '../data/system-events.service';
import { TelemetryStreamService } from '../data/telemetry-stream.service';
import { JsonTokenType, tokenizeJson } from '../data/graph-diff';
import { InspectorLayout, InspectorMode, TraceInspectorService } from '../data/trace-inspector.service';

/** Tonos de la sintaxis JSON en el filtro «Grafo»: solo neutros; el color queda para lo añadido y lo quitado. */
const TOKEN_CLASSES: Record<JsonTokenType, string> = {
  key: 'text-ink-1', string: 'text-ink-2', number: 'text-ink-1', literal: 'text-ink-2', punct: 'text-ink-3',
};

/** El color solo dice el nivel: correcto en verde, aviso en ámbar; lo demás, neutro. */
const KIND_CLASSES: Record<SystemEventKind, string> = {
  ok: 'text-status-ok',
  cache: 'text-ink-1',
  vector: 'text-ink-1',
  ai: 'text-ink-1',
  auth: 'text-ink-1',
  info: 'text-ink-1',
  warn: 'text-status-warn',
};

/** Tamaño de cada disposición. Las acopladas se publican como variables CSS para que la página se encoja. */
/** Altura por defecto del panel acoplado abajo y límites entre los que se puede redimensionar. */
export const BOTTOM_HEIGHT_PX = 280;
export const BOTTOM_MIN_PX = 120;
export const BOTTOM_MAX_RATIO = 0.8;
const HEIGHT_STORAGE_KEY = 'trace-inspector-height';
const RESIZE_KEY_STEP = 24;
const BOTTOM_HEIGHT_TALL = '50dvh';
const RIGHT_WIDTH = '22rem';
// dvh y no vh: la altura visible de verdad, con la barra del navegador móvil desplegada o no.
const SHEET_HEIGHT = '38dvh';
const SHEET_HEIGHT_TALL = '70dvh';
const FLOATING_WIDTH = 384;
const FLOATING_HEIGHT = 300;
const EDGE = 8;
/** Alto que ocupa una píldora en la esquina, con su margen. */
const PILL_SPACE = '3.5rem';
/** Alto de la barra recogida (36 px) más el borde y la zona segura inferior. */
const DEMO_BAR_SPACE = 'calc(2.25rem + 1px + env(safe-area-inset-bottom, 0px))';
const KEYBOARD_STEP = 24;

const LAYOUT_CLASSES: Record<Exclude<InspectorLayout, 'pill'>, string> = {
  // Acoplado a un borde llega hasta él: el contenido se aparta de la muesca y de la barra de gestos.
  bottom: 'inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
  right: 'inset-y-0 right-0 overflow-hidden border-l pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]',
  floating: 'overflow-hidden rounded-panel border shadow-floating',
  sheet: 'inset-x-0 bottom-0 overflow-hidden rounded-t-panel border-t shadow-floating pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
};

const MODE_BUTTONS: { mode: InspectorMode; label: string; path: string }[] = [
  { mode: 'bottom', label: 'Acoplar abajo', path: 'M2.5 3.5h11v9h-11z M2.5 9.5h11' },
  { mode: 'right', label: 'Acoplar a la derecha', path: 'M2.5 3.5h11v9h-11z M9.5 3.5v9' },
  { mode: 'floating', label: 'Flotante, se puede arrastrar', path: 'M2.5 2.5h8v7h-8z M5.5 9.5v4h8v-7h-3' },
];

/**
 * Inspector de traza: consola con los eventos de la tecnología seleccionada en un diagrama.
 * Se puede acoplar abajo o a la derecha (la página le deja sitio, así no tapa el diagrama),
 * dejar flotando y arrastrarlo, o recoger en una píldora. La cabecera es la de una ventana de
 * macOS y su semáforo funciona: rojo cierra, amarillo minimiza y verde maximiza. En pantallas pequeñas es una hoja
 * inferior sin fondo modal: el lienzo sigue siendo interactivo. No abre conexiones propias:
 * lee el mismo flujo que la consola general.
 */
@Component({
    selector: 'app-trace-inspector',
    imports: [TechIconComponent, DemoNoticeComponent],
    template: `
    @if (icon(); as icon) {
      @if (layout() === 'pill') {
        <div data-pill style="bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); right: calc(1rem + env(safe-area-inset-right, 0px))" class="fixed z-[46] flex max-w-[calc(100vw-2rem)] animate-scale-up items-center rounded-full border border-line-strong bg-surface-2/95 shadow-floating backdrop-blur-xl">
          <button
            type="button"
            class="ui-focus flex min-w-0 items-center gap-2 rounded-control py-1.5 pl-3 pr-2 font-mono text-mono-sm text-ink-1 transition-colors duration-fast hover:bg-surface-3"
            [attr.aria-label]="'Desplegar el inspector de traza de ' + title() + ', ' + countLabel()"
            (click)="restoreWindow()"
          >
            <app-tech-icon [icon]="icon" [size]="14" />
            Inspector de traza · {{ title() }}
            <span class="tabular-nums text-ink-2">({{ countLabel() }})</span>
          </button>
          @if (demo) {
            <app-demo-notice short class="mx-1" />
          }
          <button type="button" class="ui-focus mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-surface-3 hover:text-ink-1" aria-label="Cerrar el inspector de traza" (click)="inspector.close()">
            <svg viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      } @else {
        <section
          class="fixed z-[46] flex animate-slide-up flex-col border-line-strong bg-surface-1/95 backdrop-blur-xl"
          [class]="layoutClasses()"
          [class.inspector-dimmed]="dimmed()"
          [attr.data-layout]="layout()"
          (mouseenter)="overConsole.set(true)"
          (mouseleave)="overConsole.set(false)"
          (focusin)="overConsole.set(true)"
          (focusout)="overConsole.set(false)"
          [style.height]="height()"
          [style.width]="width()"
          [style.left.px]="layout() === 'floating' ? position().x : null"
          [style.top.px]="layout() === 'floating' ? position().y : null"
          role="region"
          [attr.aria-label]="'Inspector de traza en vivo de ' + title()"
        >
          @if (layout() === 'bottom') {
            <!-- Franja para redimensionar, como el borde de un panel de un IDE. -->
            <div
              class="resize-handle"
              [class.resizing]="resizing()"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Altura del inspector: arrastra o usa las flechas; doble clic para restablecerla"
              tabindex="0"
              [attr.aria-valuenow]="bottomHeight()"
              [attr.aria-valuemin]="minHeight"
              [attr.aria-valuemax]="maxHeight()"
              (pointerdown)="onResizeStart($event)"
              (pointermove)="onResizeMove($event)"
              (pointerup)="onResizeEnd()"
              (pointercancel)="onResizeEnd()"
              (dblclick)="resetHeight()"
              (keydown)="onResizeKey($event)"
            ></div>
          }
          <header
            class="flex min-h-10 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-2 px-3 py-1"
            [class.cursor-grab]="layout() === 'floating'"
            [style.touch-action]="layout() === 'floating' ? 'none' : null"
            (pointerdown)="onDragStart($event)"
            (pointermove)="onDragMove($event)"
            (pointerup)="onDragEnd()"
            (pointercancel)="onDragEnd()"
          >
            <!-- Semáforo: cerrar, minimizar a la píldora y maximizar. Neutro; toma su color al pasar el cursor o con foco. -->
            <div class="traffic flex shrink-0 items-center" role="group" aria-label="Ventana del inspector">
              <button type="button" class="focus-ring" aria-label="Cerrar el inspector de traza" title="Cerrar" (click)="inspector.close()"><span class="traffic-close"></span></button>
              <button type="button" class="focus-ring" aria-label="Minimizar a píldora" title="Minimizar" (click)="minimize()"><span class="traffic-minimize"></span></button>
              <button
                type="button"
                class="focus-ring"
                [attr.aria-label]="maximized() ? 'Restaurar la altura del inspector' : 'Maximizar el inspector'"
                [attr.aria-pressed]="maximized()"
                [title]="maximized() ? 'Restaurar' : 'Maximizar'"
                (click)="toggleMaximized()"
              ><span class="traffic-maximize"></span></button>
            </div>
            <app-tech-icon class="ml-1" [icon]="icon" [size]="14" />
            <h3 class="min-w-0 flex-1 truncate font-mono text-mono-sm font-normal text-ink-1">
              {{ layout() === 'right' ? 'Traza' : 'Inspector de traza' }} · {{ title() }}
              <span class="text-ink-2">— {{ inspector.graphView() ? 'lienzo' : live() ? 'en vivo' : 'simulación' }}</span>
            </h3>
            @if (demo) {
              <app-demo-notice short />
            }
            <button
              type="button"
              class="ui-focus rounded-control px-2 py-1 font-mono text-mono-sm transition-colors duration-fast hover:bg-surface-3 hover:text-ink-1"
              [class]="inspector.graphView() ? 'bg-surface-3 text-ink-1' : 'text-ink-2'"
              [attr.aria-pressed]="inspector.graphView()"
              title="Filtro Grafo: diff del JSON del lienzo"
              (click)="inspector.selectGraph()"
            >Grafo</button>

            @if (layout() === 'floating') {
              <button
                type="button"
                class="ui-focus flex h-7 w-7 items-center justify-center rounded-control text-ink-2 hover:bg-surface-3 hover:text-ink-1"
                aria-label="Mover el inspector: usa las flechas del teclado"
                (keydown)="onMoveKey($event)"
              >
                <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v12M2 8h12M8 2l-2 2M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" /></svg>
              </button>
            }
            <div class="flex items-center" role="group" aria-label="Posición del inspector">
              @for (button of modeButtons(); track button.mode) {
                <button
                  type="button"
                  class="ui-focus flex h-7 w-7 items-center justify-center rounded-control transition-colors duration-fast hover:bg-surface-3 hover:text-ink-1"
                  [class]="button.mode === inspector.mode() ? 'bg-surface-3 text-ink-1' : 'text-ink-2'"
                  [attr.aria-label]="button.label"
                  [attr.aria-pressed]="button.mode === inspector.mode()"
                  [title]="button.label"
                  (click)="inspector.setMode(button.mode)"
                >
                  <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="button.path" /></svg>
                </button>
              }
            </div>
          </header>

          <div #log class="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 font-mono text-mono" role="log" aria-live="off" tabindex="0" [attr.aria-label]="'Eventos de ' + title()">
            @if (inspector.graphView()) {
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <span class="text-ink-2">Diff del JSON del grafo del lienzo, tras cada cambio.</span>
                <button
                  type="button"
                  class="ui-btn-secondary font-mono"
                  [attr.aria-expanded]="fullJson()"
                  (click)="fullJson.set(!fullJson())"
                >{{ fullJson() ? 'Ver el diff' : 'Ver JSON completo' }}</button>
              </div>
              @if (fullJson()) {
                <pre class="whitespace-pre-wrap break-words" data-testid="graph-json">@for (token of jsonTokens(); track $index) {<span [class]="tokenClasses[token.type]">{{ token.text }}</span>}</pre>
              } @else {
                @for (entry of inspector.graphEntries(); track entry.id) {
                  <div class="mb-1.5 animate-fade-in" data-testid="graph-entry">
                    <p><span class="tabular-nums text-ink-3">{{ entry.time }}</span><span class="text-ink-1"> [Graph Diff]</span><span class="text-ink-2"> {{ entry.summary }}</span></p>
                    @for (line of entry.lines; track $index) {
                      <p class="break-words pl-3" [class]="line.sign === '+' ? 'bg-status-ok/[0.07]' : 'bg-status-danger/[0.07]'">
                        <span [class]="line.changed ? 'text-status-warn' : line.sign === '+' ? 'text-status-ok' : 'text-status-danger'">{{ line.changed ? '~' : '' }}{{ line.sign }} {{ line.label }}</span>
                        @for (token of line.tokens; track $index) {<span [class]="tokenClasses[token.type]">{{ token.text }}</span>}
                      </p>
                    }
                  </div>
                } @empty {
                  <p class="text-ink-3">Aún no hay cambios en el grafo. Edita el lienzo del Estudio de arquitectura y aparecerán aquí.</p>
                }
              }
            } @else {
              @for (event of inspector.events(); track event.id) {
                <!-- Dos columnas: la hora, y el evento, que al partirse sigue bajo su propia columna. -->
                <p class="log-row animate-fade-in">
                  <span class="tabular-nums text-ink-3">@if (event.origin === 'live') {<span class="text-status-ok" title="Evento real del backend">● </span>}{{ event.time }}</span>
                  <span class="min-w-0 break-words">@if (event.level) {<span [class]="kindClasses[event.kind]">[{{ event.level }}] </span>}<span [class]="kindClasses[event.kind]">[{{ event.tag }}]</span><span class="text-ink-2"> {{ event.detail }}</span></span>
                </p>
              } @empty {
                <p class="text-ink-3">Aún no hay eventos de {{ title() }}. Aparecerán aquí en cuanto intervenga en una petición.</p>
              }
            }
          </div>
        </section>
      }
    } @else if (demo && inspector.narrow()) {
      <!-- Inspector cerrado en un móvil: su barra queda recogida al pie, con el aviso de demo como segmento.
           Es una barra opaca que la página esquiva (--dock-bottom), no una píldora flotando sobre el contenido;
           respeta el indicador de inicio y los laterales con las zonas seguras. -->
      <div
        #demoBar
        data-demo-bar
        class="fixed inset-x-0 bottom-0 z-[46] border-t border-line-strong bg-surface-1 pb-[env(safe-area-inset-bottom)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
        role="status"
      >
        <!-- 36 px; con el texto ampliado crece en vez de cortar el aviso. -->
        <div class="flex min-h-9 flex-wrap items-center justify-between gap-x-3 py-1">
          <span class="min-w-0 truncate font-mono text-mono-sm text-ink-3">Inspector de traza</span>
          <app-demo-notice class="max-w-full" />
        </div>
      </div>
    } @else if (demo) {
      <!-- Inspector cerrado con sitio de sobra: el aviso de demo ocupa la esquina de su píldora. No es interactivo. -->
      <div data-demo-pill style="bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); right: calc(1rem + env(safe-area-inset-right, 0px))" class="pointer-events-none fixed z-[46] flex max-w-[calc(100vw-2rem)] rounded-full bg-surface-1 shadow-floating">
        <app-demo-notice />
      </div>
    }
  `,
    styles: `
    section { transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
    .log-row { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 0.75rem; }
    /* Flotante mientras se usa el lienzo: casi transparente y sin desenfoque, para ver los nodos de debajo. */
    .inspector-dimmed {
      opacity: 0.3;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    /* Franja superior para redimensionar: discreta en reposo, con un brillo tenue al usarla. */
    .resize-handle {
      position: absolute;
      inset: -3px 0 auto 0;
      z-index: 1;
      height: 8px;
      cursor: ns-resize;
      touch-action: none;
      outline: none;
    }
    /* Con el dedo no hay franja de 8 px que valga: el tamaño se cambia con el botón verde (maximizar). */
    @media (pointer: coarse) {
      .resize-handle { display: none; }
    }
    .resize-handle::after {
      content: '';
      position: absolute;
      inset: 3px 0 auto 0;
      height: 2px;
      background: var(--accent-text);
      opacity: 0;
      transition: opacity 0.2s;
    }
    .resize-handle:hover::after, .resize-handle:focus-visible::after, .resize-handle.resizing::after { opacity: 1; }
    /* Semáforo: cada botón tiene un área de pulsación mayor que el círculo que se ve. */
    .traffic button { display: flex; height: 1.5rem; width: 1.125rem; align-items: center; justify-content: center; border-radius: 9999px; }
    .traffic span { height: 0.75rem; width: 0.75rem; border-radius: 9999px; background: var(--border-strong); transition: background var(--duration-fast) var(--ease-standard); }
    /* Con el cursor en la cabecera, o con el foco en uno de los tres, cada punto toma su color. */
    header:hover .traffic-close, .traffic:focus-within .traffic-close { background: var(--status-danger); }
    header:hover .traffic-minimize, .traffic:focus-within .traffic-minimize { background: var(--status-warn); }
    header:hover .traffic-maximize, .traffic:focus-within .traffic-maximize { background: var(--status-ok); }
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TraceInspectorComponent {
  readonly inspector = inject(TraceInspectorService);
  private readonly telemetry = inject(TelemetryStreamService);

  /** En modo demo el aviso es un segmento de esta barra (docs/DESIGN.md §8.4). */
  readonly demo = runtimeConfig.mockMode;
  private readonly demoHost = inject(DemoNoticeHost);

  readonly kindClasses = KIND_CLASSES;
  readonly icon = computed(() => {
    const tech = this.inspector.selected();
    return tech ? TECH_ICONS[tech] : null;
  });
  /** Lo que se inspecciona: el nodo concreto si la selección vino de un diagrama, o la tecnología. */
  readonly title = computed(() => this.inspector.label() ?? this.icon()?.title ?? '');
  /**
   * «En vivo» si llega el stream real, o si todo lo que muestra ahora es real (p. ej. la respuesta
   * de «Comprobar ahora»): una comprobación de verdad no se rotula como simulación.
   */
  readonly live = computed(() => {
    if (this.telemetry.status() === 'live') {
      return true;
    }
    const shown = this.inspector.events();
    return shown.length > 0 && shown.every((event) => event.origin === 'live');
  });
  readonly layout = this.inspector.layout;
  readonly layoutClasses = computed(() => {
    const layout = this.layout();
    return layout === 'pill' ? '' : LAYOUT_CLASSES[layout];
  });

  /** Acoplado abajo: altura normal o ampliada. */
  readonly tall = signal(false);
  /** Altura elegida para el panel acoplado abajo; se recuerda entre visitas. */
  readonly bottomHeight = signal(storedHeight());
  readonly resizing = signal(false);
  readonly minHeight = BOTTOM_MIN_PX;
  readonly maxHeight = signal(maxBottomHeight());
  private resizeStart: { y: number; height: number } | null = null;

  /** Esquina superior izquierda del panel flotante, en píxeles de ventana. */
  readonly position = signal(initialPosition());

  readonly height = computed(() => {
    switch (this.layout()) {
      case 'bottom': return this.tall() ? BOTTOM_HEIGHT_TALL : `${this.bottomHeight()}px`;
      case 'sheet': return this.tall() ? SHEET_HEIGHT_TALL : SHEET_HEIGHT;
      case 'floating': return `${FLOATING_HEIGHT}px`;
      default: return null;
    }
  });
  readonly width = computed(() => (this.layout() === 'right' ? RIGHT_WIDTH : this.layout() === 'floating' ? `${FLOATING_WIDTH}px` : null));

  /** En la hoja inferior no hay posición que elegir: quedan los botones de la ventana. */
  readonly modeButtons = computed(() => (this.layout() === 'sheet' ? [] : MODE_BUTTONS));
  /** El botón verde: ampliado solo tiene sentido acoplado abajo o como hoja. */
  readonly maximized = computed(() => this.tall() && (this.layout() === 'bottom' || this.layout() === 'sheet'));
  /** Filtro «Grafo»: el JSON completo en lugar del diff. */
  readonly fullJson = signal(false);
  readonly tokenClasses = TOKEN_CLASSES;
  readonly jsonTokens = computed(() => tokenizeJson(this.inspector.graphJson()));
  readonly countLabel = computed(() => {
    const count = this.inspector.graphView() ? this.inspector.graphEntries().length : this.inspector.events().length;
    return `${count} ${count === 1 ? 'evento' : 'eventos'}`;
  });

  /** El cursor (o el foco) está sobre la consola. */
  readonly overConsole = signal(false);
  /** El visitante está trabajando sobre un diagrama. */
  private readonly overDiagram = signal(false);
  /** Flotante sobre un diagrama en uso: se vuelve translúcida para dejar ver los nodos. */
  readonly dimmed = computed(() => this.layout() === 'floating' && this.overDiagram() && !this.overConsole());

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly demoBar = viewChild<ElementRef<HTMLElement>>('demoBar');
  /** Alto real de la barra recogida, en px; 0 hasta medirla. Crece con el texto ampliado y con el tamaño táctil del aviso. */
  private readonly demoBarHeight = signal(0);
  private drag: { dx: number; dy: number } | null = null;

  constructor() {
    effect(() => {
      this.inspector.graphEntries();
      this.inspector.events();
      const element = this.log()?.nativeElement;
      if (element) {
        setTimeout(() => (element.scrollTop = element.scrollHeight));
      }
    });

    // Hueco que la página reserva al panel acoplado (clase `dock-aware`, barra de navegación y modo teatro).
    effect(() => {
      const open = this.icon() !== null;
      const layout = this.layout();
      const root = document.documentElement.style;
      root.setProperty('--dock-right', open && layout === 'right' ? RIGHT_WIDTH : '0px');
      // Cerrado en un móvil y en modo demo, queda su barra recogida: la página también le deja sitio.
      const bar = !open && this.demo && this.inspector.narrow();
      root.setProperty('--dock-bottom', open && (layout === 'bottom' || layout === 'sheet') ? this.height()! : bar ? (this.demoBarHeight() ? `${this.demoBarHeight()}px` : DEMO_BAR_SPACE) : '0px');
      // Una píldora en la esquina (inspector minimizado o aviso de demo): el pie le deja sitio.
      root.setProperty('--pill-space', (open && layout === 'pill') || (!open && this.demo && !bar) ? PILL_SPACE : '0px');
    });
    // La página reserva a la barra recogida el alto que de verdad tiene, no uno supuesto.
    effect((onCleanup) => {
      const bar = this.demoBar()?.nativeElement;
      if (!bar || typeof ResizeObserver === 'undefined') {
        this.demoBarHeight.set(0);
        return;
      }
      const observer = new ResizeObserver(() => this.demoBarHeight.set(Math.ceil(bar.getBoundingClientRect().height)));
      observer.observe(bar);
      onCleanup(() => observer.disconnect());
    }, { allowSignalWrites: true });
    this.demoHost.hosted.set(true);
    inject(DestroyRef).onDestroy(() => {
      document.documentElement.classList.remove('dock-resizing');
      document.documentElement.style.removeProperty('--dock-right');
      document.documentElement.style.removeProperty('--dock-bottom');
      document.documentElement.style.removeProperty('--pill-space');
      this.demoHost.hosted.set(false);
    });
  }

  /**
   * Amarillo: la ventana se recoge en la píldora con el efecto genio. El estado cambia al
   * instante (la píldora ya responde a los clics); lo que se anima es una copia de la ventana,
   * que se escurre hasta donde ha aparecido la píldora.
   */
  minimize(): void {
    const section = this.host.querySelector<HTMLElement>('section');
    const ghost = section ? ghostOf(section) : null;
    this.inspector.setMode('pill');
    if (!ghost) {
      return;
    }
    document.body.appendChild(ghost);
    afterNextRender(() => {
      const animation = playGenie(ghost, this.pillCentre(), true);
      if (!animation) {
        ghost.remove();
        return;
      }
      animation.finished.then(() => ghost.remove(), () => ghost.remove());
    }, { injector: this.injector });
  }

  /** Desde la píldora, la ventana se despliega con el mismo efecto al revés. */
  restoreWindow(): void {
    const origin = this.pillCentre();
    this.inspector.restore();
    afterNextRender(() => {
      const section = this.host.querySelector<HTMLElement>('section');
      if (section) {
        playGenie(section, origin, false);
      }
    }, { injector: this.injector });
  }

  /** Centro de la píldora en pantalla; si aún no está dibujada, la esquina donde aparece. */
  private pillCentre(): { x: number; y: number } {
    const pill = this.host.querySelector<HTMLElement>('[data-pill]')?.getBoundingClientRect();
    return pill && pill.width > 0
      ? { x: pill.left + pill.width / 2, y: pill.top + pill.height / 2 }
      : { x: window.innerWidth - 120, y: window.innerHeight - 32 };
  }

  /** Verde: amplía o restaura; desde la derecha o flotando, acopla abajo ya ampliado. */
  toggleMaximized(): void {
    if (this.layout() === 'bottom' || this.layout() === 'sheet') {
      this.tall.update((tall) => !tall);
    } else {
      this.tall.set(true);
      this.inspector.setMode('bottom');
    }
  }

  @HostListener('document:pointerover', ['$event'])
  onPointerOver(event: Event): void {
    this.overDiagram.set(event.target instanceof Element && event.target.closest('.theater-card') !== null);
  }

  // ---------- Redimensionar el panel acoplado abajo ----------

  onResizeStart(event: PointerEvent): void {
    event.preventDefault();
    // Se parte de la altura que se ve, también si estaba ampliado con el botón verde.
    this.resizeStart = { y: event.clientY, height: this.tall() ? window.innerHeight / 2 : this.bottomHeight() };
    this.setHeight(this.resizeStart.height);
    this.resizing.set(true);
    // Mientras se arrastra, la página sigue al panel sin la transición con la que se acopla.
    document.documentElement.classList.add('dock-resizing');
    capturePointer(event.currentTarget, event.pointerId);
  }

  onResizeMove(event: PointerEvent): void {
    if (this.resizeStart) {
      this.setHeight(this.resizeStart.height + (this.resizeStart.y - event.clientY));
    }
  }

  onResizeEnd(): void {
    if (!this.resizeStart) {
      return;
    }
    this.resizeStart = null;
    this.resizing.set(false);
    document.documentElement.classList.remove('dock-resizing');
    this.rememberHeight();
  }

  onResizeKey(event: KeyboardEvent): void {
    const step: Record<string, number> = { ArrowUp: RESIZE_KEY_STEP, ArrowDown: -RESIZE_KEY_STEP };
    if (step[event.key]) {
      event.preventDefault();
      this.setHeight(this.bottomHeight() + step[event.key]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.setHeight(BOTTOM_MIN_PX);
    } else if (event.key === 'End') {
      event.preventDefault();
      this.setHeight(this.maxHeight());
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.resetHeight();
      return;
    } else {
      return;
    }
    this.rememberHeight();
  }

  resetHeight(): void {
    this.setHeight(BOTTOM_HEIGHT_PX);
    this.rememberHeight();
  }

  private setHeight(height: number): void {
    this.tall.set(false);
    this.bottomHeight.set(clampHeight(height));
  }

  private rememberHeight(): void {
    try {
      localStorage.setItem(HEIGHT_STORAGE_KEY, String(this.bottomHeight()));
    } catch {
      // Sin almacenamiento la altura simplemente no se recuerda.
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.inspector.viewportWidth.set(window.innerWidth);
    this.inspector.viewportHeight.set(window.innerHeight);
    this.maxHeight.set(maxBottomHeight());
    this.bottomHeight.update(clampHeight);
    this.position.update(clampToViewport);
  }

  // Flotante: se arrastra por la cabecera (no por sus botones) o se mueve con las flechas.
  onDragStart(event: PointerEvent): void {
    if (this.layout() !== 'floating' || (event.target as Element).closest('button')) {
      return;
    }
    this.drag = { dx: event.clientX - this.position().x, dy: event.clientY - this.position().y };
    capturePointer(event.currentTarget, event.pointerId);
  }

  onDragMove(event: PointerEvent): void {
    if (this.drag) {
      this.position.set(clampToViewport({ x: event.clientX - this.drag.dx, y: event.clientY - this.drag.dy }));
    }
  }

  onDragEnd(): void {
    this.drag = null;
  }

  onMoveKey(event: KeyboardEvent): void {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-KEYBOARD_STEP, 0], ArrowRight: [KEYBOARD_STEP, 0], ArrowUp: [0, -KEYBOARD_STEP], ArrowDown: [0, KEYBOARD_STEP],
    };
    const delta = step[event.key];
    if (delta) {
      event.preventDefault();
      this.position.update(({ x, y }) => clampToViewport({ x: x + delta[0], y: y + delta[1] }));
    }
  }
}

function maxBottomHeight(): number {
  return Math.max(BOTTOM_MIN_PX, Math.round(window.innerHeight * BOTTOM_MAX_RATIO));
}

function clampHeight(height: number): number {
  return Math.round(Math.max(BOTTOM_MIN_PX, Math.min(maxBottomHeight(), height)));
}

function storedHeight(): number {
  try {
    const stored = Number(localStorage.getItem(HEIGHT_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampHeight(stored) : clampHeight(BOTTOM_HEIGHT_PX);
  } catch {
    return clampHeight(BOTTOM_HEIGHT_PX);
  }
}

function initialPosition(): { x: number; y: number } {
  return clampToViewport({ x: window.innerWidth - FLOATING_WIDTH - 16, y: window.innerHeight - FLOATING_HEIGHT - 16 });
}

function clampToViewport({ x, y }: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(Math.max(EDGE, Math.min(window.innerWidth - FLOATING_WIDTH - EDGE, x))),
    y: Math.round(Math.max(EDGE, Math.min(window.innerHeight - FLOATING_HEIGHT - EDGE, y))),
  };
}
