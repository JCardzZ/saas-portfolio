import { SystemCategoryId } from './system-catalog.data';
import { InfraNode, SystemDesign, SystemFinding } from './system-design';

/**
 * Asistente de diseño de la vista de Aplicación: lee lo elegido y la infraestructura y dice, por
 * dimensión, cómo queda el sistema y qué cambiaría. Son **reglas deterministas** escritas a mano
 * (las de este archivo), no un modelo de IA ni una medición: la misma entrada da siempre la misma
 * respuesta, y cada consejo dice por qué.
 */
export type Level = 'good' | 'limited' | 'risk';
export type DimensionId = 'scalability' | 'availability' | 'performance' | 'security' | 'operations';

/** Lo que se puede hacer con un consejo: cambiar una elección aquí, o añadir una pieza en Infraestructura. */
export type AdviceAction =
  | { kind: 'choose'; label: string; category: SystemCategoryId; option: string }
  | { kind: 'infra'; label: string };

export interface Advice {
  id: string;
  dimension: DimensionId;
  level: Exclude<Level, 'good'>;
  title: string;
  why: string;
  action?: AdviceAction;
}

export interface Dimension {
  id: DimensionId;
  name: string;
  level: Level;
  summary: string;
  strengths: string[];
  advice: Advice[];
}

export interface Assessment {
  /** Veredicto sobre la escalabilidad, que es la pregunta de partida. */
  verdict: Level;
  headline: string;
  dimensions: Dimension[];
  /** Todos los consejos, los más graves primero. */
  advice: Advice[];
}

const NAMES: Record<DimensionId, string> = {
  scalability: 'Escalabilidad', availability: 'Disponibilidad', performance: 'Rendimiento', security: 'Seguridad', operations: 'Operación',
};

const SUMMARIES: Record<DimensionId, Record<Level, string>> = {
  scalability: { good: 'Puede crecer añadiendo réplicas.', limited: 'Crece, pero algo se satura antes.', risk: 'Hay algo que impide añadir réplicas.' },
  availability: { good: 'Aguanta la caída de una pieza.', limited: 'Hay puntos únicos de fallo.', risk: 'Una caída lo para todo.' },
  performance: { good: 'El camino de una petición es corto.', limited: 'Hay trabajo que se podría evitar.', risk: 'El diseño añade latencia de más.' },
  security: { good: 'Las defensas básicas están puestas.', limited: 'Faltan defensas habituales.', risk: 'Hay una exposición seria.' },
  operations: { good: 'Es razonable de operar.', limited: 'Pide más trabajo de operación.', risk: 'Es difícil de operar con lo que hay.' },
};

const HEADLINES: Record<Level, string> = {
  good: 'Este diseño puede escalar',
  limited: 'Escala, pero con límites',
  risk: 'Así no va a escalar',
};

/** A qué dimensión pertenece cada regla de requisitos no funcionales (`NFR_RULES`). */
const FINDING_DIMENSION: [prefix: string, dimension: DimensionId][] = [
  ['rps-', 'scalability'], ['latency-', 'performance'], ['availability-', 'availability'],
  ['pci-', 'security'], ['health-', 'security'], ['users-', 'operations'], ['budget', 'operations'],
];

const ELASTIC = ['containers', 'kubernetes', 'functions', 'app-platform'];
const MONITORING = ['native-monitoring', 'prometheus', 'datadog', 'opentelemetry'];
const COMPUTE_NAMES: Record<string, string> = {
  containers: 'contenedores serverless', kubernetes: 'Kubernetes', functions: 'funciones', 'app-platform': 'una plataforma de aplicaciones',
};

/**
 * Valora el sistema. `findings` son las comprobaciones de requisitos de `evaluateSystem`: las que
 * son de un requisito no funcional se suman como consejos a su dimensión, sin repetir su lógica.
 */
