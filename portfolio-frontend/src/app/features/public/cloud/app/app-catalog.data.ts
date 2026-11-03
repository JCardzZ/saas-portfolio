/**
 * Estudio de Aplicación (flag `studio.app-canvas`): las piezas con las que se dibuja cualquier
 * arquitectura de software, agrupadas por capas. Cada capa tiene su color; cada pieza, su icono
 * (trazo de 24×24) y la tecnología que se le pone por defecto, que el visitante puede cambiar.
 */
export type AppLayer = 'client' | 'edge' | 'service' | 'data' | 'messaging' | 'identity' | 'observability' | 'external';

export interface AppLayerInfo {
  id: AppLayer;
  name: string;
  color: string;
}

export const APP_LAYERS: readonly AppLayerInfo[] = [
  { id: 'client', name: 'Clientes', color: '#4f8cff' },
  { id: 'edge', name: 'Entrada y red', color: '#22c3e6' },
  { id: 'service', name: 'Servicios', color: '#7fee64' },
  { id: 'data', name: 'Datos', color: '#f5a524' },
  { id: 'messaging', name: 'Mensajería', color: '#ff5c93' },
  { id: 'identity', name: 'Identidad y secretos', color: '#a970ff' },
  { id: 'observability', name: 'Observabilidad', color: '#94a3b8' },
  { id: 'external', name: 'Terceros', color: '#e2e8f0' },
];

export interface AppPiece {
  type: string;
  layer: AppLayer;
  name: string;
  /** Tecnología por defecto, editable: «PostgreSQL», «Spring Boot»… */
  tech: string;
  summary: string;
  icon: string;
}

const ICON = {
  browser: 'M3 5h18v14H3zM3 9h18M7 7h.01M10 7h.01',
  server: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
  mobile: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z',
  gateway: 'M4 12h6M14 12h6M10 8l4 4-4 4M4 5v14M20 5v14',
  split: 'M4 12h5l4-6h7M13 18h7M9 12l4 6',
  balance: 'M12 4v16M5 8l-3 6h6zM19 8l-3 6h6zM5 8h14',
  box: 'M12 3 3 8l9 5 9-5-9-5zM3 8v8l9 5 9-5V8',
  cube: 'M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  db: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  doc: 'M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 18h4',
  lightning: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM13 7l-4 6h4l-2 4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  bucket: 'M4 7h16l-2 13H6zM4 7c0-2 3.6-3 8-3s8 1 8 3',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  queue: 'M3 7h4v10H3zM10 7h4v10h-4zM17 7h4v10h-4z',
  stream: 'M3 8c3 0 3 4 6 4s3-4 6-4 3 4 6 4M3 16c3 0 3-4 6-4s3 4 6 4 3-4 6-4',
  broadcast: 'M12 12h.01M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8',
  key: 'M15 7a4 4 0 1 0-3.9 5L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 0 15 7zM16 8h.01',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  layers: 'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5',
  plug: 'M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
};

