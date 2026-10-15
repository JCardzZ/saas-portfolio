import { TechIconKey } from '../../../shared/ui/tech-icons';
import { SystemEventStep } from '../data/system-events.service';

export interface ComponentTelemetry {
  /** Tecnología con traza propia que aloja el nodo: sus eventos también se ven al inspeccionarlo. */
  tech: TechIconKey | null;
  /** Muestra de telemetría que se inyecta al pulsar el nodo. `{name}` es el servicio en la nube activa. */
  steps: SystemEventStep[];
}

/**
 * Telemetría de MUESTRA de cada tipo de nodo: lo que se vería en sus logs en funcionamiento
 * normal. Es simulada (el inspector la marca como tal). En las piezas que existen en la
 * plataforma usa sus datos reales: claves de caché, TTL de 10 minutos, vectores de 768
 * dimensiones, índice HNSW, límite de peticiones con Lua y circuit breaker `aiEngine`.
 */
const TELEMETRY: Record<string, ComponentTelemetry> = {
  users: { tech: 'angular', steps: [
    ['info', 'GET /', 'SPA Angular · 200 desde el borde'],
    ['info', 'GET /public/projects', 'catálogo del portafolio'],
    ['ai', 'POST /ai/rag/query', 'pregunta al asistente'],
  ] },
  edge: { tech: 'cloudflare', steps: [
    ['ok', 'Cloudflare Edge Cache HIT', '/main.js · 4 ms'],
    ['info', 'Cloudflare WAF Rule Evaluated', '0 peticiones bloqueadas'],
    ['info', 'TLS 1.3 Handshake', 'Cloudflare → origen'],
  ] },
  static: { tech: null, steps: [
    ['ok', 'CDN Cache HIT', '{name} · index.html'],
    ['info', 'Object GET', 'main.js · gzip'],
    ['info', 'Cache-Control', 'ficheros con hash: inmutables 1 año'],
  ] },
  lb: { tech: null, steps: [
    ['ok', 'Health Check 200', '{name} → GET /v1/telemetry/health'],
    ['info', 'Target Registered', '2 réplicas sanas'],
    ['info', 'TLS Terminated', '{name} · HTTP hacia la subred privada'],
  ] },
  containers: { tech: 'spring', steps: [
    ['info', 'HikariPool-1 Active', 'conexiones 3 de 10'],
    ['auth', 'Spring Security Auth OK', 'JWT válido · sin sesión en servidor'],
    ['ok', 'RFC 7807 Exception Handler Ready', 'GlobalExceptionHandler · ProblemDetail'],
    ['ok', '200 OK', 'GET /public/projects · 12 ms'],
  ] },
  postgres: { tech: 'postgresql', steps: [
    ['vector', 'pgvector CosineDistance: 0.12', 'document_embeddings · top-5'],
    ['info', 'HNSW Index Scan', 'vector(768) · filtro tenant_id antes de ordenar'],
    ['ok', 'Transaction Committed', 'UPSERT projects · 4 ms'],
  ] },
  redis: { tech: 'redis', steps: [
    ['cache', 'CacheHit key: portfolio:projects:all', 'Redis · 1 ms'],
    ['info', 'TTL 600s', 'cache-aside · se repuebla desde PostgreSQL al caducar'],
    ['info', 'RateLimit Lua', 'ventana fija atómica · /auth/token 5 por minuto'],
  ] },
  gemini: { tech: 'gemini', steps: [
    ['ai', 'Embedding Vector Generation', 'Gemini embedQuery · 768 dimensiones'],
    ['ai', 'RAG Prompt Context Injected', '5 fragmentos con sus fuentes'],
    ['ai', 'GeminiFlash 120 tokens/s', 'generateContent'],
    ['ok', 'CircuitBreaker aiEngine', 'CLOSED'],
  ] },
  secrets: { tech: null, steps: [
    ['auth', 'Secret Read', '{name} · JWT_SECRET, versión vigente'],
    ['info', 'Access Policy', 'solo la identidad de la API puede leer'],
    ['info', 'Audit Log', 'acceso registrado'],
  ] },
  vault: { tech: null, steps: [
    ['auth', 'Vault Token Renewed', 'identidad de la API'],
    ['info', 'Dynamic Credentials Issued', 'PostgreSQL · caducan en 1 h'],
  ] },
  'native-monitoring': { tech: null, steps: [
    ['info', 'Logs Ingested', '{name} · salida estándar de la API'],
    ['ok', 'Alarm OK', 'p95 de latencia por debajo del umbral'],
    ['info', 'Metric Scraped', '/actuator · JVM y pool de conexiones'],
  ] },
  registry: { tech: 'docker', steps: [
    ['ok', 'Image Pulled', '{name} · portfolio-backend:latest'],
    ['info', 'Image Scan', '0 vulnerabilidades críticas'],
  ] },
  cicd: { tech: 'terraform', steps: [
    ['info', 'Terraform Plan', 'sin cambios pendientes'],
    ['ok', 'Docker Image Pushed', 'imagen del backend publicada en el registro'],
  ] },
  kubernetes: { tech: 'kubernetes', steps: [
    ['ok', 'Kubernetes Pod Ready', '{name} · 2 de 2 réplicas'],
    ['info', 'Kubernetes HPA', 'CPU 41 % · sin escalar'],
    ['info', 'Kubernetes Readiness Probe', '/v1/telemetry/health · 200'],
  ] },
  functions: { tech: null, steps: [
    ['info', 'Cold Start', '{name} · 310 ms'],
    ['ok', 'Invocation OK', 'duración 42 ms · 128 MB'],
  ] },
  rabbitmq: { tech: null, steps: [
    ['info', 'Message Published', 'exchange portfolio.events · routing key rag.reindex'],
    ['ok', 'Message Acked', 'cola rag.reindex · 1 consumidor'],
    ['info', 'Queue Depth', '0 mensajes pendientes'],
  ] },
  streaming: { tech: null, steps: [
    ['info', 'Record Produced', '{name} · topic portfolio.events, partición 2'],
    ['ok', 'Consumer Group Stable', 'lag 0'],
    ['info', 'ISR', '3 de 3 réplicas sincronizadas'],
  ] },
  queue: { tech: null, steps: [
    ['info', 'Message Sent', '{name} · cola rag-reindex'],
    ['ok', 'Message Deleted', 'procesado en 180 ms'],
    ['info', 'Dead-letter Queue', '0 mensajes'],
  ] },
  nosql: { tech: null, steps: [
    ['ok', 'GetItem', '{name} · 3 ms'],
    ['info', 'Consumed Capacity', '1 unidad de lectura'],
  ] },
  'api-gateway': { tech: null, steps: [
    ['auth', 'API Key Verified', '{name} · plan estándar'],
    ['info', 'Quota', '412 de 10 000 llamadas hoy'],
    ['ok', 'Proxy 200', '/v1/public/projects → API'],
  ] },
  waf: { tech: null, steps: [
    ['info', 'Rule Evaluated', '{name} · reglas gestionadas'],
    ['warn', 'Request Blocked', 'patrón de inyección SQL'],
  ] },
  mq: { tech: null, steps: [
    ['info', 'MQPUT', '{name} · cola de peticiones al core'],
    ['ok', 'MQGET', 'respuesta correlacionada · 120 ms'],
    ['info', 'Queue Depth', '0 mensajes · sin mensajes en la cola de errores'],
  ] },
  mainframe: { tech: null, steps: [
    ['info', 'Program Call', '{name} · trama plana de 512 bytes'],
    ['ok', 'Transaction OK', 'respuesta del core'],
  ] },
  prometheus: { tech: null, steps: [
    ['info', 'Scrape OK', '/actuator/prometheus · 15 s'],
    ['ok', 'Alert Rules', '0 alertas activas'],
  ] },
};

/** Telemetría de un tipo de nodo; los que no tienen muestra propia usan una genérica de salud. */
export function telemetryFor(type: string, role: string): ComponentTelemetry {
  return TELEMETRY[type] ?? { tech: null, steps: [
    ['ok', 'Health Check OK', '{name} · ' + role],
    ['info', 'Request Served', '{name}'],
  ] };
}
