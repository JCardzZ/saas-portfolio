import { SERVICE_CATALOG } from './cloud-catalog.data';
import { CLOUD_PROVIDERS, CloudLink, CloudNode, CloudProviderId, forProvider } from './cloud-topology.data';
import { Localized, SERVICE_INFO, localized } from './service-info.data';
import { StudioZone, nodeLabel, zoneAt, zoneLabel } from './studio-project';

/** Coste de un nodo tal como lo calcula el lienzo (`CloudInfraComponent.nodeCosts`). */
export interface NodeCost {
  label: string;
  live: boolean;
}

/** Lo que la tarjeta necesita saber del diagrama en el que está el nodo. */
export interface CardContext {
  nodes: CloudNode[];
  links: CloudLink[];
  zones: StudioZone[];
  provider: CloudProviderId;
  /** Nubes entre las que el visitante puede cambiar (OCI solo si su función está encendida). */
  providers: CloudProviderId[];
  /** Avisos de las reglas del grafo, por nodo. */
  warnings?: ReadonlyMap<string, string[]>;
  costs?: ReadonlyMap<string, NodeCost>;
  lang?: keyof Localized;
}

export type CostKind = 'live' | 'rough' | 'none';

export interface ServiceCard {
  nodeId: string;
  type: string;
  /** Nombre con el que se ve el nodo en el lienzo. */
  title: string;
  /** Nombre oficial del servicio en la nube activa. */
  officialName: string;
  what: string;
  uses: string[];
  note: string | null;
  docs: { url: string; host: string } | null;
  /** `direct: false` cuando en esta nube no hay un servicio equivalente; `tradeoff` explica la alternativa. */
  equivalence: { direct: boolean; tradeoff: string | null };
  /** El mismo producto en cualquier nube: no hay equivalentes que ofrecer. */
  cloudAgnostic: boolean;
  context: { receivesFrom: string[]; sendsTo: string[]; zone: string; warnings: string[] };
  cost: { label: string; kind: CostKind; tag: string };
  equivalents: { provider: CloudProviderId; cloud: string; name: string; direct: boolean }[];
}

const COST_TAGS: Record<CostKind, string> = {
  live: 'Precio de lista',
  rough: 'Cifra orientativa',
  none: 'Sin estimación',
};

const OUTSIDE = 'Fuera de la red de la nube';

function gaps(type: string): Partial<Record<CloudProviderId, string>> {
  for (const category of SERVICE_CATALOG) {
    const item = category.items.find((candidate) => candidate.type === type);
    if (item) {
      return item.noDirectEquivalent ?? {};
    }
  }
  return {};
}

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Todo lo que muestra la tarjeta de un nodo: la ficha del catálogo, en la nube activa, más lo que
 * se deduce del diagrama (de quién recibe, a quién envía, en qué zona está y qué avisos tiene).
 * Una pieza que no está en el catálogo (añadida por el copiloto o de una plantilla) se describe
 * con lo que el propio nodo trae.
 */
export function buildServiceCard(node: CloudNode, context: CardContext): ServiceCard {
  const { nodes, links, zones, provider } = context;
  const lang = context.lang ?? 'es';
  const info = SERVICE_INFO[node.type];
  const own = info?.providers?.[provider] ?? info?.product ?? null;
  const shown = (other: CloudNode) => nodeLabel(other, nodes, forProvider(other.service, provider));
  const named = (ids: string[]) => ids.map((id) => nodes.find((candidate) => candidate.id === id)).filter((found): found is CloudNode => !!found).map(shown);
  // `x` e `y` son el centro del nodo.
  const zone = zoneAt(zones, node.x, node.y);
  const missing = gaps(node.type);
  const cost = context.costs?.get(node.id);
  const kind: CostKind = !cost || cost.label === 'sin estimación' ? 'none' : cost.live ? 'live' : 'rough';

  return {
    nodeId: node.id,
    type: node.type,
    title: shown(node),
    officialName: own?.name ?? forProvider(node.service, provider),
    what: info ? localized(info.what, lang) : node.why || node.role,
    uses: info ? info.uses.map((use) => localized(use, lang)) : [],
    note: own?.note ? localized(own.note, lang) : null,
    docs: own?.docs ? { url: own.docs, host: host(own.docs) } : null,
    equivalence: { direct: !missing[provider], tradeoff: missing[provider] ?? null },
    cloudAgnostic: !info?.providers,
    context: {
      receivesFrom: named(links.filter((link) => link.to === node.id).map((link) => link.from)),
      sendsTo: named(links.filter((link) => link.from === node.id).map((link) => link.to)),
      zone: zone ? zoneLabel(zone, provider) : OUTSIDE,
      warnings: context.warnings?.get(node.id) ?? [],
    },
    cost: { label: kind === 'none' ? 'Sin estimación' : cost!.label, kind, tag: COST_TAGS[kind] },
    equivalents: info?.providers
      ? context.providers.filter((other) => other !== provider).map((other) => ({
        provider: other,
        cloud: CLOUD_PROVIDERS.find((candidate) => candidate.id === other)?.name ?? other,
        name: info.providers![other].name,
        direct: !missing[other],
      }))
      : [],
  };
}

