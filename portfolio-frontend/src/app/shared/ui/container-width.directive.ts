import { DestroyRef, Directive, ElementRef, NgZone, afterNextRender, inject, signal } from '@angular/core';

/**
 * Mide el ancho útil de su elemento y lo mantiene al día. Los diagramas deciden con él su
 * disposición: depende del hueco que tienen (una tarjeta estrecha en una tableta también cuenta),
 * no del ancho de la ventana.
 */
@Directive({
  selector: '[appContainerWidth]',
  standalone: true,
  exportAs: 'containerWidth',
})
export class ContainerWidthDirective {
  /**
   * Solo para tests: un ancho fijo en lugar del medido. El navegador de los tests unitarios tiene
   * la ventana que le toque; con esto cada test decide si prueba la disposición ancha o la estrecha.
   */
  static fixedWidth: number | null = null;

  /** Ancho interior en píxeles CSS; 0 hasta la primera medida. */
  readonly width = signal(ContainerWidthDirective.fixedWidth ?? 0);

  constructor() {
    const element: HTMLElement = inject(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    const zone = inject(NgZone);
    afterNextRender(() => {
      // Las medidas llegan fuera de la zona de Angular (aquí y en el ResizeObserver). Se vuelve a
      // entrar: si lo que se redibuja al cambiar el ancho se creara fuera, sus eventos no
      // refrescarían la vista a tiempo.
      const measure = (): void => {
        const next = ContainerWidthDirective.fixedWidth ?? Math.floor(element.clientWidth);
        if (next !== this.width()) {
          zone.run(() => this.width.set(next));
        }
      };
      measure();
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /**
   * ¿Cabe aquí algo de `natural` píxeles de ancho? Antes de la primera medida se decide por el
   * ancho de la ventana, para que un móvil no pinte primero la versión de escritorio.
   */
  narrowerThan(natural: number): boolean {
    const width = this.width();
    return width > 0 ? width < natural : typeof window !== 'undefined' && window.innerWidth < natural;
  }
}
