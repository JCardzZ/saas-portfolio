import { SystemCategoryId } from './system-catalog.data';
import { SystemDesign } from './system-design';

/**
 * Recorrido de una petición por el sistema elegido (flag `studio.app-e2e`): salto a salto, quién
 * actúa, cuánto tarda y qué pasa si esa pieza cae. Las latencias son órdenes de magnitud típicos
 * dentro de una región (red de usuario a la nube ~40 ms, Redis ~1 ms, una consulta indexada en
 * PostgreSQL ~5 ms); sirven para razonar, no para prometer.
 */
export type JourneyKind = 'read' | 'write';

export interface JourneyStep {
  /** Categoría del diagrama que se resalta en este salto (`null`: la red, que no es una pieza). */
  category: SystemCategoryId | null;
  /** Quién actúa, con la opción elegida: «Redis», «API gateway»… */
  actor: string;
  /** Qué hace en este salto. */
  action: string;
  /** Latencia orientativa del salto en milisegundos. */
  ms: number;
  /** Fuera del camino de la respuesta: lo que ocurre después (cola, push). No suma latencia. */
  async?: boolean;
  /** Qué pasa si esta pieza cae y cómo se mitiga. */
  failure: { impact: string; mitigation: string };
}

export interface Journey {
  kind: JourneyKind;
  steps: JourneyStep[];
  /** Suma de los saltos síncronos: lo que espera el usuario. */
  totalMs: number;
  /** Objetivo p95 de los requisitos, si lo hay. */
  targetMs: number | null;
}

const NETWORK: JourneyStep = {
  category: null, actor: 'Red', action: 'DNS, TLS y viaje de ida y vuelta desde el dispositivo hasta la región.', ms: 40,
  failure: { impact: 'Con la red del usuario lenta o caída no hay arquitectura que ayude.', mitigation: 'Reintentos con espera exponencial en el cliente y respuestas pequeñas.' },
};

/** El recorrido de leer o escribir un dato con las elecciones de `design`. */
export function requestJourney(design: SystemDesign, kind: JourneyKind): Journey {
  const pick = design.choices;
  const steps: JourneyStep[] = [];
  const client = pick.client ?? 'web-spa';
  const mobile = client.startsWith('mobile');

  steps.push({
    category: 'client', actor: mobile ? 'App móvil' : 'Navegador',
    action: kind === 'read' ? 'Pide el dato con el token de la sesión.' : 'Envía el cambio con el token y una clave de idempotencia.',
    ms: 0,
    failure: mobile
      ? { impact: 'Sin conexión, la app no puede pedir nada nuevo.', mitigation: 'Caché local y cola de cambios que se envía al volver la conexión.' }
      : { impact: 'Si la web estática no carga, no hay interfaz.', mitigation: 'Servirla desde CDN con varias réplicas de borde.' },
  });

  // Una lectura pública en el borde ni siquiera llega a la región.
  if (kind === 'read' && pick.cache === 'cdn') {
    steps.push({
      category: 'cache', actor: 'CDN', action: 'Si la respuesta es pública y está en caché, sale del borde más cercano.', ms: 15,
      failure: { impact: 'Todas las peticiones van al origen: más latencia y más carga.', mitigation: 'Origen dimensionado para aguantar sin CDN y cabeceras Cache-Control claras.' },
    });
  }
  steps.push(NETWORK);

  if (pick.bff === 'gateway') {
    steps.push({
      category: 'bff', actor: 'API gateway', action: 'Termina TLS, aplica límites de peticiones y enruta al backend.', ms: 8,
      failure: { impact: 'Es la única puerta: si cae, cae todo el sistema.', mitigation: 'Servicio gestionado en varias zonas y una ruta de salud vigilada.' },
    });
  } else if (pick.bff === 'bff') {
    steps.push({
      category: 'bff', actor: 'BFF', action: 'Adapta la petición a este cliente y agrega varias llamadas en una.', ms: 12,
      failure: { impact: 'Ese tipo de cliente se queda sin servicio; los demás siguen.', mitigation: 'Varias instancias detrás del balanceador y tiempos de espera cortos hacia el backend.' },
    });
  } else {
    steps.push({
      category: null, actor: 'Balanceador', action: 'Reparte la petición entre las instancias sanas del backend.', ms: 2,
      failure: { impact: 'Sin balanceador no hay entrada.', mitigation: 'Balanceador gestionado, presente en varias zonas.' },
    });
  }

  steps.push(authStep(pick.auth));

  const backend = pick.backend === 'go' ? 'Go' : pick.backend === 'node' ? 'NestJS' : 'Spring Boot';
  steps.push({
    category: 'backend', actor: backend,
    action: kind === 'read' ? 'Valida la petición y busca el dato.' : 'Valida el cambio y lo aplica en una transacción.',
    ms: pick.backend === 'go' ? 3 : pick.backend === 'node' ? 5 : 6,
    failure: { impact: 'Las instancias que caen dejan de recibir tráfico; si caen todas, no hay servicio.', mitigation: 'Al menos dos instancias en zonas distintas, comprobación de salud y autoescalado.' },
  });

  const database = databaseName(pick.database);
  if (kind === 'read') {
    if (pick.cache === 'redis') {
      steps.push({
        category: 'cache', actor: 'Redis', action: 'Mira primero en memoria: un acierto devuelve el dato sin tocar la base.', ms: 1,
        failure: { impact: 'Todas las lecturas van a la base: más latencia y riesgo de saturarla de golpe.', mitigation: 'Tratar la caché como opcional (cache-aside) y limitar las peticiones simultáneas a la base.' },
      });
    }
    steps.push({
      category: 'database', actor: database, action: pick.cache === 'redis' ? 'Solo en un fallo de caché: consulta por índice y guarda el resultado en Redis.' : 'Consulta por índice.', ms: pick.database === 'key-value' ? 3 : 5,
      failure: databaseFailure(pick.database),
    });
  } else {
    steps.push({
      category: 'database', actor: database, action: pick.queue ? 'Guarda el cambio y, en la misma transacción, el evento pendiente de publicar (outbox).' : 'Guarda el cambio y confirma la transacción.', ms: pick.database === 'key-value' ? 4 : 8,
      failure: databaseFailure(pick.database),
    });
    if (pick.cache === 'redis') {
      steps.push({
        category: 'cache', actor: 'Redis', action: 'Invalida la clave del dato cambiado para que la próxima lectura no sea antigua.', ms: 1,
        failure: { impact: 'Si la invalidación falla, se leen datos antiguos hasta que caducan.', mitigation: 'Caducidad corta en cada clave como red de seguridad.' },
      });
    }
    if (pick.queue) {
      const queue = pick.queue === 'stream' ? 'Stream de eventos' : pick.queue === 'pubsub' ? 'Pub/Sub' : 'Cola';
      steps.push({
        category: 'queue', actor: queue, action: 'Recibe el evento y lo entrega a quien procesa el trabajo lento, fuera de la respuesta.', ms: 5, async: true,
        failure: { impact: 'El trabajo se acumula, pero el cambio ya está guardado: nada se pierde con outbox.', mitigation: 'Reintentos con cola de mensajes fallidos y consumidores idempotentes.' },
      });
    }
    if (pick.push) {
      const push = pick.push === 'websocket' ? 'WebSocket' : pick.push === 'sse' ? 'Server-Sent Events' : 'Push';
      steps.push({
        category: 'push', actor: push, action: 'Avisa a los demás clientes de que el dato cambió.', ms: 50, async: true,
        failure: { impact: 'Los demás no se enteran al momento; ven el cambio al recargar.', mitigation: 'Que el aviso sea una mejora: el cliente vuelve a pedir el dato al reconectar.' },
      });
    }
  }

  steps.push({ ...NETWORK, action: 'La respuesta vuelve al dispositivo.', ms: 40 });

  const totalMs = steps.filter((step) => !step.async).reduce((sum, step) => sum + step.ms, 0);
  return { kind, steps, totalMs, targetMs: design.nfr.latencyMs ?? null };
}

