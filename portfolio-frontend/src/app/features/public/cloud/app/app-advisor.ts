import { NODE_HEIGHT, NODE_WIDTH } from '../cloud-topology.data';
import { pieceOf } from './app-catalog.data';
import { AppGraph, AppNode, addBox, addNode, connect, isAsync, linkKey } from './app-graph';
import { PIECE_LESSONS } from './app-learn.data';
import { settle } from './app-layout';
import { connectionVerdict } from './app-protocols';

/**
 * Asistente del Estudio de Aplicación (flag `studio.app-canvas`): revisa lo dibujado como lo
 * haría un arquitecto. Cada hallazgo dice qué pasa, por qué importa (lo que se aprende) y, cuando
 * se puede, ofrece un arreglo de un clic que respeta las mismas reglas que el lienzo.
 */
export type FindingLevel = 'risk' | 'warn' | 'tip';

export interface Finding {
  id: string;
  level: FindingLevel;
  title: string;
  /** Qué pasa en este diseño. */
  detail: string;
  /** Por qué importa: lo que se aprende. */
  learn: string;
  /** Piezas a las que se refiere (se marcan en el lienzo). */
  nodeIds: string[];
  fix?: { label: string; apply: (graph: AppGraph) => AppGraph };
}

/** Pieza de Infraestructura donde puede correr una de Aplicación. */
export interface InfraTarget {
  id: string;
  type: string;
  name: string;
}

export interface Review {
  findings: Finding[];
  verdict: 'ok' | 'limited' | 'risk';
  headline: string;
  /** Piezas con algún hallazgo, con el más grave. */
  marks: Map<string, FindingLevel>;
}

const layerOfNode = (node: AppNode) => pieceOf(node.type)?.layer;
const nameOf = (node: AppNode) => node.name?.trim() || pieceOf(node.type)?.name || node.type;
const isService = (node: AppNode) => layerOfNode(node) === 'service';

/** Coloca una pieza nueva junto a otra (debajo), y conecta con las reglas del lienzo. */
function addNear(graph: AppGraph, type: string, near: AppNode | undefined, dy = NODE_HEIGHT + 40): { graph: AppGraph; id: string } {
  return addNode(graph, type, near ? { x: near.x, y: near.y + dy } : undefined);
}

function link(graph: AppGraph, from: string, to: string): AppGraph {
  const result = connect(graph, from, to);
  return result.ok ? result.graph : graph;
}

