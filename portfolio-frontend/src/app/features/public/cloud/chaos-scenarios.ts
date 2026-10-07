import { TechIconKey } from '../../../shared/ui/tech-icons';
import { SystemEventStep } from '../data/system-events.service';

export type ChaosLevel = 'down' | 'warn' | 'ok';

export interface ChaosPhase {
  /** Nombre corto de la fase, para la línea de progreso. */
  step: string;
  /** Qué está pasando, en una frase. */
  caption: string;
  /** Estado que se rotula sobre cada nodo afectado (por id). */
  nodes: Record<string, { label: string; level: ChaosLevel }>;
  /** Estado de cada conexión afectada, con clave `origen>destino`. */
  wires: Record<string, ChaosLevel>;
  /** Eventos para el inspector. `{id}` se sustituye por el nombre del servicio en la nube activa. */
  events: SystemEventStep[];
}

export interface ChaosScenario {
  id: string;
  name: string;
  summary: string;
  /** Nodos que deben seguir en el lienzo para poder simularlo. */
  requires: string[];
  /** Tecnología cuya traza se abre en el inspector. */
  inspect: TechIconKey;
  /** Qué parte del comportamiento implementa de verdad el backend y cuál es supuesta. */
  basis: string;
  phases: ChaosPhase[];
}

/** Duración de cada fase y pausa final antes de limpiar el lienzo. */
export const CHAOS_PHASE_MS = 2200;
export const CHAOS_SETTLE_MS = 2600;

/**
 * Escenarios de fallo SIMULADOS sobre el diagrama. La secuencia reproduce cómo responde la
 * plataforma: el fail-open de la caché, el circuit breaker `aiEngine` y el 503 de
 * `/telemetry/health` existen en el backend; el autoescalado y la conmutación de la base de
 * datos son lo que haría la nube con un despliegue en varias zonas.
 */
