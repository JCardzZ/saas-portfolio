import { Injectable, computed, inject, signal } from '@angular/core';

import { ArchitectureStudioService as ArchitectureStudioApi, PriceQuote } from '../../../core/api';
import { runtimeConfig } from '../../../core/config/runtime-config';
import { CloudProviderId } from './cloud-topology.data';

/**
 * De dónde salen los precios que se ven:
 * - `demo`: sin backend; solo hay cifras orientativas y se dice.
 * - `idle` / `loading`: aún no se ha preguntado, o se está preguntando.
 * - `live`: el backend respondió con lo que dicen las API públicas de los proveedores.
 * - `unavailable`: el backend no respondió; se sigue con las cifras orientativas.
 */
export type LivePricingState = 'demo' | 'idle' | 'loading' | 'live' | 'unavailable';

const PRICED: PriceQuote.StatusEnum[] = ['LIVE', 'CACHED', 'STALE'];

/**
 * Precios de lista reales de los servicios del lienzo, pedidos al backend
 * (`POST /public/architecture/pricing`), que es quien consulta las API de los proveedores y
 * retransmite cada consulta por SSE al inspector. El navegador nunca llama a esas API.
 * En modo demo no pide nada ni inventa precios.
 */
@Injectable({ providedIn: 'root' })
export class LivePricingService {
  private readonly api = inject(ArchitectureStudioApi);

  private readonly _quotes = signal<Partial<Record<CloudProviderId, Record<string, PriceQuote>>>>({});
  private readonly _state = signal<LivePricingState>(runtimeConfig.mockMode ? 'demo' : 'idle');
  readonly state = this._state.asReadonly();
  /** Última petición lanzada: una respuesta más antigua que llegue tarde se descarta. */
  private sequence = 0;

  /** Cotizaciones recibidas para una nube, por código de servicio. */
  quotesFor(provider: CloudProviderId): Record<string, PriceQuote> {
    return this._quotes()[provider] ?? {};
  }

  /** Coste mensual real (USD, una unidad) de cada servicio con precio de lista en esa nube. */
  monthlyFor(provider: CloudProviderId): Record<string, number> {
    return Object.fromEntries(Object.values(this.quotesFor(provider))
      .filter((quote) => PRICED.includes(quote.status) && typeof quote.monthlyCost === 'number' && quote.monthlyCost > 0 && (quote.currency ?? 'USD') === 'USD')
      .map((quote) => [quote.code, quote.monthlyCost as number]));
  }

  readonly anyQuote = computed(() => Object.keys(this._quotes()).length > 0);

  /** Pide las cotizaciones de los servicios del lienzo. En modo demo no hace nada. */
  refresh(provider: CloudProviderId, serviceCodes: string[]): void {
    if (runtimeConfig.mockMode) {
      this._state.set('demo');
      return;
    }
    const services = [...new Set(serviceCodes)].filter((code) => /^[A-Za-z0-9_-]{1,48}$/.test(code)).slice(0, 60);
    if (services.length === 0) {
      return;
    }
    const current = ++this.sequence;
    this._state.set('loading');
    this.api.publicArchitecturePricingPost({ cloudProvider: provider, services }).subscribe({
      next: (response) => {
        if (current !== this.sequence) {
          return;
        }
        const quotes = Object.fromEntries((response.quotes ?? []).filter(isQuote).map((quote) => [quote.code, quote]));
        this._quotes.update((all) => ({ ...all, [provider]: { ...all[provider], ...quotes } }));
        this._state.set('live');
      },
      error: () => {
        if (current === this.sequence) {
          this._state.set('unavailable');
        }
      },
    });
  }
}

/** Lo que llega del backend se comprueba antes de usarlo: código y estado conocidos. */
function isQuote(quote: unknown): quote is PriceQuote {
  const candidate = quote as PriceQuote | null;
  return !!candidate && typeof candidate.code === 'string'
    && ['LIVE', 'CACHED', 'STALE', 'UNKNOWN_PRICING', 'UNESTIMATED_ENTERPRISE_LICENSE'].includes(candidate.status);
}
