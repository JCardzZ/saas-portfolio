import { Directive, ElementRef, OnDestroy, afterNextRender, inject } from '@angular/core';

/**
 * Lleva su elemento al final de `<body>` mientras exista. Para lo que debe quedar por encima de
 * toda la página (una hoja modal) aunque se declare dentro de una tarjeta que crea su propio
 * contexto de apilamiento, donde un `z-index` no competiría con el resto de la página.
 */
@Directive({
  selector: '[appPortal]',
  standalone: true,
})
export class PortalDirective implements OnDestroy {
  private readonly element: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    // Tras el primer pintado: antes, Angular aún no ha colocado el elemento en su vista y lo
    // devolvería a ella.
    afterNextRender(() => document.body.appendChild(this.element));
  }

  ngOnDestroy(): void {
    this.element.remove();
  }
}