/** Lo mínimo para el aviso que sale al pasar el cursor: nombre y una frase. */
export function serviceTooltip(node: CloudNode, context: Pick<CardContext, 'nodes' | 'provider' | 'lang'>): { name: string; what: string } {
  const info = SERVICE_INFO[node.type];
  return {
    name: nodeLabel(node, context.nodes, forProvider(node.service, context.provider)),
    what: info ? localized(info.what, context.lang ?? 'es') : node.why || node.role,
  };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CardSide = 'right' | 'left' | 'bottom' | 'top';

export interface CardPlacement {
  x: number;
  y: number;
  /** Lado del nodo en el que queda la tarjeta. */
  side: CardSide;
  /** Posición de la flecha a lo largo del borde de la tarjeta que mira al nodo, en px desde su inicio. */
  arrow: number;
}

/**
 * Dónde poner la tarjeta para que quede junto al nodo, sin taparlo y entera dentro de la ventana.
 * Prueba a la derecha, a la izquierda, debajo y encima; si en ningún lado cabe sin tapar, usa el
 * que más sitio tiene y la encaja en la ventana. `anchor` y el resultado van en coordenadas de la ventana.
 */
export function placeCard(
  anchor: Box, card: { width: number; height: number }, viewport: { width: number; height: number }, gap = 12, margin = 8,
): CardPlacement {
  const room: Record<CardSide, number> = {
    right: viewport.width - margin - (anchor.x + anchor.width + gap),
    left: anchor.x - gap - margin,
    bottom: viewport.height - margin - (anchor.y + anchor.height + gap),
    top: anchor.y - gap - margin,
  };
  const need = (side: CardSide) => (side === 'right' || side === 'left' ? card.width : card.height);
  const order: CardSide[] = ['right', 'left', 'bottom', 'top'];
  const side = order.find((candidate) => room[candidate] >= need(candidate))
    ?? order.reduce((best, candidate) => (room[candidate] - need(candidate) > room[best] - need(best) ? candidate : best));
  const clamp = (value: number, size: number, limit: number) => Math.max(margin, Math.min(value, limit - margin - size));
  const horizontal = side === 'right' || side === 'left';
  const x = horizontal
    ? clamp(side === 'right' ? anchor.x + anchor.width + gap : anchor.x - gap - card.width, card.width, viewport.width)
    : clamp(anchor.x + anchor.width / 2 - card.width / 2, card.width, viewport.width);
  const y = horizontal
    ? clamp(anchor.y + anchor.height / 2 - card.height / 2, card.height, viewport.height)
    : clamp(side === 'bottom' ? anchor.y + anchor.height + gap : anchor.y - gap - card.height, card.height, viewport.height);
  // La flecha apunta al centro del nodo, sin salirse de las esquinas redondeadas de la tarjeta.
  const inset = 16;
  const along = horizontal ? anchor.y + anchor.height / 2 - y : anchor.x + anchor.width / 2 - x;
  const length = horizontal ? card.height : card.width;
  return { x, y, side, arrow: Math.max(inset, Math.min(along, length - inset)) };
}
