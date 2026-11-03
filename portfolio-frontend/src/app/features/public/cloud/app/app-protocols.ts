import { AppLayer, pieceOf } from './app-catalog.data';

/**
 * Conexiones del Estudio de Aplicación (flag `studio.app-canvas`): qué protocolos admite cada
 * pareja de piezas y, si no admite ninguno, por qué y qué hacer en su lugar. El primero de la lista
 * es el que se pone por defecto.
 */
export type Protocol = 'HTTPS' | 'REST' | 'GraphQL' | 'gRPC' | 'WebSocket' | 'SQL' | 'Driver' | 'RESP' | 'Eventos' | 'OIDC' | 'SDK' | 'OTLP' | 'DNS';

/** Lo que va fuera de la respuesta: se dibuja discontinuo. */
export const ASYNC_PROTOCOLS: readonly Protocol[] = ['Eventos', 'OTLP'];

export type ConnectionVerdict =
  | { allowed: true; protocols: Protocol[] }
  | { allowed: false; reason: string; suggestion: string };

const CALLERS: readonly AppLayer[] = ['service'];
const HTTP: Protocol[] = ['REST', 'GraphQL', 'gRPC', 'WebSocket', 'HTTPS'];

/** Las reglas, de lo más concreto a lo más general. `from`/`to` son tipos de pieza o capas. */
interface Rule {
  to: string[];
  from: string[];
  protocols?: Protocol[];
  reason?: string;
  suggestion?: string;
}

const RULES: Rule[] = [
  // Un cliente nunca habla con los datos ni con la mensajería: expondría credenciales y esquema.
  { from: ['client'], to: ['data', 'messaging', 'secrets'], reason: 'Un cliente nunca habla directamente con los datos: tendría que llevar las credenciales y quedaría expuesto el esquema.', suggestion: 'Pon una API o un BFF en medio.' },
  { from: ['client'], to: ['idp'], protocols: ['OIDC'] },
  { from: ['client'], to: ['dns'], protocols: ['DNS'] },
  { from: ['client'], to: ['cdn', 'waf', 'gateway', 'bff', 'lb'], protocols: ['HTTPS', 'REST', 'GraphQL', 'WebSocket'] },
  { from: ['client'], to: ['service'], protocols: ['REST', 'GraphQL', 'WebSocket', 'gRPC'] },
  { from: ['client'], to: ['payments', 'third-party'], protocols: ['SDK', 'HTTPS'] },
  { from: ['client'], to: ['client', 'observability', 'email'], reason: 'Un cliente no llama a esta pieza: no tiene nada que pedirle.', suggestion: 'Conéctalo con la entrada (CDN, gateway o BFF).' },

  // La entrada encadena hacia dentro.
  { from: ['dns'], to: ['cdn', 'waf', 'gateway', 'lb'], protocols: ['DNS'] },
  { from: ['cdn'], to: ['storage'], protocols: ['HTTPS'] },
  { from: ['edge'], to: ['edge'], protocols: ['HTTPS'] },
  { from: ['edge'], to: ['service'], protocols: HTTP },
  { from: ['edge'], to: ['idp'], protocols: ['OIDC'] },
  { from: ['bff'], to: ['cache'], protocols: ['RESP'] },
  { from: ['edge'], to: ['observability'], protocols: ['OTLP'] },
  { from: ['edge'], to: ['data', 'messaging'], reason: 'La entrada no guarda ni publica nada: si toca los datos, la lógica se reparte donde no se prueba.', suggestion: 'Deja que un servicio lo haga detrás de la entrada.' },

  // Los servicios.
  { from: CALLERS as string[], to: ['sql'], protocols: ['SQL'] },
  { from: CALLERS as string[], to: ['nosql', 'warehouse'], protocols: ['Driver'] },
  { from: CALLERS as string[], to: ['cache'], protocols: ['RESP'] },
  { from: CALLERS as string[], to: ['search', 'storage'], protocols: ['REST', 'SDK'] },
  { from: CALLERS as string[], to: ['messaging'], protocols: ['Eventos'] },
  { from: CALLERS as string[], to: ['service'], protocols: ['gRPC', 'REST', 'GraphQL'] },
  { from: CALLERS as string[], to: ['identity'], protocols: ['OIDC', 'SDK'] },
  { from: CALLERS as string[], to: ['observability'], protocols: ['OTLP'] },
  { from: CALLERS as string[], to: ['external'], protocols: ['HTTPS', 'SDK'] },
  { from: CALLERS as string[], to: ['client'], reason: 'Un servicio no abre conexiones hacia el cliente: es el cliente quien llama.', suggestion: 'Para avisar al cliente usa WebSocket o push desde el cliente hacia la entrada.' },
  { from: CALLERS as string[], to: ['edge'], reason: 'Un servicio no vuelve a entrar por la puerta principal: añade latencia y un bucle.', suggestion: 'Llama al otro servicio directamente (gRPC o REST).' },

  // La mensajería entrega a quien consume.
  { from: ['messaging'], to: ['service'], protocols: ['Eventos'] },
  { from: ['messaging'], to: ['messaging'], protocols: ['Eventos'] },
  { from: ['messaging'], to: ['warehouse'], protocols: ['Eventos'] },

  // Los terceros avisan por webhook.
  { from: ['external'], to: ['gateway', 'service'], protocols: ['HTTPS', 'REST'] },

  // Los datos no llaman a nadie, salvo replicar hacia el analítico.
  { from: ['sql', 'nosql'], to: ['warehouse', 'stream'], protocols: ['Eventos'] },
  { from: ['data'], to: [], reason: 'Una base de datos no inicia conversaciones: responde a quien le pregunta.', suggestion: 'Dibuja la flecha al revés: del servicio a la base.' },
];

function matches(list: string[], type: string, layer: AppLayer): boolean {
  return list.includes(type) || list.includes(layer);
}

export function connectionVerdict(fromType: string, toType: string): ConnectionVerdict {
  const from = pieceOf(fromType);
  const to = pieceOf(toType);
  if (!from || !to) {
    return { allowed: false, reason: 'Pieza desconocida.', suggestion: 'Vuelve a añadirla desde el catálogo.' };
  }
  for (const rule of RULES) {
    if (!matches(rule.from, from.type, from.layer)) {
      continue;
    }
    // Una regla sin destinos aplica a cualquier destino (los datos no llaman a nadie).
    if (rule.to.length && !matches(rule.to, to.type, to.layer)) {
      continue;
    }
    return rule.protocols
      ? { allowed: true, protocols: rule.protocols }
      : { allowed: false, reason: rule.reason!, suggestion: rule.suggestion! };
  }
  return {
    allowed: false,
    reason: `${from.name} no tiene nada que pedirle a ${to.name}.`,
    suggestion: 'Piensa en quién inicia la conversación y dibuja la flecha desde ahí.',
  };
}
