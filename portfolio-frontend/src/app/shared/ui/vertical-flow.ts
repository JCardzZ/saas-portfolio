/**
 * Disposición vertical de un grafo pequeño para pantallas estrechas: los nodos se apilan de
 * arriba abajo a todo el ancho, en el orden en que fluye la petición, y las conexiones que no
 * unen nodos vecinos bajan por carriles a la izquierda. Sale de los mismos nodos y enlaces que
 * la disposición horizontal: no hay un segundo diagrama que mantener.
 */
export interface FlowBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  path: string;
}

export interface FlowLayout {
  width: number;
  height: number;
  boxes: FlowBox[];
  edges: FlowEdge[];
}

export interface FlowOptions {
  nodeHeight: number;
  /** Separación vertical entre nodos. */
  gap?: number;
  /** Ancho de cada carril de conexiones. */
  lane?: number;
}

const CORNER = 6;

/**
 * Orden de arriba abajo: cada nodo va después de todos los que apuntan a él y los sueltos, al
 * final. Con un ciclo, el orden dado.
 */
export function flowOrder(ids: readonly string[], links: readonly (readonly [string, string])[]): string[] {
  const depth = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const [from, to] of links) {
      const next = (depth.get(from) ?? 0) + 1;
      if (depth.has(to) && depth.has(from) && next > depth.get(to)!) {
        depth.set(to, next);
        changed = true;
      }
    }
    if (!changed) {
      // Lo que no se conecta con nada (piezas de apoyo) va al final, para no partir el recorrido.
      const linked = new Set(links.flat());
      const rank = (id: string): number => (linked.has(id) ? depth.get(id)! : Number.MAX_SAFE_INTEGER);
      // El orden original desempata: los nodos de una misma capa quedan como los escribió quien dibujó el diagrama.
      return [...ids].sort((a, b) => rank(a) - rank(b) || ids.indexOf(a) - ids.indexOf(b));
    }
  }
  return [...ids];
}

export function verticalFlow(
  ids: readonly string[], links: readonly (readonly [string, string])[], width: number, options: FlowOptions,
): FlowLayout {
  const { nodeHeight, gap = 20, lane = 12 } = options;
  const order = flowOrder(ids, links);
  const row = new Map(order.map((id, index) => [id, index]));
  const known = links.filter(([from, to]) => row.has(from) && row.has(to) && from !== to);

  // Un enlace entre vecinos es un tramo recto; los demás comparten carril si salen del mismo nodo.
  const isNeighbour = ([from, to]: readonly [string, string]): boolean => Math.abs(row.get(from)! - row.get(to)!) === 1;
  const buses = new Map<string, { top: number; bottom: number; lane: number }>();
  for (const link of known.filter((candidate) => !isNeighbour(candidate))) {
    const [from, to] = link;
    const key = row.get(from)! < row.get(to)! ? `out:${from}` : `in:${to}`;
    const bus = buses.get(key) ?? { top: Infinity, bottom: -Infinity, lane: 0 };
    bus.top = Math.min(bus.top, row.get(from)!, row.get(to)!);
    bus.bottom = Math.max(bus.bottom, row.get(from)!, row.get(to)!);
    buses.set(key, bus);
  }
  // Los tramos más cortos van más cerca de los nodos; dos que se pisan no comparten carril.
  const placed: { top: number; bottom: number; lane: number }[] = [];
  for (const bus of [...buses.values()].sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top))) {
    let index = 0;
    while (placed.some((other) => other.lane === index && other.top < bus.bottom && bus.top < other.bottom)) {
      index++;
    }
    bus.lane = index;
    placed.push(bus);
  }
  const lanes = placed.reduce((max, bus) => Math.max(max, bus.lane + 1), 0);
  const gutter = lanes ? lanes * lane + 8 : 1;

  const boxes = order.map((id, index): FlowBox => (
    { id, x: gutter, y: 1 + index * (nodeHeight + gap), w: Math.max(0, width - gutter - 1), h: nodeHeight }));
  const box = new Map(boxes.map((candidate) => [candidate.id, candidate]));
  const centre = gutter + (width - gutter - 1) / 2;

  const edges = known.map(([from, to]): FlowEdge => {
    const a = box.get(from)!;
    const b = box.get(to)!;
    const down = a.y < b.y;
    if (isNeighbour([from, to])) {
      return { from, to, path: down ? `M${centre} ${a.y + a.h} V${b.y}` : `M${centre} ${a.y} V${b.y + b.h}` };
    }
    const bus = buses.get(down ? `out:${from}` : `in:${to}`)!;
    const x = gutter - 8 - bus.lane * lane;
    // Lo que sale de un nodo lo hace por debajo de su centro y lo que llega, por encima: no se pisan.
    const startY = a.y + a.h * (down ? 0.68 : 0.32);
    const endY = b.y + b.h * (down ? 0.32 : 0.68);
    const turn = down ? CORNER : -CORNER;
    return {
      from, to,
      path: `M${a.x} ${startY} H${x + CORNER} Q${x} ${startY} ${x} ${startY + turn} V${endY - turn} Q${x} ${endY} ${x + CORNER} ${endY} H${b.x}`,
    };
  });

  const last = boxes[boxes.length - 1];
  return { width, height: last ? last.y + last.h + 1 : 0, boxes, edges };
}
