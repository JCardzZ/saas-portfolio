import { Directive, ElementRef, HostListener, OnDestroy, inject } from '@angular/core';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Mantiene el foco del teclado dentro del elemento mientras exista (diálogos modales)
 * y, al destruirse, lo devuelve a donde estaba antes de abrirlo.
 */
@Directive({
  selector: '[appFocusTrap]',
  standalone: true,
})
export class FocusTrapDirective implements OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }
    // Una trampa anidada (una alerta dentro del diálogo) es la única que decide.
    event.stopPropagation();

    const focusable = focusableWithin(this.host);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (!this.host.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  ngOnDestroy(): void {
    if (this.previouslyFocused?.isConnected) {
      this.previouslyFocused.focus();
    }
  }
}

/** Elementos que pueden recibir el foco con Tab dentro de `root`, en orden de documento. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.closest('[inert]') && element.getClientRects().length > 0,
  );
}