function authStep(auth: string | undefined): JourneyStep {
  if (auth === 'oidc-managed') {
    return {
      category: 'auth', actor: 'Token OIDC', action: 'El backend valida la firma del token con las claves públicas del proveedor, ya en memoria.', ms: 1,
      failure: { impact: 'Si cae el proveedor, quien ya tiene token sigue dentro; nadie nuevo puede entrar.', mitigation: 'Tokens de vida corta y claves públicas cacheadas en el backend.' },
    };
  }
  if (auth === 'session') {
    return {
      category: 'auth', actor: 'Sesión', action: 'Busca la sesión de la cookie en el almacén compartido.', ms: 1,
      failure: { impact: 'Si cae el almacén de sesiones, todo el mundo queda fuera a la vez.', mitigation: 'Almacén replicado y sesiones que sobreviven a un reinicio.' },
    };
  }
  return {
    category: 'auth', actor: 'JWT propio', action: 'El backend comprueba la firma del token con su clave.', ms: 1,
    failure: { impact: 'Si se filtra la clave de firma, cualquiera puede hacerse pasar por cualquiera.', mitigation: 'Clave en un gestor de secretos, rotación y tokens de vida corta.' },
  };
}

function databaseName(database: string | undefined): string {
  return database === 'document' ? 'MongoDB' : database === 'key-value' ? 'Clave-valor' : 'PostgreSQL';
}

function databaseFailure(database: string | undefined): JourneyStep['failure'] {
  return database === 'key-value' || database === 'document'
    ? { impact: 'Sin base no se lee ni se escribe; lo cacheado aguanta un rato.', mitigation: 'Servicio gestionado con réplicas en varias zonas y copias de seguridad probadas.' }
    : { impact: 'Las escrituras fallan; con réplica, el cambio de primaria tarda del orden de un minuto.', mitigation: 'Instancia multizona con conmutación automática, réplica de lectura y copias probadas.' };
}
