import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, of, timeout } from 'rxjs';

import { runtimeConfig } from '../../../core/config/runtime-config';

/** Estado de una pieza según /telemetry/health. */
export type ComponentState = 'ok' | 'degraded' | 'down';

export interface LiveHealth {
  /** `UP`, `DEGRADED` o `DOWN` (503: la base de datos no responde). */
  status: string;
  database: string | null;
  redisCache: string | null;
  aiEngine: string | null;
  /** Cuándo se comprobó y cuánto tardó la respuesta. */
  checkedAt: Date;
  latencyMs: number;
}

export type LiveHealthState =
  | { kind: 'idle' | 'loading' }
  /** En modo demo no hay API real: no se muestra ningún estado (nada simulado como si fuera real). */
  | { kind: 'demo' }
  | { kind: 'unreachable' }
  | { kind: 'ready'; health: LiveHealth };

const TIMEOUT_MS = 8000;

/**
 * Salud real de la API desplegada, leída una vez por visita de /telemetry/health. Alimenta la vista
 * «Arquitectura en producción» y el historial de despliegues: lo que se pinta en verde lo ha dicho
 * la propia API, no un archivo escrito a mano.
 */
@Injectable({ providedIn: 'root' })
export class LiveHealthService {
  private readonly http = inject(HttpClient);
  private readonly _state = signal<LiveHealthState>({ kind: 'idle' });
  readonly state = this._state.asReadonly();

  load(): void {
    if (this._state().kind !== 'idle') {
      return;
    }
    if (runtimeConfig.mockMode) {
      this._state.set({ kind: 'demo' });
      return;
    }
    this._state.set({ kind: 'loading' });
    const started = performance.now();
    this.http.get<Record<string, unknown>>(`${runtimeConfig.apiBaseUrl}/telemetry/health`).pipe(
      timeout(TIMEOUT_MS),
      map((body) => parseHealth(body, started)),
      // 503: la API responde, pero sin base de datos. Es un estado real, no una caída de red.
      catchError((error: unknown) => of(error instanceof HttpErrorResponse && error.status === 503
        ? parseHealth({ status: 'DOWN', database: 'Database - Unavailable' }, started)
        : null)),
    ).subscribe((health) => this._state.set(health ? { kind: 'ready', health } : { kind: 'unreachable' }));
  }
}

export function parseHealth(body: Record<string, unknown> | null, started: number): LiveHealth | null {
  if (!body || typeof body['status'] !== 'string') {
    return null;
  }
  const text = (value: unknown) => (typeof value === 'string' && value.length <= 120 ? value : null);
  const breakers = body['circuitBreakers'] as Record<string, unknown> | undefined;
  return {
    status: body['status'],
    database: text(body['database']),
    redisCache: text(body['redisCache']),
    aiEngine: text(breakers?.['aiEngine']),
    checkedAt: new Date(),
    latencyMs: Math.max(0, Math.round(performance.now() - started)),
  };
}

/**
 * Estado de la pieza que declara `field` en deploy/topology.json (`status`, `database`,
 * `redisCache`, `aiEngine`). La API describe cada componente con un texto que termina en
 * «Unavailable» cuando falla; el circuito de la IA está sano solo si está CLOSED.
 */
export function componentState(health: LiveHealth, field: string): ComponentState | null {
  switch (field) {
    case 'status':
      return health.status === 'UP' ? 'ok' : health.status === 'DEGRADED' ? 'degraded' : 'down';
    case 'database':
    case 'redisCache': {
      const value = health[field];
      return value === null ? null : /unavailable/i.test(value) ? 'down' : 'ok';
    }
    case 'aiEngine':
      return health.aiEngine === null ? null : health.aiEngine === 'CLOSED' ? 'ok' : health.aiEngine === 'HALF_OPEN' ? 'degraded' : 'down';
    default:
      return null;
  }
}

/** Lo que dice la API de esa pieza, tal cual, para la ficha. */
export function componentDetail(health: LiveHealth, field: string): string | null {
  switch (field) {
    case 'status':
      return `${health.status} · ${health.latencyMs} ms`;
    case 'database':
      return health.database;
    case 'redisCache':
      return health.redisCache;
    case 'aiEngine':
      return health.aiEngine === null ? null : `Circuit breaker ${health.aiEngine}`;
    default:
      return null;
  }
}
