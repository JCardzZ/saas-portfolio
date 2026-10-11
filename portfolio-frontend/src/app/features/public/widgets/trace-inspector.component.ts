import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, computed, effect, inject, signal, viewChild,
} from '@angular/core';

import { ghostOf, playGenie } from '../../../shared/ui/genie';
import { TechIconComponent } from '../../../shared/ui/tech-icon.component';
import { TECH_ICONS } from '../../../shared/ui/tech-icons';
import { SystemEventKind } from '../data/system-events.service';
import { TelemetryStreamService } from '../data/telemetry-stream.service';
import { JsonTokenType, tokenizeJson } from '../data/graph-diff';
import { InspectorLayout, InspectorMode, TraceInspectorService } from '../data/trace-inspector.service';

/** Colores de la sintaxis JSON en el filtro «Grafo». */
const TOKEN_CLASSES: Record<JsonTokenType, string> = {
  key: 'text-sky-300', string: 'text-emerald-200', number: 'text-amber-200', literal: 'text-violet-300', punct: 'text-zinc-500',
};

const KIND_CLASSES: Record<SystemEventKind, string> = {
  ok: 'text-emerald-400',
  cache: 'text-teal-300',
  vector: 'text-sky-400',
  ai: 'text-violet-400',
  auth: 'text-amber-300',
  info: 'text-zinc-300',
  warn: 'text-red-400',
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
const KEYBOARD_STEP = 24;

const LAYOUT_CLASSES: Record<Exclude<InspectorLayout, 'pill'>, string> = {
  // Acoplado a un borde llega hasta él: el contenido se aparta de la muesca y de la barra de gestos.
  bottom: 'inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
  right: 'inset-y-0 right-0 overflow-hidden border-l pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]',
  floating: 'overflow-hidden rounded-2xl border shadow-2xl shadow-black/70',
  sheet: 'inset-x-0 bottom-0 overflow-hidden rounded-t-2xl border-t shadow-2xl shadow-black/70 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
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
  standalone: true,
  imports: [TechIconComponent],
  template: `
    @if (icon(); as icon) {
      @if (layout() === 'pill') {
        <div data-pill style="bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); right: calc(1rem + env(safe-area-inset-right, 0px))" class="fixed z-[46] flex max-w-[calc(100vw-2rem)] animate-scale-up items-center rounded-full border bg-zinc-950/90 shadow-xl shadow-black/60 backdrop-blur-2xl" [style.border-color]="tint(55)">
          <button
            type="button"
            class="focus-ring flex items-center gap-2 rounded-full py-1.5 pl-3 pr-2 font-mono text-[11px] text-zinc-100 transition hover:bg-white/10"
            [attr.aria-label]="'Desplegar el inspector de traza de ' + title() + ', ' + countLabel()"
            (click)="restoreWindow()"
          >
            <span class="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden="true"></span>
            <app-tech-icon [icon]="icon" [size]="14" />
            Inspector de traza · {{ title() }}
            <span class="tabular-nums text-zinc-400">({{ countLabel() }})</span>
          </button>
          <button type="button" class="focus-ring mr-1 flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar el inspector de traza" (click)="inspector.close()">
            <svg viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      } @else {
        <section
          class="fixed z-[46] flex animate-slide-up flex-col bg-zinc-950/90 backdrop-blur-2xl transition-colors duration-500 ease-spring"
          [class]="layoutClasses()"
          [class.inspector-dimmed]="dimmed()"
          [attr.data-layout]="layout()"
          (mouseenter)="overConsole.set(true)"
          (mouseleave)="overConsole.set(false)"
          (focusin)="overConsole.set(true)"
          (focusout)="overConsole.set(false)"
          [style.border-color]="tint(55)"
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
            class="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 transition-colors duration-500 ease-spring"
            [class.cursor-grab]="layout() === 'floating'"
            [style.touch-action]="layout() === 'floating' ? 'none' : null"
            [style.background]="tint(22)"
            [style.border-color]="tint(45)"
            (pointerdown)="onDragStart($event)"
            (pointermove)="onDragMove($event)"
            (pointerup)="onDragEnd()"
            (pointercancel)="onDragEnd()"
          >
            <!-- Semáforo de macOS: rojo cierra, amarillo minimiza a la píldora, verde maximiza. -->
            <div class="traffic flex shrink-0 items-center" role="group" aria-label="Ventana del inspector">
              <button type="button" class="focus-ring" aria-label="Cerrar el inspector de traza" title="Cerrar" (click)="inspector.close()"><span class="bg-[#ff5f57]"></span></button>
              <button type="button" class="focus-ring" aria-label="Minimizar a píldora" title="Minimizar" (click)="minimize()"><span class="bg-[#febc2e]"></span></button>
              <button
                type="button"
                class="focus-ring"
                [attr.aria-label]="maximized() ? 'Restaurar la altura del inspector' : 'Maximizar el inspector'"
                [attr.aria-pressed]="maximized()"
                [title]="maximized() ? 'Restaurar' : 'Maximizar'"
                (click)="toggleMaximized()"
              ><span class="bg-[#28c840]"></span></button>
            </div>
            <app-tech-icon class="ml-1" [icon]="icon" [size]="14" />
            <h3 class="min-w-0 flex-1 truncate font-mono text-[11px] font-normal text-zinc-100">
              {{ layout() === 'right' ? 'Traza' : 'Inspector de traza' }} · {{ title() }}
              <span class="text-zinc-400">— {{ inspector.graphView() ? 'lienzo' : live() ? 'en vivo' : 'simulación' }}</span>
            </h3>
            <button
              type="button"
              class="focus-ring rounded-md px-2 py-1 font-mono text-[11px] transition hover:bg-white/10 hover:text-white"
              [class]="inspector.graphView() ? 'bg-white/15 text-white' : 'text-zinc-400'"
              [attr.aria-pressed]="inspector.graphView()"
              title="Filtro Grafo: diff del JSON del lienzo"
              (click)="inspector.selectGraph()"
            >Grafo</button>

            @if (layout() === 'floating') {
              <button
                type="button"
                class="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white"
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
                  class="focus-ring flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white/10 hover:text-white"
                  [class]="button.mode === inspector.mode() ? 'bg-white/15 text-white' : 'text-zinc-400'"
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

          <div #log class="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed" role="log" aria-live="off" tabindex="0" [attr.aria-label]="'Eventos de ' + title()">
            @if (inspector.graphView()) {
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <span class="text-zinc-400">Diff del JSON del grafo del lienzo, tras cada cambio.</span>
                <button
                  type="button"
                  class="focus-ring rounded-full border border-white/20 px-2.5 py-0.5 text-zinc-100 hover:bg-white/10"
                  [attr.aria-expanded]="fullJson()"
                  (click)="fullJson.set(!fullJson())"
                >{{ fullJson() ? 'Ver el diff' : 'Ver JSON completo' }}</button>
              </div>
              @if (fullJson()) {
                <pre class="whitespace-pre-wrap break-words" data-testid="graph-json">@for (token of jsonTokens(); track $index) {<span [class]="tokenClasses[token.type]">{{ token.text }}</span>}</pre>
              } @else {
                @for (entry of inspector.graphEntries(); track entry.id) {
                  <div class="animate-slide-up mb-1.5" data-testid="graph-entry">
                    <p><span class="text-zinc-600">{{ entry.time }}</span> <span class="text-sky-300">[Graph Diff]</span> <span class="text-zinc-400">{{ entry.summary }}</span></p>
                    @for (line of entry.lines; track $index) {
                      <p class="break-words pl-3" [class]="line.sign === '+' ? 'bg-emerald-400/[0.07]' : 'bg-red-400/[0.07]'">
                        <span [class]="line.changed ? 'text-amber-300' : line.sign === '+' ? 'text-emerald-300' : 'text-red-300'">{{ line.changed ? '~' : '' }}{{ line.sign }} {{ line.label }}</span>
                        @for (token of line.tokens; track $index) {<span [class]="tokenClasses[token.type]">{{ token.text }}</span>}
                      </p>
                    }
                  </div>
                } @empty {
                  <p class="text-zinc-500">Aún no hay cambios en el grafo. Edita el lienzo del Estudio de arquitectura y aparecerán aquí.</p>
                }
              }
            } @else {
              @for (event of inspector.events(); track event.id) {
                <p class="animate-slide-up break-words">
                  @if (event.origin === 'live') {
                    <span class="text-emerald-400" title="Evento real del backend">●</span>
                  }
                  <span class="text-zinc-600">{{ event.time }}</span>
                  @if (event.level) {
                    <span [class]="kindClasses[event.kind]"> [{{ event.level }}]</span>
                  }
                  <span [class]="kindClasses[event.kind]"> [{{ event.tag }}]</span>
                  <span class="text-zinc-400"> {{ event.detail }}</span>
                </p>
              } @empty {
                <p class="text-zinc-500">Aún no hay eventos de {{ title() }}. Aparecerán aquí en cuanto intervenga en una petición.</p>
              }
            }
          </div>
        </section>
      }
    }
  `,
  styles: `
    section { transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.5s; }
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
      background: #38bdf8;
      box-shadow: 0 0 10px 1px rgb(56 189 248 / 0.7);
      opacity: 0;
      transition: opacity 0.2s;
    }
    .resize-handle:hover::after, .resize-handle:focus-visible::after, .resize-handle.resizing::after { opacity: 1; }
    /* Semáforo: cada botón tiene un área de pulsación mayor que el círculo que se ve. */
    .traffic button { display: flex; height: 1.5rem; width: 1.125rem; align-items: center; justify-content: center; border-radius: 9999px; }
    .traffic span { height: 0.75rem; width: 0.75rem; border-radius: 9999px; box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.25); transition: filter 0.2s; }
    .traffic button:hover span { filter: brightness(1.25); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TraceInspectorComponent {
  readonly inspector = inject(TraceInspectorService);
  private readonly telemetry = inject(TelemetryStreamService);

  readonly kindClasses = KIND_CLASSES;
  readonly icon = computed(() => {
    const tech = this.inspector.selected();
    return tech ? TECH_ICONS[tech] : null;
  });
  /** Lo que se inspecciona: el nodo concreto si la selección vino de un diagrama, o la tecnología. */
  readonly title = computed(() => this.inspector.label() ?? this.icon()?.title ?? '');
  readonly live = computed(() => this.telemetry.status() === 'live');
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
      root.setProperty('--dock-bottom', open && (layout === 'bottom' || layout === 'sheet') ? this.height()! : '0px');
    });
    inject(DestroyRef).onDestroy(() => {
      document.documentElement.classList.remove('dock-resizing');
      document.documentElement.style.removeProperty('--dock-right');
      document.documentElement.style.removeProperty('--dock-bottom');
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
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
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

  /** Color de marca mezclado con transparente, para teñir cabecera y borde sin perder legibilidad. */
  tint(percent: number): string {
    return `color-mix(in srgb, ${this.icon()?.color ?? '#fff'} ${percent}%, transparent)`;
  }

  // Flotante: se arrastra por la cabecera (no por sus botones) o se mueve con las flechas.
  onDragStart(event: PointerEvent): void {
    if (this.layout() !== 'floating' || (event.target as Element).closest('button')) {
      return;
    }
    this.drag = { dx: event.clientX - this.position().x, dy: event.clientY - this.position().y };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
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
