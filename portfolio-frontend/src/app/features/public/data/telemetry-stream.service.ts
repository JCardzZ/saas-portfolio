import { Injectable, InjectionToken, inject, signal } from '@angular/core';

import { runtimeConfig } from '../../../core/config/runtime-config';
import { TelemetryEvent } from '../../../core/api';
import { SystemEventKind, SystemEventsService, SystemEventLevel } from './system-events.service';

export interface TelemetryStreamConfig {
  /** Con `false` nunca se abre la conexión (modo demo). */
  enabled: boolean;
  url: string;
  /** Fallos seguidos, sin llegar a conectar, tras los que se deja de reintentar. */
  maxFailures: number;
}

export const TELEMETRY_STREAM_CONFIG = new InjectionToken<TelemetryStreamConfig>('TELEMETRY_STREAM_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    enabled: !runtimeConfig.mockMode,
    url: `${runtimeConfig.apiBaseUrl}/telemetry/live-stream`,
    maxFailures: 3,
  }),
});

/** Punto de sustitución para los tests: el navegador no deja simular un EventSource real. */
export const EVENT_SOURCE_FACTORY = new InjectionToken<(url: string) => EventSource>('EVENT_SOURCE_FACTORY', {
  providedIn: 'root',
  factory: () => (url: string) => new EventSource(url),
});

export type TelemetryStatus = 'simulated' | 'connecting' | 'live';

const CLOSED = 2;

const PRESENTATION: Record<TelemetryEvent.EventTypeEnum, [kind: SystemEventKind, tag: string, level?: SystemEventLevel]> = {
  CACHE_HIT: ['ok', '200 OK CacheHit Redis'],
  CACHE_MISS: ['cache', 'CacheMiss → PostgreSQL'],
  VECTOR_SEARCH: ['vector', 'pgvector CosineDistance'],
  RAG_QUERY: ['ai', 'RAG query'],
  JWT_VERIFIED: ['auth', 'JWT Verified'],
  // Motor de precios: cada consulta a la API pública de un proveedor y lo que resulta de ella.
  PRICING_REQUEST: ['info', 'FinOps Engine', 'INFO'],
  PRICING_CACHED: ['ok', 'FinOps Cache', 'SUCCESS'],
  PRICING_UNESTIMATED: ['warn', 'FinOps Engine', 'WARN'],
  PRICING_FALLBACK: ['warn', 'FinOps Engine', 'WARN'],
  // Una llamada a una herramienta del servidor MCP: solo cuál, cómo acabó y cuánto tardó.
  MCP_TOOL_CALL: ['ai', 'MCP tool'],
};

/**
 * Conecta la consola con el stream SSE de telemetría del backend. Si está desactivado, no
 * llega a conectar o se corta sin remedio, el estado vuelve a `simulated` y la consola
 * sigue funcionando con su generador de respaldo.
 */
@Injectable({ providedIn: 'root' })
export class TelemetryStreamService {
  private readonly config = inject(TELEMETRY_STREAM_CONFIG);
  private readonly createEventSource = inject(EVENT_SOURCE_FACTORY);
  private readonly events = inject(SystemEventsService);

  private readonly _status = signal<TelemetryStatus>('simulated');
  readonly status = this._status.asReadonly();

  private source: EventSource | null = null;
  private failures = 0;
  /** Quién necesita el stream (la consola, la malla del fondo): se cierra cuando ya no queda nadie. */
  private users = 0;

  /** Pide el stream para un componente; ciérralo con `release()` al destruirlo. */
  acquire(): void {
    this.users++;
    this.connect();
  }

  release(): void {
    this.users = Math.max(0, this.users - 1);
    if (this.users === 0) {
      this.disconnect();
    }
  }

  connect(): void {
    if (!this.config.enabled || this.source) {
      return;
    }
    this.failures = 0;
    this._status.set('connecting');

    const source = this.createEventSource(this.config.url);
    this.source = source;
    source.onopen = () => {
      this.failures = 0;
      this.setLive(true);
    };
    source.onmessage = (message) => this.handle(message.data);
    source.onerror = () => {
      this.failures++;
      // El navegador reintenta solo mientras no cierre la conexión; se le deja hacerlo unas pocas veces.
      if (source.readyState === CLOSED || this.failures >= this.config.maxFailures) {
        this.disconnect();
      } else {
        this.setLive(false);
        this._status.set('connecting');
      }
    };
  }

  disconnect(): void {
    this.source?.close();
    this.source = null;
    this.setLive(false);
  }

  private setLive(live: boolean): void {
    this._status.set(live ? 'live' : 'simulated');
    this.events.live.set(live);
  }

  private handle(data: unknown): void {
    const event = parse(data);
    if (!event) {
      return;
    }
    const [kind, tag, level] = PRESENTATION[event.eventType] ?? ['info', event.eventType];
    const at = new Date(event.timestamp);
    this.events.emitLive(kind, tag, event.details ?? '', Number.isNaN(at.getTime()) ? new Date() : at, level);
  }
}

// El contenido llega de la red: se valida antes de mostrarlo.
function parse(data: unknown): TelemetryEvent | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const event = JSON.parse(data) as Partial<TelemetryEvent> | null;
    return event && typeof event.eventType === 'string' ? (event as TelemetryEvent) : null;
  } catch {
    return null;
  }
}
