import { Injectable, signal } from '@angular/core';

import { TechIconKey } from '../../../shared/ui/tech-icons';

export type SystemEventKind = 'ok' | 'cache' | 'vector' | 'ai' | 'auth' | 'info' | 'warn';

export interface SystemEvent {
  id: number;
  time: string;
  kind: SystemEventKind;
  tag: string;
  detail: string;
  /** `live`: llegó del backend por SSE. `simulated`: generado en el navegador. */
  origin: 'live' | 'simulated';
  /** Provocado por una acción del visitante (chat, mapa vectorial, ingesta), no por el flujo ambiental. */
  fromUser: boolean;
  /** Tecnologías que intervienen en el evento; permite filtrar la traza por componente. */
  techs: TechIconKey[];
  /** Retraso de entrada en ms, para que una ráfaga se lea como una secuencia. */
  stagger: number;
  /** Pieza concreta de un diagrama a la que pertenece (id del nodo), si el evento es solo suyo. */
  component?: string;
}

export type SystemEventStep = [kind: SystemEventKind, tag: string, detail?: string];

const MAX_EVENTS = 80;
const STAGGER_MS = 110;

/**
 * Flujo de eventos que alimenta la consola de la landing. Mezcla dos orígenes, siempre
 * distinguibles por `origin`: eventos reales del backend (SSE) y simulaciones del navegador.
 */
@Injectable({ providedIn: 'root' })
export class SystemEventsService {
  private readonly _events = signal<SystemEvent[]>([]);
  private nextId = 1;

  readonly events = this._events.asReadonly();

  /** El stream real está conectado: las simulaciones de actividad del backend sobran. */
  readonly live = signal(false);

  /** Evento ambiental simulado. */
  emit(kind: SystemEventKind, tag: string, detail = ''): void {
    this.push([[kind, tag, detail]], false, 'simulated');
  }

  /** Evento real recibido del backend. */
  emitLive(kind: SystemEventKind, tag: string, detail: string, at: Date): void {
    this.push([[kind, tag, detail]], false, 'live', at);
  }

  /** Secuencia simulada por un widget ante una acción del visitante: entra escalonada y marcada como suya. */
  emitFromUser(steps: SystemEventStep[], component?: string): void {
    this.push(steps, true, 'simulated', new Date(), component);
  }

  /**
   * Simula lo que haría el backend con una acción del visitante (p. ej. una pregunta al chat).
   * Con el stream real conectado no hace nada: los eventos de verdad llegan por SSE.
   */
  emitBackendSimulation(steps: SystemEventStep[]): void {
    if (!this.live()) {
      this.push(steps, true, 'simulated');
    }
  }

  private push(steps: SystemEventStep[], fromUser: boolean, origin: SystemEvent['origin'], at = new Date(), component?: string): void {
    const time = timestamp(at);
    const added = steps.map(([kind, tag, detail = ''], index) => ({
      id: this.nextId++, time, kind, tag, detail, fromUser, origin, techs: techsOf(tag, detail),
      stagger: index * STAGGER_MS, component,
    }));
    this._events.update((events) => [...events, ...added].slice(-MAX_EVENTS));
  }
}

function timestamp(now: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

/**
 * Tecnologías implicadas en un evento, deducidas de su texto. Vale igual para los eventos
 * reales y los simulados, porque ambos usan el mismo vocabulario. Un evento puede tocar varias:
 * un acierto de caché en una petición del catálogo implica a Redis, a la API y al frontend.
 */
const TECH_RULES: [tech: TechIconKey, pattern: RegExp][] = [
  ['redis', /redis|cachehit|cachemiss|cache-aside|rate.?limit|TTL/i],
  ['postgresql', /postgres|pgvector|document_embeddings|UPSERT|tenant_id|HNSW|SQL/i],
  ['gemini', /gemini|embed|generateContent|RAG query|circuitbreaker|aiEngine/i],
  ['jwt', /jwt|ROLE_/i],
  ['spring', /\b(GET|POST|PUT|DELETE) \/|\b(200|429|503)\b|ingest|spring boot/i],
  ['angular', /\b(GET|POST) \/(public|ai)\b/i],
  ['terraform', /terraform|deploying node|destroying node|route table|^(check|warning):/i],
  ['kubernetes', /kubernetes|\b(EKS|GKE|AKS)\b/i],
  ['cloudflare', /cloudflare/i],
  ['githubActions', /github actions/i],
  ['docker', /docker|contenedor/i],
  ['aws', /\bAWS\b/],
  ['gcp', /\bGCP\b/],
  ['azure', /\bAzure\b/],
];

export function techsOf(tag: string, detail: string): TechIconKey[] {
  const text = `${tag} ${detail}`;
  return TECH_RULES.filter(([, pattern]) => pattern.test(text)).map(([tech]) => tech);
}
