import { Injectable, signal } from '@angular/core';

/**
 * Lo que la malla de red del fondo ha dibujado como tráfico: cuántas ráfagas salieron de eventos
 * reales del backend (SSE) y cuántas de eventos simulados en el navegador. Lo escribe el fondo y lo
 * lee su leyenda, para que el visitante sepa qué está viendo.
 */
@Injectable({ providedIn: 'root' })
export class MeshTrafficService {
  /** La malla se está dibujando (no en móviles, sin WebGL ni con ahorro de datos). */
  readonly rendering = signal(false);
  readonly real = signal(0);
  readonly simulated = signal(0);

  count(real: boolean): void {
    (real ? this.real : this.simulated).update((value) => value + 1);
  }
}
