import { Directive, ElementRef, HostListener, InjectionToken, OnDestroy, inject, signal } from '@angular/core';

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
/** Tiempo que el cursor debe quedarse sobre la tarjeta para considerarlo intención y no un paso de largo. */
export const HOVER_INTENT_MS = 300;
/** Controles propios de la tarjeta: tocarlos hace su función, no amplía. */
const INTERACTIVE = 'button, a, input, textarea, select, summary, [role="button"], [role="tab"], [role="switch"], [tabindex]';
const DURATION_MS = 550;
const SPRING = 'cubic-bezier(0.16, 1, 0.3, 1)';

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

  readonly expanded = signal(false);
  /** Nombre del diagrama, anunciado como título del diálogo. */
  readonly label = signal('Diagrama');

  /** Ocupa el hueco de la tarjeta en la rejilla mientras esta flota a pantalla completa. */
  private placeholder: HTMLElement | null = null;
  private previousBodyOverflow = '';
  private animation: Animation | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPointerType = '';

  /** La tarjeta está adelantada por intención de hover. */
  readonly focused = signal(false);

  @HostListener('pointerenter', ['$event'])
  onPointerEnter(event: PointerEvent): void {
    // Solo ratón: en táctil "pointerenter" llega con el toque y dejaría el efecto pegado.
    if (event.pointerType !== 'mouse' || !this.animated || this.expanded()) {
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
    this.animation?.cancel();
    this.cancelHoverIntent();
    this.setFocused(false);
    const from = this.host.getBoundingClientRect();

    this.placeholder = document.createElement('div');
    this.placeholder.setAttribute('aria-hidden', 'true');
    this.placeholder.style.height = `${from.height}px`;
    const style = getComputedStyle(this.host);
    this.placeholder.style.gridColumnStart = style.gridColumnStart;
    this.placeholder.style.gridColumnEnd = style.gridColumnEnd;
    this.host.parentNode?.insertBefore(this.placeholder, this.host);

    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.host.classList.add(EXPANDED_CLASS);
    this.expanded.set(true);

    this.animate(from, this.host.getBoundingClientRect(), 'in');
  }

  collapse(): void {
    if (!this.expanded()) {
      return;
    }
    this.expanded.set(false);
    const target = this.placeholder?.getBoundingClientRect();
    const finish = () => this.restore();

    if (target) {
      const animation = this.animate(target, this.host.getBoundingClientRect(), 'out');
      if (animation) {
        animation.onfinish = finish;
        return;
      }
    }
    finish();
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
    this.setFocused(false);
    this.animation?.cancel();
    if (this.placeholder) {
      this.restore();
    }
  }

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
    this.animation = null;
    document.body.style.overflow = this.previousBodyOverflow;
  }

  /**
   * Técnica FLIP: el elemento ya está en su posición final de pantalla completa y se anima
   * la transformación que lo hace coincidir con el rectángulo de la celda.
   */
  private animate(cell: DOMRect, full: DOMRect, direction: 'in' | 'out'): Animation | null {
    if (!this.animated || full.width === 0 || full.height === 0) {
      return null;
    }
    const atCell = {
      transformOrigin: 'top left',
      transform: `translate(${cell.left - full.left}px, ${cell.top - full.top}px) scale(${cell.width / full.width}, ${cell.height / full.height})`,
      borderRadius: '1.5rem',
    };
    const atFull = { transformOrigin: 'top left', transform: 'none', borderRadius: '0' };
    this.animation = this.host.animate(direction === 'in' ? [atCell, atFull] : [atFull, atCell], {
      duration: DURATION_MS,
      easing: SPRING,
    });
    return this.animation;
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