export const APP_PIECES: readonly AppPiece[] = [
  { type: 'spa', layer: 'client', name: 'Web SPA', tech: 'Angular', summary: 'Aplicación de una sola página servida como estáticos.', icon: ICON.browser },
  { type: 'ssr', layer: 'client', name: 'Web SSR', tech: 'Next.js', summary: 'HTML generado en el servidor: mejor primera carga y SEO.', icon: ICON.server },
  { type: 'mobile', layer: 'client', name: 'App móvil', tech: 'Flutter', summary: 'iOS y Android; se distribuye por las tiendas.', icon: ICON.mobile },
  { type: 'partner', layer: 'client', name: 'Integrador', tech: 'API pública', summary: 'Un tercero que integra tu API.', icon: ICON.plug },

  { type: 'dns', layer: 'edge', name: 'DNS', tech: 'Cloudflare DNS', summary: 'Resuelve el dominio hacia la entrada.', icon: ICON.globe },
  { type: 'cdn', layer: 'edge', name: 'CDN', tech: 'CloudFront', summary: 'Sirve estáticos y respuestas cacheables desde el borde.', icon: ICON.globe },
  { type: 'waf', layer: 'edge', name: 'WAF', tech: 'AWS WAF', summary: 'Filtra ataques conocidos y tráfico abusivo.', icon: ICON.shield },
  { type: 'gateway', layer: 'edge', name: 'API gateway', tech: 'Kong', summary: 'Una entrada con autenticación, límites y enrutado.', icon: ICON.gateway },
  { type: 'bff', layer: 'edge', name: 'BFF', tech: 'NestJS', summary: 'Backend a medida de un cliente: agrega y adapta.', icon: ICON.split },
  { type: 'lb', layer: 'edge', name: 'Balanceador', tech: 'ALB', summary: 'Reparte el tráfico entre instancias sanas.', icon: ICON.balance },

  { type: 'monolith', layer: 'service', name: 'Monolito', tech: 'Spring Boot', summary: 'Un despliegue, módulos con límites claros.', icon: ICON.box },
  { type: 'microservice', layer: 'service', name: 'Microservicio', tech: 'Go', summary: 'Un servicio pequeño con su propio dato y despliegue.', icon: ICON.cube },
  { type: 'worker', layer: 'service', name: 'Worker', tech: 'Spring Batch', summary: 'Procesa trabajo en segundo plano desde una cola.', icon: ICON.gear },
  { type: 'function', layer: 'service', name: 'Función', tech: 'AWS Lambda', summary: 'Código por evento, sin servidores que gestionar.', icon: ICON.bolt },
  { type: 'cron', layer: 'service', name: 'Cron', tech: 'Cron', summary: 'Se ejecuta a una hora fija.', icon: ICON.clock },

  { type: 'sql', layer: 'data', name: 'Base SQL', tech: 'PostgreSQL', summary: 'Transacciones y consultas con uniones.', icon: ICON.db },
  { type: 'nosql', layer: 'data', name: 'Base NoSQL', tech: 'MongoDB', summary: 'Documentos con esquema flexible.', icon: ICON.doc },
  { type: 'cache', layer: 'data', name: 'Caché', tech: 'Redis', summary: 'Memoria rápida con caducidad por clave.', icon: ICON.lightning },
  { type: 'search', layer: 'data', name: 'Buscador', tech: 'OpenSearch', summary: 'Búsqueda de texto y facetas.', icon: ICON.search },
  { type: 'storage', layer: 'data', name: 'Objetos', tech: 'S3', summary: 'Ficheros y binarios a cualquier escala.', icon: ICON.bucket },
  { type: 'warehouse', layer: 'data', name: 'Warehouse', tech: 'BigQuery', summary: 'Analítica sobre grandes volúmenes.', icon: ICON.chart },

  { type: 'queue', layer: 'messaging', name: 'Cola', tech: 'SQS', summary: 'Cada mensaje lo procesa un consumidor; reintenta.', icon: ICON.queue },
  { type: 'stream', layer: 'messaging', name: 'Stream', tech: 'Kafka', summary: 'Registro ordenado que varios leen y releen.', icon: ICON.stream },
  { type: 'pubsub', layer: 'messaging', name: 'Pub/Sub', tech: 'SNS', summary: 'Un aviso llega a todos los suscriptores.', icon: ICON.broadcast },

  { type: 'idp', layer: 'identity', name: 'Identidad', tech: 'Keycloak', summary: 'Inicio de sesión y tokens OIDC.', icon: ICON.key },
  { type: 'secrets', layer: 'identity', name: 'Secretos', tech: 'Vault', summary: 'Credenciales y claves fuera del código.', icon: ICON.lock },

  { type: 'logs', layer: 'observability', name: 'Métricas', tech: 'Grafana', summary: 'Lo que pasa, con alertas.', icon: ICON.pulse },
  { type: 'tracing', layer: 'observability', name: 'Trazas', tech: 'OpenTelemetry', summary: 'El recorrido de cada petición entre servicios.', icon: ICON.layers },

  { type: 'payments', layer: 'external', name: 'Pagos', tech: 'Stripe', summary: 'Cobros con tarjeta sin tocar sus datos.', icon: ICON.card },
  { type: 'email', layer: 'external', name: 'Correo', tech: 'SendGrid', summary: 'Envío de correos transaccionales.', icon: ICON.mail },
  { type: 'third-party', layer: 'external', name: 'API externa', tech: 'HTTP', summary: 'Un servicio externo del que dependes.', icon: ICON.plug },
];

export function pieceOf(type: string): AppPiece | undefined {
  return APP_PIECES.find((piece) => piece.type === type);
}

export function layerOf(layer: AppLayer): AppLayerInfo {
  return APP_LAYERS.find((info) => info.id === layer)!;
}

/** Cajas que agrupan piezas: límites de red y de dominio. */
export type AppBoxKind = 'vpc' | 'public' | 'private' | 'domain';

export const APP_BOXES: readonly { kind: AppBoxKind; name: string; hint: string }[] = [
  { kind: 'vpc', name: 'Red privada (VPC)', hint: 'Lo que no se ve desde Internet.' },
  { kind: 'public', name: 'Subred pública', hint: 'Solo la entrada: balanceador, gateway.' },
  { kind: 'private', name: 'Subred privada', hint: 'Servicios y datos.' },
  { kind: 'domain', name: 'Dominio', hint: 'Un contexto de negocio: pedidos, pagos…' },
];
