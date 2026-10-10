import { autoLayout } from './auto-layout';
import { CloudLink, CloudNode } from './cloud-topology.data';
import { at, BASE, BASE_ZONES, MAX_NODES, placed, StudioPreset, StudioProject } from './studio-project';

/**
 * Patrón de datos listo para cargar en el lienzo. Es una plantilla como las demás (se
 * construye, se exporta al backend y se valida igual), con lo que la galería necesita contar:
 * qué problema resuelve y qué se paga por ello.
 */
export interface DataBlueprint extends StudioPreset {
  /** Versión del blueprint: sube cuando cambia su grafo. */
  version: number;
  problem: string;
  tradeoff: string;
}

const ILLUSTRATIVE = 'Patrón de referencia: ilustra el flujo de datos; no describe la infraestructura real de ninguna entidad.';

const ENTRY: CloudLink[] = [{ from: 'users', to: 'edge' }, { from: 'edge', to: 'lb' }, { from: 'lb', to: 'api' }];

/** Deja el grafo en la forma que daría «Auto-ordenar», como el resto de las plantillas. */
function arranged(project: StudioProject): StudioProject {
  return { ...project, nodes: autoLayout(project.nodes, project.links, project.zones) };
}

export const DATA_BLUEPRINTS: DataBlueprint[] = [
  {
    id: 'cdc-realtime',
    version: 1,
    name: 'CDC en tiempo real',
    summary: 'OLTP → CDC → almacén de datos',
    problem: 'Analítica al día sin cargar la base de datos transaccional con consultas pesadas ni esperar al lote nocturno.',
    tradeoff: 'Datos con segundos de retraso y sin tocar la aplicación, a cambio de operar una pieza más y de vigilar los cambios de esquema.',
    description: `La base de datos transaccional sigue atendiendo a la aplicación; un servicio de captura de cambios lee su registro de transacciones y lleva cada cambio al almacén de datos. ${ILLUSTRATIVE}`,
    build: () => arranged({
      provider: 'aws',
      zones: structuredClone(BASE_ZONES),
      nodes: [
        BASE('users'), BASE('edge'), BASE('lb'), BASE('api'),
        at(BASE('postgres'), 710, 250, { role: 'OLTP · transaccional' }),
        placed('cdc', 'cdc', 865, 300, { role: 'Captura de cambios' }),
        placed('warehouse', 'warehouse', 1005, 300, { role: 'Almacén de datos' }),
        BASE('secrets'),
      ],
      links: [
        ...ENTRY, { from: 'api', to: 'postgres' },
        { from: 'postgres', to: 'cdc', kind: 'CDC_STREAM' }, { from: 'cdc', to: 'warehouse', kind: 'CDC_STREAM' },
      ],
    }),
  },
  {
    id: 'event-analytics',
    version: 1,
    name: 'Analítica por eventos',
    summary: 'Servicios → streaming → procesamiento → almacén → BI',
    problem: 'Varios servicios generan eventos y negocio quiere verlos agregados en un panel casi al momento.',
    tradeoff: 'Métricas en minutos y servicios desacoplados, a cambio de consistencia eventual y de más piezas que observar.',
    description: `Los servicios publican eventos en un stream; un procesador los agrega y los deja en el almacén de datos, del que leen los paneles. ${ILLUSTRATIVE}`,
    build: () => arranged({
      provider: 'aws',
      zones: structuredClone(BASE_ZONES),
      nodes: [
        BASE('users'), BASE('edge'), BASE('lb'),
        at(BASE('api'), 556, 250, { role: 'Servicio de pedidos' }),
        placed('containers', 'payments', 556, 340, { role: 'Servicio de pagos', zone: 'compute' }),
        BASE('postgres'),
        placed('event-stream', 'events', 865, 215, { role: 'Stream de eventos' }),
        placed('stream-processing', 'processing', 865, 300, { role: 'Agregación en ventanas' }),
        placed('warehouse', 'warehouse', 865, 385, { role: 'Almacén de datos' }),
        placed('bi', 'dashboards', 865, 470, { role: 'Paneles de negocio' }),
        at(BASE('secrets'), 1005, 215),
      ],
      links: [
        ...ENTRY, { from: 'lb', to: 'payments' }, { from: 'api', to: 'postgres' }, { from: 'payments', to: 'postgres' },
        { from: 'api', to: 'events', kind: 'EVENT_BUS' }, { from: 'payments', to: 'events', kind: 'EVENT_BUS' },
        { from: 'events', to: 'processing', kind: 'EVENT_BUS' },
        { from: 'processing', to: 'warehouse', kind: 'ANALYTICS_SINK' }, { from: 'warehouse', to: 'dashboards', kind: 'ANALYTICS_SINK' },
      ],
    }),
  },
  {
    id: 'multi-region-recovery',
    version: 1,
    name: 'Recuperación multirregión',
    summary: 'Base de datos global con réplica en otra región',
    problem: 'Seguir dando servicio, sin perder los datos, cuando una región entera deja de responder.',
    tradeoff: 'Recuperación en minutos en lugar de horas, a cambio de pagar una segunda región y de aceptar el retraso de la réplica.',
    description: `Una región atiende las escrituras; la base de datos global replica en una segunda región, donde una copia de la API espera para tomar el relevo. ${ILLUSTRATIVE}`,
    build: () => arranged({
      provider: 'aws',
      zones: [...structuredClone(BASE_ZONES), { id: 'second-region', kind: 'region', role: 'managed', x: 24, y: 400, w: 250, h: 200, label: 'Región secundaria' }],
      nodes: [
        BASE('users'), BASE('edge'), BASE('lb'), BASE('api'),
        placed('global-database', 'primary', 710, 250, { role: 'Primaria · escrituras' }),
        placed('containers', 'api-standby', 149, 455, { role: 'API en espera', zone: 'managed' }),
        placed('global-database', 'replica', 149, 545, { role: 'Réplica · otra región', zone: 'managed' }),
        BASE('secrets'),
      ],
      links: [
        ...ENTRY, { from: 'api', to: 'primary' },
        { from: 'primary', to: 'replica', kind: 'REPLICATION' },
        { from: 'edge', to: 'api-standby', label: 'failover' }, { from: 'api-standby', to: 'replica' },
      ],
    }),
  },
];