export function reviewGraph(graph: AppGraph, infra: InfraTarget[] = []): Review {
  const findings: Finding[] = [];
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = (id: string) => graph.links.filter((item) => item.from === id);
  const incoming = (id: string) => graph.links.filter((item) => item.to === id);
  const services = graph.nodes.filter(isService);
  const clients = graph.nodes.filter((node) => layerOfNode(node) === 'client');

  // Conexiones que ya no cumplen las reglas (diseños guardados antes de un cambio).
  for (const item of graph.links) {
    const from = byId.get(item.from);
    const to = byId.get(item.to);
    const verdict = from && to ? connectionVerdict(from.type, to.type) : null;
    if (verdict && (!verdict.allowed || !verdict.protocols.includes(item.protocol))) {
      findings.push({
        id: `invalid:${linkKey(item)}`, level: 'risk', title: `${nameOf(from!)} → ${nameOf(to!)} no es válida`,
        detail: verdict.allowed ? `${item.protocol} no es un protocolo para esta pareja.` : verdict.reason,
        learn: verdict.allowed ? `Esta pareja habla ${verdict.protocols.join(', ')}.` : verdict.suggestion,
        nodeIds: [item.from, item.to],
        fix: verdict.allowed
          ? { label: `Usar ${verdict.protocols[0]}`, apply: (g) => ({ ...g, links: g.links.map((l) => (linkKey(l) === linkKey(item) ? { ...l, protocol: verdict.protocols[0] } : l)) }) }
          : { label: 'Quitar la conexión', apply: (g) => ({ ...g, links: g.links.filter((l) => linkKey(l) !== linkKey(item)) }) },
      });
    }
  }

  // Un cliente que entra directamente a un servicio: sin puerta común.
  for (const item of graph.links) {
    const from = byId.get(item.from);
    const to = byId.get(item.to);
    if (from && to && layerOfNode(from) === 'client' && isService(to)) {
      findings.push({
        id: `no-entry:${linkKey(item)}`, level: 'warn', title: 'Un cliente entra directo a un servicio',
        detail: `${nameOf(from)} llama a ${nameOf(to)} sin pasar por una entrada.`,
        learn: 'Sin gateway o balanceador, cada servicio tiene que resolver por su cuenta TLS, límites de peticiones, autenticación y versiones; y no puedes cambiar lo que hay detrás sin tocar al cliente.',
        nodeIds: [from.id, to.id],
        fix: {
          label: 'Poner un API gateway en medio',
          apply: (g) => {
            const midpoint = { x: Math.round((from.x + to.x) / 2), y: Math.round((from.y + to.y) / 2) };
            const added = addNode(g, 'gateway', midpoint);
            let next = { ...added.graph, links: added.graph.links.filter((l) => linkKey(l) !== linkKey(item)) };
            next = link(next, from.id, added.id);
            return link(next, added.id, to.id);
          },
        },
      });
    }
  }

  // Nadie consume la cola, o nadie publica en ella.
  for (const node of graph.nodes.filter((candidate) => layerOfNode(candidate) === 'messaging')) {
    const consumers = outgoing(node.id).filter((item) => isService(byId.get(item.to)!));
    if (incoming(node.id).length && !consumers.length) {
      findings.push({
        id: `no-consumer:${node.id}`, level: 'risk', title: `Nadie consume ${nameOf(node)}`,
        detail: 'Se publica en ella, pero ningún servicio lee los mensajes.',
        learn: 'Una cola sin consumidor crece sin límite: el trabajo nunca se hace y, al llenarse, los productores empiezan a fallar.',
        nodeIds: [node.id],
        fix: { label: 'Añadir un worker que la consuma', apply: (g) => { const added = addNear(g, 'worker', node); return link(added.graph, node.id, added.id); } },
      });
    } else if (!incoming(node.id).length) {
      findings.push({
        id: `no-producer:${node.id}`, level: 'tip', title: `Nadie publica en ${nameOf(node)}`,
        detail: 'La pieza está, pero ningún servicio envía mensajes.',
        learn: 'Conecta el servicio que genera el trabajo con un cable de Eventos: así queda claro quién produce y quién consume.',
        nodeIds: [node.id],
      });
    }
  }

  // Una base compartida por varios microservicios.
  for (const node of graph.nodes.filter((candidate) => ['sql', 'nosql'].includes(candidate.type))) {
    const owners = incoming(node.id).map((item) => byId.get(item.from)!).filter((caller) => caller.type === 'microservice');
    if (owners.length > 1) {
      findings.push({
        id: `shared-db:${node.id}`, level: 'warn', title: `${nameOf(node)} la comparten ${owners.length} microservicios`,
        detail: `${owners.map(nameOf).join(' y ')} leen y escriben la misma base.`,
        learn: 'Si comparten esquema, un cambio en una tabla obliga a desplegarlos juntos: dejan de ser independientes. Cada microservicio debería ser dueño de sus datos y exponerlos por su API o por eventos.',
        nodeIds: [node.id, ...owners.map((owner) => owner.id)],
      });
    }
  }

  // Cadenas síncronas largas: la disponibilidad se multiplica.
  const syncNext = (id: string) => outgoing(id).filter((item) => !isAsync(item.protocol) && isService(byId.get(item.to)!)).map((item) => item.to);
  const longest = (id: string, seen: Set<string>): string[] => {
    const options = syncNext(id).filter((next) => !seen.has(next)).map((next) => longest(next, new Set([...seen, next])));
    return [id, ...(options.sort((a, b) => b.length - a.length)[0] ?? [])];
  };
  const chain = services.map((service) => longest(service.id, new Set([service.id]))).sort((a, b) => b.length - a.length)[0] ?? [];
  if (chain.length >= 3) {
    // En español, con coma decimal: «99,70 %».
    const availability = (99.9 ** chain.length / 100 ** (chain.length - 1)).toFixed(2).replace('.', ',');
    findings.push({
      id: 'long-chain', level: 'warn', title: `Cadena síncrona de ${chain.length} servicios`,
      detail: `${chain.map((id) => nameOf(byId.get(id)!)).join(' → ')} se esperan unos a otros.`,
      learn: `Cada salto síncrono multiplica: con un 99,9 % cada uno, la cadena entera queda en ~${availability} %, y la latencia es la suma. Lo que no haga falta para responder, pásalo a eventos.`,
      nodeIds: chain,
    });
  }

  // Sin identidad con clientes y servicios.
  if (clients.length && services.length && !graph.nodes.some((node) => node.type === 'idp')) {
    const entry = graph.nodes.find((node) => ['gateway', 'bff'].includes(node.type)) ?? services[0];
    findings.push({
      id: 'no-identity', level: 'warn', title: '¿Quién identifica al usuario?',
      detail: 'Hay clientes y servicios, pero ningún proveedor de identidad.',
      learn: 'Gestionar contraseñas, MFA y recuperación tú mismo es caro y arriesgado. Un proveedor OIDC emite tokens firmados que tus servicios validan sin llamarle en cada petición.',
      nodeIds: clients.map((client) => client.id),
      fix: {
        label: 'Añadir un proveedor de identidad',
        apply: (g) => {
          const added = addNear(g, 'idp', clients[0], NODE_HEIGHT + 60);
          let next = added.graph;
          for (const client of clients) {
            next = link(next, client.id, added.id);
          }
          return link(next, entry.id, added.id);
        },
      },
    });
  }

  // Sin observabilidad.
  if (services.length >= 2 && !graph.nodes.some((node) => layerOfNode(node) === 'observability')) {
    findings.push({
      id: 'no-observability', level: 'warn', title: 'Nadie mira lo que pasa',
      detail: `${services.length} servicios sin logs, métricas ni trazas.`,
      learn: 'Sin observabilidad, los fallos los descubren los usuarios. Con OpenTelemetry (OTLP) cada servicio envía trazas, métricas y logs a un mismo sitio, sin atarte a un proveedor.',
      nodeIds: services.map((service) => service.id),
      fix: {
        label: 'Añadir métricas y conectar los servicios',
        apply: (g) => {
          const added = addNear(g, 'logs', services[services.length - 1]);
          return services.reduce((next, service) => link(next, service.id, added.id), added.graph);
        },
      },
    });
  } else if (graph.nodes.filter((node) => node.type === 'microservice').length >= 3 && !graph.nodes.some((node) => node.type === 'tracing')) {
    findings.push({
      id: 'no-tracing', level: 'tip', title: 'Muchos saltos y ninguna traza',
      detail: 'Con tres o más microservicios, saber cuál es el lento sin trazas es adivinar.',
      learn: 'Una traza distribuida sigue una petición por todos los servicios con un mismo identificador: ves cada salto y su tiempo.',
      nodeIds: services.map((service) => service.id),
      fix: { label: 'Añadir trazas', apply: (g) => { const added = addNear(g, 'tracing', services[0]); return services.reduce((next, service) => link(next, service.id, added.id), added.graph); } },
    });
  }

  // Credenciales sin gestor de secretos.
  const dataCallers = services.filter((service) => outgoing(service.id).some((item) => layerOfNode(byId.get(item.to)!) === 'data'));
  if (dataCallers.length && !graph.nodes.some((node) => node.type === 'secrets')) {
    findings.push({
      id: 'no-secrets', level: 'tip', title: '¿Dónde viven las credenciales?',
      detail: `${dataCallers.map(nameOf).join(', ')} se conecta${dataCallers.length > 1 ? 'n' : ''} a datos y no hay gestor de secretos.`,
      learn: 'Una contraseña en el código o en una variable del repositorio acaba filtrándose. Un gestor de secretos la entrega en tiempo de ejecución, la rota y deja auditoría.',
      nodeIds: dataCallers.map((caller) => caller.id),
      fix: { label: 'Añadir un gestor de secretos', apply: (g) => { const added = addNear(g, 'secrets', dataCallers[0], -(NODE_HEIGHT + 40)); return dataCallers.reduce((next, caller) => link(next, caller.id, added.id), added.graph); } },
    });
  }

  // Una base relacional muy leída sin caché.
  for (const node of graph.nodes.filter((candidate) => candidate.type === 'sql')) {
    const callers = incoming(node.id).map((item) => byId.get(item.from)!).filter(isService);
    const hasCache = callers.some((caller) => outgoing(caller.id).some((item) => byId.get(item.to)?.type === 'cache'));
    if (callers.length >= 2 && !hasCache) {
      findings.push({
        id: `no-cache:${node.id}`, level: 'tip', title: `${nameOf(node)} atiende a ${callers.length} servicios sin caché`,
        detail: 'Todas las lecturas llegan a la base.',
        learn: 'Una caché delante (cache-aside) quita a la base las lecturas repetidas: menos latencia y más margen para los picos. Pon caducidad corta a cada clave.',
        nodeIds: [node.id],
        fix: { label: 'Añadir una caché', apply: (g) => { const added = addNear(g, 'cache', node); return callers.reduce((next, caller) => link(next, caller.id, added.id), added.graph); } },
      });
    }
  }

  // Pagos sin webhook de vuelta.
  for (const node of graph.nodes.filter((candidate) => candidate.type === 'payments')) {
    if (!outgoing(node.id).length) {
      const target = graph.nodes.find((candidate) => candidate.type === 'gateway') ?? services[0];
      findings.push({
        id: `no-webhook:${node.id}`, level: 'warn', title: 'El pago no avisa de vuelta',
        detail: 'Nadie recibe la confirmación del proveedor de pagos.',
        learn: 'La respuesta del navegador no prueba que se cobró: un usuario puede cerrar la pestaña o falsearla. La verdad llega por un webhook firmado del proveedor.',
        nodeIds: [node.id],
        ...(target ? { fix: { label: `Webhook hacia ${nameOf(target)}`, apply: (g: AppGraph) => link(g, node.id, target.id) } } : {}),
      });
    }
  }

  // Datos fuera de la red privada.
  const privateBoxes = graph.boxes.filter((box) => box.kind === 'vpc' || box.kind === 'private');
  const exposed = graph.nodes.filter((node) => layerOfNode(node) === 'data' && node.type !== 'storage' && node.type !== 'warehouse')
    .filter((node) => !privateBoxes.some((box) => node.x >= box.x && node.x <= box.x + box.w && node.y >= box.y && node.y <= box.y + box.h));
  if (exposed.length) {
    findings.push({
      id: 'data-outside', level: privateBoxes.length ? 'warn' : 'tip', title: privateBoxes.length ? 'Datos fuera de la red privada' : 'Dibuja la red privada',
      detail: `${exposed.map(nameOf).join(', ')} no está${exposed.length > 1 ? 'n' : ''} dentro de una red privada.`,
      learn: 'Una base alcanzable desde Internet es el objetivo número uno. Va en una subred privada: solo los servicios pueden llegar a ella.',
      nodeIds: exposed.map((node) => node.id),
      fix: {
        label: privateBoxes.length ? 'Meterlos en la red privada' : 'Crear la red privada alrededor',
        apply: (g) => {
          let next = g;
          if (!privateBoxes.length) {
            next = addBox(next, 'vpc');
            const vpc = next.boxes[next.boxes.length - 1];
            const inside = next.nodes.filter((node) => isService(node) || exposed.some((item) => item.id === node.id));
            const left = Math.min(...inside.map((node) => node.x)) - NODE_WIDTH / 2 - 18;
            const top = Math.min(...inside.map((node) => node.y)) - NODE_HEIGHT / 2 - 36;
            const right = Math.max(...inside.map((node) => node.x)) + NODE_WIDTH / 2 + 18;
            const bottom = Math.max(...inside.map((node) => node.y)) + NODE_HEIGHT / 2 + 18;
            next = { ...next, boxes: next.boxes.map((box) => (box.id === vpc.id ? { ...box, label: 'Red privada', x: Math.max(0, left), y: Math.max(0, top), w: right - left, h: bottom - top } : box)) };
            return next;
          }
          const box = privateBoxes[0];
          return {
            ...next,
            nodes: next.nodes.map((node) => (exposed.some((item) => item.id === node.id)
              ? { ...node, x: box.x + box.w - NODE_WIDTH / 2 - 18, y: Math.min(box.y + box.h - NODE_HEIGHT / 2 - 18, Math.max(box.y + NODE_HEIGHT / 2 + 36, node.y)) }
              : node)),
          };
        },
      },
    });
  }

  // Piezas que no corren en ninguna parte de la Infraestructura.
  if (infra.length) {
    const undeployed = graph.nodes.filter((node) => !node.runsOn && (PIECE_LESSONS[node.type]?.runsOn.length ?? 0) > 0);
    const assignable = undeployed.filter((node) => infra.some((target) => PIECE_LESSONS[node.type].runsOn.includes(target.type)));
    if (undeployed.length) {
      findings.push({
        id: 'not-deployed', level: 'tip', title: `${undeployed.length} pieza${undeployed.length > 1 ? 's' : ''} sin «corre en»`,
        detail: `${undeployed.map(nameOf).join(', ')} no dice${undeployed.length > 1 ? 'n' : ''} en qué pieza de la Infraestructura se despliega${undeployed.length > 1 ? 'n' : ''}.`,
        learn: 'La vista de Aplicación y la de Infraestructura son el mismo sistema: decir dónde corre cada pieza es lo que convierte un dibujo en un plan desplegable.',
        nodeIds: undeployed.map((node) => node.id),
        ...(assignable.length ? {
          fix: {
            label: `Asignar ${assignable.length} automáticamente`,
            apply: (g: AppGraph) => ({
              ...g,
              nodes: g.nodes.map((node) => {
                if (!assignable.some((item) => item.id === node.id)) {
                  return node;
                }
                const target = infra.find((candidate) => PIECE_LESSONS[node.type].runsOn.includes(candidate.type));
                return target ? { ...node, runsOn: target.id } : node;
              }),
            }),
          },
        } : {}),
      });
    }
  }

  // Piezas sueltas.
  const loose = graph.nodes.filter((node) => !outgoing(node.id).length && !incoming(node.id).length);
  if (loose.length && graph.nodes.length > 1) {
    findings.push({
      id: 'loose', level: 'tip', title: `${loose.length} pieza${loose.length > 1 ? 's' : ''} sin conectar`,
      detail: `${loose.map(nameOf).join(', ')} no habla${loose.length > 1 ? 'n' : ''} con nadie.`,
      learn: 'Arrastra desde el punto del borde de una pieza hasta otra: el lienzo te dirá si esa conexión aplica y con qué protocolo.',
      nodeIds: loose.map((node) => node.id),
    });
  }

  const order: Record<FindingLevel, number> = { risk: 0, warn: 1, tip: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  const marks = new Map<string, FindingLevel>();
  // En el lienzo solo se marcan riesgos y mejoras: las ideas viven en la revisión.
  for (const finding of findings.filter((item) => item.level !== 'tip')) {
    for (const id of finding.nodeIds) {
      if (!marks.has(id) || order[finding.level] < order[marks.get(id)!]) {
        marks.set(id, finding.level);
      }
    }
  }
  const risks = findings.filter((finding) => finding.level === 'risk').length;
  const warns = findings.filter((finding) => finding.level === 'warn').length;
  const verdict = risks ? 'risk' : warns ? 'limited' : 'ok';
  const headline = !graph.nodes.length ? 'Lienzo vacío'
    : risks ? `${risks} riesgo${risks > 1 ? 's' : ''} que resolver`
      : warns ? `Funciona, con ${warns} punto${warns > 1 ? 's' : ''} débil${warns > 1 ? 'es' : ''}`
        : 'Diseño sólido';
  return { findings, verdict, headline, marks };
}

/** Aplica un arreglo y deja el lienzo sin choques. */
export function applyFix(graph: AppGraph, finding: Finding): AppGraph {
  return finding.fix ? settle(finding.fix.apply(graph)) : graph;
}
