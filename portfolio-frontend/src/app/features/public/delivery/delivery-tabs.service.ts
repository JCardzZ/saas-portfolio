import { Injectable, signal } from '@angular/core';

/** Vistas de «Arquitectura real y entrega», en el orden de sus pestañas. */
export type DeliveryTab = 'arquitectura' | 'historial' | 'pipeline' | 'despliegues';

export const DELIVERY_TABS: readonly DeliveryTab[] = ['arquitectura', 'historial', 'pipeline', 'despliegues'];

/** Ancla de cada pestaña: `#entrega-pipeline` abre la sección con esa vista. */
export const tabAnchor = (tab: DeliveryTab) => `entrega-${tab}`;

export function tabFromHash(hash: string): DeliveryTab | null {
  const id = hash.replace(/^#/, '');
  return DELIVERY_TABS.find((tab) => tabAnchor(tab) === id) ?? null;
}

/**
 * Pestaña abierta en la sección de entrega. Es de la raíz porque la leen otras piezas de la página:
 * el robot cambia su frase según la vista y la paleta de comandos abre la que se busca.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryTabsService {
  private readonly _active = signal<DeliveryTab>('arquitectura');
  private readonly _visited = signal<ReadonlySet<DeliveryTab>>(new Set(['arquitectura']));

  readonly active = this._active.asReadonly();
  /** Vistas ya abiertas en esta visita: la barra marca el recorrido para que no se quede nada sin ver. */
  readonly visited = this._visited.asReadonly();

  select(tab: DeliveryTab): void {
    this._active.set(tab);
    if (!this._visited().has(tab)) {
      this._visited.update((seen) => new Set([...seen, tab]));
    }
  }
}