export const BLUEPRINT_IDS: string[] = DATA_BLUEPRINTS.map((blueprint) => blueprint.id);

/** Petición de cargar un blueprint: sustituyendo el lienzo o agregándose a él. */
export interface BlueprintLoad {
  blueprint: DataBlueprint;
  mode: 'replace' | 'add';
}

export type MergeResult = { ok: true; project: StudioProject; added: number } | { ok: false; error: string };

/**
 * Agrega un blueprint a un lienzo que ya tiene contenido. Una pieza del blueprint que ya está
 * en el lienzo (mismo id y mismo tipo: los visitantes, el balanceador, la API…) no se duplica:
 * el blueprint se engancha a ella. El resto entra con un id libre. El lienzo conserva su nube y
 * el resultado queda auto-ordenado.
 */
export function mergeBlueprint(current: StudioProject, blueprint: StudioProject): MergeResult {
  const taken = new Map(current.nodes.map((node) => [node.id, node]));
  const renamed = new Map<string, string>();
  const incoming: CloudNode[] = [];
  for (const node of blueprint.nodes) {
    const existing = taken.get(node.id);
    if (existing && existing.type === node.type) {
      renamed.set(node.id, node.id);
      continue;
    }
    let id = node.id;
    for (let suffix = 2; taken.has(id); suffix++) {
      id = `${node.id}-${suffix}`;
    }
    renamed.set(node.id, id);
    const copy = { ...structuredClone(node), id };
    taken.set(id, copy);
    incoming.push(copy);
  }
  if (current.nodes.length + incoming.length > MAX_NODES) {
    return { ok: false, error: `El lienzo admite ${MAX_NODES} nodos como máximo: no cabe el patrón entero.` };
  }

  const links = [...current.links];
  for (const link of blueprint.links) {
    const from = renamed.get(link.from)!;
    const to = renamed.get(link.to)!;
    if (!links.some((existing) => existing.from === from && existing.to === to)) {
      links.push({ ...link, from, to });
    }
  }
  const zones = [...current.zones, ...structuredClone(blueprint.zones).filter((zone) => !current.zones.some((existing) => existing.id === zone.id))];
  const nodes = autoLayout([...current.nodes, ...incoming], links, zones);
  return { ok: true, project: { provider: current.provider, nodes, links, zones }, added: incoming.length };
}
