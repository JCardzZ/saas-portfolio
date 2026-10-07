import { Injectable, signal } from '@angular/core';

import { TechIcon } from './tech-icons';

export interface PoppedIcon {
  id: number;
  icon: TechIcon;
  /** Centro del logo original en la ventana: de ahí despega y ahí vuelve. */
  x: number;
  y: number;
  /** Tamaño del logo original respecto al flotante (escala de partida). */
  fromScale: number;
  /** Desplazamiento, en píxeles, desde el logo original hasta donde queda flotando. */
  dx: number;
  dy: number;
  /** Está volviendo a su sitio. */
  leaving: boolean;
}

/** Lado, en píxeles, del logo cuando flota desprendido. */
export const POPPED_SIZE = 116;
/** Margen superior que el logo flotante respeta para no quedar bajo la barra de navegación. */
const TOP_MARGIN = 72;
const RETURN_MS = 420;
const AUTO_DISMISS_MS = 4500;
/** Pausa mínima del cursor sobre un logo antes de que despegue: evita que salten todos al cruzar el diagrama. */
export const HOVER_POP_DELAY_MS = 110;
const DETACHED_CLASS = 'icon-detached';

/**
 * Pop-out 3D de un logo: al pulsarlo se desprende de su sitio y flota ampliado, girando en
 * 3D, en una capa HTML por encima de la página (IconPopLayerComponent). Va en una capa aparte
 * porque dentro de un SVG los navegadores no dibujan transformaciones 3D reales.
 */
@Injectable({ providedIn: 'root' })
export class IconPopService {
  private readonly _current = signal<PoppedIcon | null>(null);
  readonly current = this._current.asReadonly();

  private origin: Element | null = null;
  private nextId = 1;
  private poppedAt = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;

  /** Momento del último despegue: permite ignorar el mismo clic que lo provocó. */
  get lastPopAt(): number {
    return this.poppedAt;
  }

  /**
   * El cursor se ha posado sobre un logo: despega tras una pausa mínima y flota mientras
   * el cursor siga encima (sin temporizador de vuelta).
   */
  hoverEnter(icon: TechIcon, origin: Element, anchor?: Element): void {
    this.cancelHover();
    this.hoverTimer = setTimeout(() => this.pop(icon, origin, false, anchor), HOVER_POP_DELAY_MS);
  }

  /** El cursor ha salido del logo: si es el que flota, vuelve a su sitio. */
  hoverLeave(origin: Element): void {
    this.cancelHover();
    if (this.origin === origin) {
      this.dismiss();
    }
  }

  /**
   * @param autoDismiss con `true` (clic o toque) vuelve solo a los pocos segundos; con `false`
   *                    (hover) se queda hasta que el cursor salga.
   * @param anchor      elemento sobre el que debe quedar centrado al flotar (el nodo del
   *                    diagrama); sin él, flota justo encima de su posición original.
   */
  pop(icon: TechIcon, origin: Element, autoDismiss = true, anchor?: Element): void {
    // Ya está flotando ese mismo logo: no se reinicia la animación.
    if (this.origin === origin && this._current() && !this._current()!.leaving) {
      return;
    }
    const rect = origin.getBoundingClientRect();
    if (rect.width === 0) {
      return;
    }
    this.release();
    this.origin = origin;
    origin.classList.add(DETACHED_CLASS);
    this.poppedAt = Date.now();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    // Destino: centrado en horizontal sobre el ancla y flotando por encima de ella.
    const box = anchor?.getBoundingClientRect() ?? rect;
    const targetX = box.left + box.width / 2;
    const targetY = Math.max(TOP_MARGIN + POPPED_SIZE / 2, box.top - POPPED_SIZE * 0.5);
    this._current.set({
      id: this.nextId++,
      icon,
      x,
      y,
      fromScale: rect.width / POPPED_SIZE,
      dx: targetX - x,
      dy: targetY - y,
      leaving: false,
    });
    this.timers = autoDismiss ? [setTimeout(() => this.dismiss(), AUTO_DISMISS_MS)] : [];
  }

  /** Devuelve el logo a su sitio con animación. */
  dismiss(): void {
    const current = this._current();
    if (!current || current.leaving) {
      return;
    }
    this.clearTimers();
    this._current.set({ ...current, leaving: true });
    this.timers = [setTimeout(() => this.release(), RETURN_MS)];
  }

  /** Lo retira de inmediato (otro logo ocupa su lugar, o la página se ha movido). */
  release(): void {
    this.clearTimers();
    this.origin?.classList.remove(DETACHED_CLASS);
    this.origin = null;
    this._current.set(null);
  }

  private cancelHover(): void {
    if (this.hoverTimer !== null) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