export const CHAOS_SCENARIOS: ChaosScenario[] = [
  {
    id: 'redis-down', name: 'Caída de caché Redis', summary: 'La caché deja de responder', requires: ['redis', 'api', 'postgres'], inspect: 'redis',
    basis: 'Real en el backend: timeout de 2 s y fail-open a PostgreSQL (RedisCacheAdapter). No hay circuit breaker en la caché.',
    phases: [
      {
        step: 'Fallo', caption: '{redis} no responde: las lecturas de caché agotan el timeout de 2 s.',
        nodes: { redis: { label: 'DOWN', level: 'down' } }, wires: { 'api>redis': 'down' },
        events: [['warn', 'Redis Timeout', '{redis} · sin respuesta en 2 s'], ['warn', 'CacheMiss', 'portfolio:projects:all · caché no disponible']],
      },
      {
        step: 'Fallback', caption: 'Fail-open: la API ignora la caché y lee directamente de {postgres}.',
        nodes: { redis: { label: 'DOWN', level: 'down' }, api: { label: 'FAIL-OPEN', level: 'warn' } },
        wires: { 'api>redis': 'down', 'api>postgres': 'warn' },
        events: [['ok', 'Fallback Active', 'Redis fail-open → lectura directa en PostgreSQL'], ['ok', '200 OK', 'GET /public/projects · sin caché (+38 ms)']],
      },
      {
        step: 'Prueba', caption: '{redis} vuelve a aceptar conexiones; la siguiente lectura la comprueba.',
        nodes: { redis: { label: 'RECOVERY', level: 'warn' } }, wires: { 'api>redis': 'warn' },
        events: [['info', 'Recovery Test', 'Redis PING → PONG · {redis}']],
      },
      {
        step: 'Estable', caption: 'Caché repoblada: las lecturas vuelven a servirse desde {redis}.',
        nodes: { redis: { label: 'UP', level: 'ok' } }, wires: {},
        events: [['ok', 'Cache Restored', 'Redis cache-aside repoblada · TTL 10 min']],
      },
    ],
  },
  {
    id: 'gemini-latency', name: 'Pico de latencia RAG (Gemini)', summary: 'El proveedor de IA se degrada', requires: ['gemini', 'api'], inspect: 'gemini',
    basis: 'Real en el backend: circuit breaker aiEngine de Resilience4j (se abre con el 50 % de fallos en 10 llamadas y prueba de nuevo a los 30 s). Aquí el tiempo va acelerado.',
    phases: [
      {
        step: 'Fallo', caption: 'Gemini responde en más de 8 s: las preguntas al asistente agotan el timeout.',
        nodes: { gemini: { label: 'LATENCIA 8 s', level: 'warn' }, api: { label: 'CB CLOSED', level: 'warn' } }, wires: { 'api>gemini': 'warn' },
        events: [['warn', 'Gemini generateContent', 'latencia 8,2 s · timeout'], ['warn', 'CircuitBreaker aiEngine', '5 de 10 llamadas fallidas (50 %)']],
      },
      {
        step: 'Fallback', caption: 'El circuito se abre: la API deja de llamar a Gemini y responde 503 al instante. El CMS sigue funcionando.',
        nodes: { gemini: { label: 'AISLADO', level: 'down' }, api: { label: 'CB OPEN', level: 'down' } }, wires: { 'api>gemini': 'down' },
        events: [['warn', 'CircuitBreaker OPEN', 'aiEngine · sin llamadas a Gemini durante 30 s'], ['ok', 'Fallback Active', '503 RFC 7807 inmediato · Gemini aislado, el catálogo sigue respondiendo']],
      },
      {
        step: 'Prueba', caption: 'Pasada la espera, el circuito deja pasar una llamada de prueba.',
        nodes: { gemini: { label: 'PRUEBA', level: 'warn' }, api: { label: 'CB HALF-OPEN', level: 'warn' } }, wires: { 'api>gemini': 'warn' },
        events: [['info', 'Recovery Test', 'CircuitBreaker HALF_OPEN · llamada de prueba a Gemini']],
      },
      {
        step: 'Estable', caption: 'La prueba responde a tiempo: el circuito se cierra y el asistente vuelve.',
        nodes: { api: { label: 'CB CLOSED', level: 'ok' } }, wires: {},
        events: [['ok', 'CircuitBreaker CLOSED', 'aiEngine · Gemini responde en 640 ms']],
      },
    ],
  },
  {
    id: 'api-saturation', name: 'Saturación de API Spring Boot', summary: 'Más tráfico del que caben en las réplicas', requires: ['api', 'lb'], inspect: 'spring',
    basis: 'Real en el backend: los límites de peticiones (429). Supuesto: el autoescalado y las comprobaciones de salud del balanceador, que dependen del despliegue.',
    phases: [
      {
        step: 'Fallo', caption: '{api} al 96 % de CPU: suben las latencias y aparecen errores.',
        nodes: { api: { label: 'CPU 96 %', level: 'down' } }, wires: { 'lb>api': 'down' },
        events: [['warn', '503 Service Unavailable', 'GET /public/projects · API Spring Boot saturada (p95 4,1 s)'], ['warn', '429 Too Many Requests', 'POST /ai/rag/query · el límite de peticiones protege a Spring Boot']],
      },
      {
        step: 'Fallback', caption: '{lb} retira las réplicas que no pasan la comprobación de salud y la plataforma añade más.',
        nodes: { api: { label: 'ESCALANDO', level: 'warn' }, lb: { label: 'HEALTH CHECK', level: 'warn' } }, wires: { 'lb>api': 'warn', 'edge>lb': 'warn' },
        events: [['ok', 'Fallback Active', 'GET /public/* servido desde la caché del borde mientras escala Spring Boot'], ['info', 'Autoscaling', '{api} · Spring Boot 2 → 4 réplicas']],
      },
      {
        step: 'Prueba', caption: 'Las réplicas nuevas pasan la comprobación de salud y entran en el reparto.',
        nodes: { api: { label: 'RECOVERY', level: 'warn' } }, wires: { 'lb>api': 'warn' },
        events: [['info', 'Recovery Test', 'GET /telemetry/health · Spring Boot UP en las 4 réplicas']],
      },
      {
        step: 'Estable', caption: 'Con 4 réplicas la latencia vuelve a su nivel normal.',
        nodes: { api: { label: '4 RÉPLICAS', level: 'ok' } }, wires: {},
        events: [['ok', '200 OK', 'GET /public/projects · Spring Boot p95 180 ms']],
      },
    ],
  },
  {
    id: 'db-failover', name: 'Failover de base de datos', summary: 'Cae la instancia primaria', requires: ['postgres', 'api'], inspect: 'postgresql',
    basis: 'Real en el backend: /telemetry/health responde 503 sin base de datos y los listados en caché siguen sirviéndose hasta su TTL. Supuesto: la réplica en espera, que exige un despliegue en varias zonas.',
    phases: [
      {
        step: 'Fallo', caption: 'La instancia primaria de {postgres} deja de responder.',
        nodes: { postgres: { label: 'PRIMARIA CAÍDA', level: 'down' } }, wires: { 'api>postgres': 'down' },
        events: [['warn', 'PostgreSQL Connection Lost', '{postgres} · la primaria no responde'], ['warn', '503 Service Unavailable', 'GET /telemetry/health · PostgreSQL DOWN']],
      },
      {
        step: 'Fallback', caption: 'La réplica en espera se promueve; mientras, los listados salen de la caché.',
        nodes: { postgres: { label: 'FAILOVER', level: 'warn' }, api: { label: 'SOLO CACHÉ', level: 'warn' } },
        wires: { 'api>postgres': 'down', 'api>redis': 'warn' },
        events: [['ok', 'Fallback Active', 'PostgreSQL conmutando · lecturas del catálogo desde la caché (TTL 10 min)'], ['info', 'PostgreSQL Failover', 'réplica en espera promovida a primaria']],
      },
      {
        step: 'Prueba', caption: 'La API reabre el pool de conexiones contra la nueva primaria.',
        nodes: { postgres: { label: 'RECOVERY', level: 'warn' } }, wires: { 'api>postgres': 'warn' },
        events: [['info', 'Recovery Test', 'PostgreSQL SELECT 1 · pool de conexiones restablecido']],
      },
      {
        step: 'Estable', caption: 'Lecturas y escrituras restablecidas sobre la nueva primaria.',
        nodes: { postgres: { label: 'PRIMARIA OK', level: 'ok' } }, wires: {},
        events: [['ok', 'PostgreSQL Primary Ready', '{postgres} · /telemetry/health UP']],
      },
    ],
  },
];
