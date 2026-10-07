import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/**
 * Enfoca el elemento en cuanto se inserta en la página. A diferencia del atributo
 * `autofocus`, funciona con contenido que aparece después de la carga (diálogos, alertas).
 */
@Directive({
  selector: '[appAutofocus]',
  standalone: true,
})
export class AutofocusDirective implements AfterViewInit {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  ngAfterViewInit(): void {
    this.host.focus();
  }
}
