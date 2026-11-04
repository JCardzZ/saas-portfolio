import { Directive, ElementRef, HostListener, InjectionToken, NgZone, OnDestroy, inject, signal } from '@angular/core';

import { focusableWithin } from './focus-trap.directive';

/** Permite desactivar la animación (tests, o "reducir movimiento" del sistema). */
export const THEATER_ANIMATIONS = new InjectionToken<boolean>('THEATER_ANIMATIONS', {
  providedIn: 'root',
  factory: () => !matchMedia('(prefers-reduced-motion: reduce)').matches,
});

const EXPANDED_CLASS = 'theater-expanded';
const FOCUS_CLASS = 'theater-focus';
const BACKDROP_CLASS = 'theater-backdrop';
const BACKDROP_ON_CLASS = 'theater-backdrop-on';
/** En <html> mientras dura la transición del modo teatro: sus estilos solo valen para ella. */
const TRANSITION_CLASS = 'theater-transition';
/** En <html> mientras se cierra: las esquinas vuelven a redondearse en vez de enderezarse. */
const COLLAPSING_CLASS = 'theater-collapsing';
const SCRIM_CLASS = 'theater-scrim';
/** Cada tarjeta necesita su propio nombre de transición. */
let nextTransitionName = 0;
/** Tiempo que el cursor debe quedarse sobre la tarjeta para considerarlo intención y no un paso de largo. */
export const HOVER_INTENT_MS = 300;
/** Controles propios de la tarjeta: tocarlos hace su función, no amplía. */
const INTERACTIVE = 'button, a, input, textarea, select, summary, [role="button"], [role="tab"], [role="switch"], [tabindex]';

/**
 * Dos niveles de protagonismo para una tarjeta de diagrama:
 * - Foco: si el cursor se queda sobre ella, se adelanta y el resto de la página se desenfoca.
 *   No requiere clic y se deshace al salir. En táctil no existe (no hay hover).
 * - Modo teatro: la amplía a pantalla completa. Se entra con el botón o, en táctil, tocando
 *   cualquier zona de la tarjeta que no sea un control.
 *
 * Modo teatro: amplía el elemento a pantalla completa y lo devuelve a su sitio, animando
 * entre ambas posiciones. Es el mismo elemento el que se mueve, así que conserva su estado
 * (pestaña activa, interruptores). Mientras está ampliado se comporta como un diálogo modal:
 * Esc lo cierra, el foco no sale de él y la página de fondo no se desplaza.
 */