export function assessSystem(design: SystemDesign, infra: InfraNode[], findings: SystemFinding[] = []): Assessment {
  const { choices } = design;
  const types = new Set(infra.map((node) => node.type));
  const has = (...wanted: string[]) => wanted.some((type) => types.has(type));
  const backendOn = infra.find((node) => node.id === design.deployments.backend)?.type ?? null;
  const webClient = choices.client === 'web-spa' || choices.client === 'web-ssr';

  const advice: Advice[] = [];
  const strengths: Record<DimensionId, string[]> = { scalability: [], availability: [], performance: [], security: [], operations: [] };
  const warn = (id: string, dimension: DimensionId, level: Advice['level'], title: string, why: string, action?: AdviceAction) =>
    advice.push({ id, dimension, level, title, why, ...(action ? { action } : {}) });
  const choose = (label: string, category: SystemCategoryId, option: string): AdviceAction => ({ kind: 'choose', label, category, option });
  const addInfra = (piece: string): AdviceAction => ({ kind: 'infra', label: `Añade ${piece} en la vista de Infraestructura` });

  // ── Escalabilidad ──
  if (choices.auth === 'session' && choices.cache !== 'redis') {
    warn('session-without-store', 'scalability', 'risk', 'La sesión vive en una sola réplica',
      'Con la sesión guardada en el servidor y sin un almacén compartido, al añadir una segunda réplica un usuario pierde la sesión cuando su petición cae en la otra.',
      choose('Añadir Redis como almacén de sesiones', 'cache', 'redis'));
  }
  if (backendOn === null) {
    warn('backend-not-deployed', 'scalability', 'limited', 'El backend aún no se despliega en ninguna pieza',
      'Sin saber dónde corre no se puede decir cómo crece: elige en «Backend → Se despliega en» una pieza de la infraestructura.');
  } else if (backendOn === 'vm') {
    warn('backend-on-vm', 'scalability', 'limited', 'El backend corre en máquinas virtuales',
      'Crecer es añadir máquinas a mano o montar y mantener un grupo de autoescalado; un servicio de contenedores añade réplicas solo.',
      addInfra('un servicio de contenedores'));
  } else if (ELASTIC.includes(backendOn)) {
    strengths.scalability.push(`El backend corre en ${COMPUTE_NAMES[backendOn]}, que añade réplicas con la carga.`);
  }
  if (!choices.cache) {
    warn('no-cache', 'scalability', 'limited', 'Cada lectura llega a la base de datos',
      'Sin caché, la base de datos es lo primero que se satura cuando sube el tráfico de lectura.',
      choose('Añadir Redis como caché', 'cache', 'redis'));
  }
  if (!choices.queue && choices.api !== 'events') {
    warn('no-queue', 'scalability', 'limited', 'Todo el trabajo se hace dentro de la petición',
      'Sin una cola, las tareas lentas (correos, informes, llamadas a terceros) ocupan al backend mientras el usuario espera, y un pico llega entero.',
      choose('Añadir una cola de mensajes', 'queue', 'queue'));
  }
  if (choices.push === 'websocket' && choices.cache !== 'redis' && !choices.queue) {
    warn('websocket-fanout', 'scalability', 'limited', 'Cada réplica solo conoce sus propias conexiones',
      'WebSocket mantiene la conexión abierta en una réplica concreta: para avisar a todos los conectados hace falta un canal compartido entre réplicas.',
      choose('Añadir publicación y suscripción', 'queue', 'pubsub'));
  }
  if (choices.database === 'postgresql') {
    strengths.scalability.push('PostgreSQL crece en vertical y con réplicas de lectura; las escrituras pasan por un único primario.');
  } else if (choices.database) {
    strengths.scalability.push('La base de datos reparte los datos entre nodos: crece en horizontal.');
  }
  if (choices.client === 'web-spa') {
    strengths.scalability.push('El cliente son archivos estáticos: servirlo no consume cómputo.');
  }

  // ── Disponibilidad ──
  if (!has('lb', 'api-gateway')) {
    warn('no-entry-point', 'availability', 'limited', 'No hay quien reparta entre réplicas',
      'Sin un balanceador o un gateway, la caída de la única instancia deja el sistema sin servicio.', addInfra('un balanceador'));
  } else {
    strengths.availability.push('Hay un punto de entrada que reparte entre réplicas y aparta la que falla.');
  }
  if (choices.queue) {
    strengths.availability.push('La cola guarda el trabajo si quien lo procesa se cae un momento.');
  }
  if (has('global-database', 'global-sql')) {
    strengths.availability.push('Los datos tienen copia en otra región.');
  }
  if (choices.auth === 'oidc-managed') {
    strengths.availability.push('El inicio de sesión no depende de tu backend.');
  }

  // ── Rendimiento ──
  if (webClient && choices.cache !== 'cdn' && !has('edge', 'static')) {
    warn('no-edge-cache', 'performance', 'limited', 'El contenido viaja siempre desde la región',
      'Sin una CDN, un visitante lejano descarga cada archivo desde el origen.', choose('Añadir caché en el borde (CDN)', 'cache', 'cdn'));
  } else if (webClient) {
    strengths.performance.push('El contenido estático se sirve desde cerca del visitante.');
  }
  if (choices.api === 'grpc' && webClient && !choices.bff) {
    warn('grpc-in-browser', 'performance', 'limited', 'El navegador no habla gRPC directamente',
      'Hace falta gRPC-Web o un proxy que traduzca entre el navegador y el backend.', choose('Añadir un API gateway', 'bff', 'gateway'));
  }
  if (choices.api === 'graphql') {
    warn('graphql-cost', 'performance', 'limited', 'Una sola consulta puede pedir demasiado',
      'GraphQL deja al cliente elegir qué pide: hay que limitar la profundidad y el coste de las consultas para que una no tumbe la base de datos.');
  }
  if (choices.cache === 'redis') {
    strengths.performance.push('Las lecturas repetidas se responden desde memoria.');
  }

  // ── Seguridad ──
  if (choices.auth === 'jwt-own') {
    warn('own-credentials', 'security', 'limited', 'El backend custodia las credenciales',
      'Guardar contraseñas, firmar tokens y rotar las claves pasa a ser responsabilidad tuya; un proveedor de identidad lo hace por ti.',
      choose('Usar un proveedor OIDC gestionado', 'auth', 'oidc-managed'));
  } else if (choices.auth === 'oidc-managed') {
    strengths.security.push('Las credenciales las guarda un proveedor de identidad, no tu backend.');
  }
  if (!has('waf')) {
    warn('no-waf', 'security', 'limited', 'Nada filtra las peticiones antes de llegar a la aplicación',
      'Un cortafuegos de aplicación para los ataques conocidos y limita el tráfico abusivo.', addInfra('un cortafuegos de aplicación (WAF)'));
  } else {
    strengths.security.push('Un cortafuegos de aplicación filtra el tráfico antes del backend.');
  }
  if (!has('secrets', 'vault')) {
    warn('no-secrets', 'security', 'limited', 'No hay un gestor de secretos',
      'Sin él, las claves acaban en variables de entorno o en la imagen, y rotarlas obliga a desplegar.', addInfra('un gestor de secretos'));
  } else {
    strengths.security.push('Las claves viven en un gestor de secretos.');
  }

  // ── Operación ──
  if (backendOn === 'kubernetes') {
    warn('kubernetes-ops', 'operations', 'limited', 'Kubernetes pide quien lo opere',
      'Da control sobre el despliegue, a cambio de mantener el clúster, sus versiones y su red.');
  }
  if (choices.api === 'events') {
    warn('eventual-consistency', 'operations', 'limited', 'La consistencia pasa a ser eventual',
      'Con eventos hay que diseñar los reintentos, los mensajes duplicados y el orden: un dato puede tardar en verse en todos los servicios.');
  }
  if (!has(...MONITORING)) {
    warn('no-observability', 'operations', 'limited', 'No se ve lo que pasa dentro',
      'Sin métricas ni logs centralizados, un fallo se descubre cuando lo avisa un usuario.', addInfra('una pieza de observabilidad'));
  } else {
    strengths.operations.push('Hay métricas y logs para ver qué falla.');
  }

  // Lo que piden los requisitos no funcionales y el diseño no cumple.
  for (const finding of findings.filter((candidate) => candidate.kind === 'nfr')) {
    const dimension = FINDING_DIMENSION.find(([prefix]) => finding.rule.startsWith(prefix))?.[1] ?? 'operations';
    warn(`nfr-${finding.rule}`, dimension, finding.severity === 'error' ? 'risk' : 'limited', finding.message, finding.suggestion ?? 'Lo exige uno de los requisitos no funcionales que has pedido.');
  }

  const levelOf = (id: DimensionId): Level => {
    const own = advice.filter((item) => item.dimension === id);
    return own.some((item) => item.level === 'risk') ? 'risk' : own.length ? 'limited' : 'good';
  };
  const dimensions = (Object.keys(NAMES) as DimensionId[]).map((id): Dimension => {
    const level = levelOf(id);
    return { id, name: NAMES[id], level, summary: SUMMARIES[id][level], strengths: strengths[id], advice: advice.filter((item) => item.dimension === id) };
  });
  const verdict = levelOf('scalability');
  return {
    verdict, headline: HEADLINES[verdict], dimensions,
    advice: [...advice].sort((a, b) => Number(b.level === 'risk') - Number(a.level === 'risk')),
  };
}
