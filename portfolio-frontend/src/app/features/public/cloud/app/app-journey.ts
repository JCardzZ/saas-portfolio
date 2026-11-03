import { pieceOf } from './app-catalog.data';
import { AppGraph, AppNode, isAsync } from './app-graph';
import { PIECE_LESSONS, PROTOCOL_LESSONS } from './app-learn.data';
import { Protocol } from './app-protocols';

/**
 * Recorrido de una petición por lo dibujado en el Estudio de Aplicación (flag `studio.app-canvas`):
 * desde un cliente, el camino síncrono más profundo hasta los datos; después, lo que ocurre fuera
 * de la respuesta (colas, eventos). Latencias orientativas dentro de una región.
 */
export interface JourneyHop {
  nodeId: string;
  name: string;
  /** Protocolo con el que se llega a esta pieza (`null` en el cliente). */
  protocol: Protocol | null;
  ms: number;
  async: boolean;
  impact: string;
  mitigation: string;
}

export interface DrawnJourney {
  hops: JourneyHop[];
  totalMs: number;
  /** Ida y vuelta por la red pública, sumada al total. */
  networkMs: number;
}

const NETWORK_MS = 80;

function hop(node: AppNode, protocol: Protocol | null, async: boolean): JourneyHop {
  const lesson = PIECE_LESSONS[node.type];
  return {
    nodeId: node.id,
    name: node.name?.trim() || pieceOf(node.type)?.name || node.type,
    protocol,
    ms: async ? 0 : (lesson?.ms ?? 0) + (protocol ? PROTOCOL_LESSONS[protocol].ms : 0),
    async,
    impact: lesson?.failure.impact ?? '',
    mitigation: lesson?.failure.mitigation ?? '',
  };
}

/** `null` si no hay ningún cliente conectado del que partir. */
export function drawnJourney(graph: AppGraph, startId?: string): DrawnJourney | null {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const clients = graph.nodes.filter((node) => pieceOf(node.type)?.layer === 'client' && graph.links.some((link) => link.from === node.id));
  const start = (startId ? byId.get(startId) : null) ?? clients[0];
  if (!start) {
    return null;
  }
  // Camino síncrono más profundo (sin repetir piezas), prefiriendo seguir hacia los datos.
  const sync = (id: string) => graph.links.filter((link) => link.from === id && !isAsync(link.protocol) && !['identity', 'observability'].includes(pieceOf(byId.get(link.to)!.type)?.layer ?? ''));
  const deepest = (id: string, seen: Set<string>): { id: string; protocol: Protocol | null }[] => {
    const options = sync(id).filter((link) => !seen.has(link.to))
      .map((link) => [{ id: link.to, protocol: link.protocol }, ...deepest(link.to, new Set([...seen, link.to])).slice(1)])
      .sort((a, b) => b.length - a.length || score(b) - score(a));
    return [{ id, protocol: null }, ...(options[0] ?? [])];
  };
  const score = (path: { id: string }[]) => (pieceOf(byId.get(path[path.length - 1].id)!.type)?.layer === 'data' ? 1 : 0);
  const path = deepest(start.id, new Set([start.id]));
  const hops = path.map((step, index) => hop(byId.get(step.id)!, index ? step.protocol : null, false));
  // Después de la respuesta: lo que sale en asíncrono desde el camino.
  for (const step of path) {
    for (const link of graph.links.filter((item) => item.from === step.id && isAsync(item.protocol) && pieceOf(byId.get(item.to)!.type)?.layer !== 'observability')) {
      if (!hops.some((item) => item.nodeId === link.to)) {
        hops.push(hop(byId.get(link.to)!, link.protocol, true));
        for (const next of graph.links.filter((item) => item.from === link.to && isAsync(item.protocol))) {
          if (!hops.some((item) => item.nodeId === next.to)) {
            hops.push(hop(byId.get(next.to)!, next.protocol, true));
          }
        }
      }
    }
  }
  const mobileOrWeb = hops.length > 1 ? NETWORK_MS : 0;
  return { hops, networkMs: mobileOrWeb, totalMs: mobileOrWeb + hops.filter((item) => !item.async).reduce((sum, item) => sum + item.ms, 0) };
}