@Directive({
  selector: '[appTheater]',
  standalone: true,
  host: {
    class: 'theater-card',
    '[attr.role]': 'expanded() ? "dialog" : null',
    '[attr.aria-modal]': 'expanded() ? "true" : null',
    '[attr.aria-label]': 'expanded() ? label() : null',
  },
})
export class TheaterDirective implements OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly animated = inject(THEATER_ANIMATIONS);
  private readonly zone = inject(NgZone);

  readonly expanded = signal(false);
  /** Nombre del diagrama, anunciado como título del diálogo. */
  readonly label = signal('Diagrama');

  /** Ocupa el hueco de la tarjeta en la rejilla mientras esta flota a pantalla completa. */
  private placeholder: HTMLElement | null = null;
  private previousBodyOverflow = '';
  /** Posición de la página al ampliar: se devuelve exacta al cerrar. */
  private previousScroll = 0;
  private transition: ViewTransition | null = null;
  private readonly transitionName = `theater-${nextTransitionName++}`;
  /** Recién cerrada bajo el cursor: no se adelanta hasta que el cursor salga y vuelva a entrar. */
  private settling = false;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPointerType = '';

  /** La tarjeta está adelantada por intención de hover. */
  readonly focused = signal(false);

  @HostListener('pointerenter', ['$event'])
  onPointerEnter(event: PointerEvent): void {
    // Solo ratón: en táctil "pointerenter" llega con el toque y dejaría el efecto pegado.
    if (event.pointerType !== 'mouse' || !this.animated || this.expanded() || this.settling) {
      return;
    }
    // Durante el recorrido guiado la página se desplaza sola bajo un cursor quieto: no es intención.
    if (document.documentElement.classList.contains('robot-touring')) {
      return;
    }
    this.cancelHoverIntent();
    this.hoverTimer = setTimeout(() => this.setFocused(true), HOVER_INTENT_MS);
  }

  @HostListener('pointerleave')
  onPointerLeave(): void {
    this.cancelHoverIntent();
    this.setFocused(false);
  }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    this.lastPointerType = event.pointerType;
  }

  // En táctil, un toque en la tarjeta (fuera de sus controles) la amplía directamente.
  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (this.lastPointerType !== 'touch' || this.expanded()) {
      return;
    }
    const control = (event.target as Element | null)?.closest(INTERACTIVE);
    if (control && control !== this.host && this.host.contains(control)) {
      return;
    }
    this.expand();
  }

  toggle(): void {
    if (this.expanded()) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  expand(): void {
    if (this.expanded()) {
      return;
    }
    this.cancelHoverIntent();
    // La celda se mide antes de que cambie nada: el hueco que deja la tarjeta tiene su alto exacto, el de
    // maquetación (sin la escala del foco por hover, que no ocupa sitio).
    const height = this.host.offsetHeight;
    const style = getComputedStyle(this.host);
    // Se guarda ya: el navegador puede mover la página al sacar la tarjeta del flujo (scroll anchoring).
    const scroll = window.scrollY;
    this.expanded.set(true);
    this.morph(() => {
      this.setFocused(false);
      this.scrim(true, false);
      this.placeholder = document.createElement('div');
      this.placeholder.setAttribute('aria-hidden', 'true');
      this.placeholder.style.height = `${height}px`;
      this.placeholder.style.gridColumnStart = style.gridColumnStart;
      this.placeholder.style.gridColumnEnd = style.gridColumnEnd;
      this.host.parentNode?.insertBefore(this.placeholder, this.host);
      this.previousScroll = scroll;
      this.host.classList.add(EXPANDED_CLASS);
      this.keepScroll();
    }, () => {
      // La página de fondo deja de desplazarse cuando la tarjeta ya ocupa la pantalla: si la barra de
      // scroll desapareciera durante la transición, cambiaría el tamaño de la vista y el navegador la cancelaría.
      // Solo si sigue ampliada de verdad: pudo cerrarse o destruirse mientras duraba la transición.
      if (this.expanded() && this.placeholder) {
        this.lockPage(true);
      }
      // El velo solo hace falta mientras la tarjeta viaja: ya ampliada, la tarjeta es opaca.
      this.scrim(false);
    });
  }

  collapse(): void {
    if (!this.expanded()) {
      return;
    }
    this.expanded.set(false);
    // Vuelve bajo el cursor: que no se adelante sola nada más llegar.
    this.settle(true);
    this.lockPage(false);
    // La página de fondo se aclara mientras la tarjeta vuelve.
    this.scrim(true, true);
    this.morph(() => this.restore(), () => this.scrim(false), true);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.collapse();
  }

  // Mientras está ampliado, Tab da la vuelta dentro de la tarjeta.
  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.expanded()) {
      return;
    }
    const focusable = focusableWithin(this.host);
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  ngOnDestroy(): void {
    this.cancelHoverIntent();
    this.settle(false);
    this.setFocused(false);
    this.transition?.skipTransition();
    this.scrim(false);
    if (this.placeholder) {
      this.restore();
    }
  }

  /**
   * Al encogerse bajo el cursor el navegador da salida y entrada sin que el ratón se mueva: solo un
   * movimiento real fuera de la tarjeta vuelve a permitir el foco por hover. El oyente vive fuera de
   * Angular y solo mientras hace falta, para no despertar la detección de cambios con cada movimiento.
   */
  private settle(on: boolean): void {
    this.settling = on;
    document.removeEventListener('pointermove', this.watchPointer);
    if (on) {
      this.zone.runOutsideAngular(() => document.addEventListener('pointermove', this.watchPointer, { passive: true }));
    }
  }

  private readonly watchPointer = (event: PointerEvent): void => {
    if (!this.host.contains(event.target as Node | null)) {
      this.settle(false);
    }
  };

  private cancelHoverIntent(): void {
    if (this.hoverTimer !== null) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  private setFocused(focused: boolean): void {
    if (this.focused() === focused) {
      return;
    }
    this.focused.set(focused);
    this.host.classList.toggle(FOCUS_CLASS, focused);
    backdrop().classList.toggle(BACKDROP_ON_CLASS, focused);
  }

  private restore(): void {
    this.host.classList.remove(EXPANDED_CLASS);
    this.placeholder?.remove();
    this.placeholder = null;
    this.lockPage(false);
    this.keepScroll();
  }

  private scrimElement: HTMLElement | null = null;

  /**
   * Velo que oscurece la página de fondo mientras la tarjeta viaja (al ampliar aparece, al cerrar se va).
   * La página sigue viva bajo la transición, así que es un elemento normal con su propio fundido.
   */
  private scrim(on: boolean, leaving = false): void {
    if (!on) {
      this.scrimElement?.remove();
      this.scrimElement = null;
      return;
    }
    if (!this.animated || this.scrimElement) {
      return;
    }
    this.scrimElement = document.createElement('div');
    this.scrimElement.className = leaving ? `${SCRIM_CLASS} ${SCRIM_CLASS}-out` : SCRIM_CLASS;
    this.scrimElement.setAttribute('aria-hidden', 'true');
    // Junto a la tarjeta, en su mismo contexto de apilamiento: así queda justo debajo de ella.
    this.host.parentNode?.insertBefore(this.scrimElement, this.host);
  }

  private pageLocked = false;

  /** Mientras está ampliada, la página de fondo no se desplaza. */
  private lockPage(on: boolean): void {
    if (on === this.pageLocked) {
      return;
    }
    this.pageLocked = on;
    if (on) {
      this.previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      this.keepScroll();
    } else {
      document.body.style.overflow = this.previousBodyOverflow;
    }
  }

  /** La página de detrás no se mueve: ni al ampliar ni al volver. */
  private keepScroll(): void {
    if (Math.round(window.scrollY) !== Math.round(this.previousScroll)) {
      window.scrollTo({ top: this.previousScroll, behavior: 'instant' });
    }
  }

  /**
   * Cambia entre la celda y la pantalla completa con una transición de vista: el navegador toma una
   * instantánea de antes y otra de después, y mueve y funde las dos en la GPU. El contenido nunca se
   * deforma (cada instantánea conserva su proporción) y no se repinta nada mientras dura, así que es
   * ligera y fluida. Sin soporte del navegador, o con "reducir movimiento", el cambio es directo.
   */
  private morph(update: () => void, done: () => void = () => undefined, collapsing = false): void {
    this.transition?.skipTransition();
    const start = (document as Document & { startViewTransition?: (callback: () => void) => ViewTransition }).startViewTransition;
    if (!this.animated || typeof start !== 'function') {
      update();
      done();
      return;
    }
    const root = document.documentElement;
    this.host.style.setProperty('view-transition-name', this.transitionName);
    this.host.style.setProperty('view-transition-class', 'theater');
    root.classList.add(TRANSITION_CLASS);
    root.classList.toggle(COLLAPSING_CLASS, collapsing);
    const transition = start.call(document, update);
    this.transition = transition;
    // Si el navegador la salta (otra transición, la pestaña oculta…), el cambio se aplica igual sin animar:
    // no es un error.
    transition.ready.catch(() => undefined);
    transition.finished.catch(() => undefined).finally(() => {
      if (this.transition !== transition) {
        return;
      }
      this.transition = null;
      this.host.style.removeProperty('view-transition-name');
      this.host.style.removeProperty('view-transition-class');
      root.classList.remove(TRANSITION_CLASS, COLLAPSING_CLASS);
      done();
    });
  }
}

/** Velo compartido por todas las tarjetas: atenúa y desenfoca la página alrededor de la enfocada. */
function backdrop(): HTMLElement {
  let element = document.querySelector<HTMLElement>(`.${BACKDROP_CLASS}`);
  if (!element) {
    element = document.createElement('div');
    element.className = BACKDROP_CLASS;
    element.setAttribute('aria-hidden', 'true');
    document.body.appendChild(element);
  }
  return element;
}
