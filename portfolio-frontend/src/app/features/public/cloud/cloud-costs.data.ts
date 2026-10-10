import { CatalogCategory, SERVICE_CATALOG } from './cloud-catalog.data';
import { CloudNode, CloudProviderId, PerProvider, forProvider } from './cloud-topology.data';

export type CostCategoryId = 'compute' | 'data' | 'messaging' | 'edge' | 'ops';

export const COST_CATEGORIES: { id: CostCategoryId; name: string }[] = [
  { id: 'compute', name: 'Cómputo' },
  { id: 'data', name: 'Datos' },
  { id: 'messaging', name: 'Mensajería' },
  { id: 'edge', name: 'Borde, CDN y red' },
  { id: 'ops', name: 'Observabilidad y seguridad' },
];

type Usd = number | Record<CloudProviderId, number>;

/**
 * Coste mensual ORIENTATIVO en USD de cada tipo de nodo, para el tamaño más pequeño razonable
 * en producción (una instancia o dos réplicas pequeñas, tráfico bajo). Son órdenes de magnitud
 * escritos a mano a partir de las tarifas públicas, NO una consulta a las API de precios: no
 * incluyen tráfico de salida, soporte, impuestos ni descuentos, y cambian con la región.
 * Sirven para comparar topologías entre sí, no para presupuestar.
 */
export const NODE_COSTS: Record<string, { category: CostCategoryId; usd: Usd }> = {
  // Fuera de la factura de la nube.
  users: { category: 'edge', usd: 0 },
  gemini: { category: 'compute', usd: 0 }, // pago por uso, facturado aparte
  cicd: { category: 'ops', usd: 0 },
  // Sistemas en el centro de datos propio: no están en la factura de la nube.
  mainframe: { category: 'data', usd: 0 },
  mq: { category: 'messaging', usd: 0 },

  edge: { category: 'edge', usd: 20 },
  static: { category: 'edge', usd: { aws: 5, gcp: 5, azure: 8 } },
  lb: { category: 'edge', usd: { aws: 22, gcp: 18, azure: 25 } },
  // Apigee no tiene un escalón pequeño: su entorno base de pago por uso ya ronda esa cifra.
  'api-gateway': { category: 'edge', usd: { aws: 4, gcp: 365, azure: 4 } },
  waf: { category: 'edge', usd: { aws: 10, gcp: 8, azure: 20 } },
  dns: { category: 'edge', usd: 1 },

  containers: { category: 'compute', usd: { aws: 36, gcp: 30, azure: 40 } },
  kubernetes: { category: 'compute', usd: { aws: 133, gcp: 133, azure: 65 } },
  vm: { category: 'compute', usd: { aws: 30, gcp: 25, azure: 30 } },
  functions: { category: 'compute', usd: 2 },
  'app-platform': { category: 'compute', usd: { aws: 25, gcp: 20, azure: 13 } },
  'ml-platform': { category: 'compute', usd: 0 }, // pago por uso

  postgres: { category: 'data', usd: { aws: 30, gcp: 28, azure: 32 } },
  redis: { category: 'data', usd: { aws: 13, gcp: 36, azure: 16 } },
  nosql: { category: 'data', usd: { aws: 5, gcp: 5, azure: 24 } },
  mongodb: { category: 'data', usd: 57 },
  'wide-column': { category: 'data', usd: { aws: 10, gcp: 470, azure: 350 } },
  search: { category: 'data', usd: 95 },
  warehouse: { category: 'data', usd: { aws: 180, gcp: 20, azure: 150 } },
  bucket: { category: 'data', usd: 3 },
  'newsql-pg': { category: 'data', usd: { aws: 60, gcp: 150, azure: 110 } },
  'global-sql': { category: 'data', usd: { aws: 30, gcp: 65, azure: 24 } },
  graph: { category: 'data', usd: { aws: 75, gcp: 65, azure: 24 } },
  'sql-query': { category: 'data', usd: 5 },

  streaming: { category: 'messaging', usd: { aws: 70, gcp: 130, azure: 22 } },
  queue: { category: 'messaging', usd: { aws: 1, gcp: 1, azure: 10 } },
  pubsub: { category: 'messaging', usd: 1 },
  rabbitmq: { category: 'messaging', usd: { aws: 20, gcp: 15, azure: 15 } },
  'stream-processing': { category: 'messaging', usd: { aws: 80, gcp: 70, azure: 80 } },
  workflow: { category: 'messaging', usd: 1 },

  secrets: { category: 'ops', usd: 1 },
  vault: { category: 'ops', usd: 25 },
  identity: { category: 'ops', usd: 0 },
  registry: { category: 'ops', usd: { aws: 1, gcp: 1, azure: 5 } },
  'native-monitoring': { category: 'ops', usd: { aws: 10, gcp: 8, azure: 12 } },
  prometheus: { category: 'ops', usd: 15 },
  datadog: { category: 'ops', usd: 30 },
  opentelemetry: { category: 'ops', usd: 5 },
};

/**
 * Servicios del catálogo sin cifra orientativa. No se inventa una: salen como «sin estimación»
 * y no suman al total, hasta que alguien la contraste con la calculadora oficial y la pase a
 * `NODE_COSTS`. La lista es explícita para que un servicio nuevo no quede sin precio por olvido.
 */
export const COST_UNKNOWN_TYPES: ReadonlySet<string> = new Set([
  'global-database', 'event-stream', 'cdc', 'debezium', 'goldengate', 'kafka', 'snowflake', 'databricks', 'bi', 'tableau', 'powerbi', 'looker-studio',
]);

/** Categoría de los servicios que no tienen cifra orientativa pero sí pueden tener precio real. */
const LIVE_CATEGORIES: Record<string, CostCategoryId> = { 'event-stream': 'messaging', kafka: 'messaging' };

export interface CostItem {
  nodeId: string;
  type: string;
  name: string;
  usd: number;
  /** El importe es un precio de lista leído de la API del proveedor, no la cifra orientativa. */
  live?: boolean;
}

export interface CostEstimate {
  /** Parte del total que sale de precios de lista reales; el resto son cifras orientativas. */
  liveUsd: number;
  /** Servicios del catálogo que están en el lienzo y para los que no hay cifra: no suman al total. */
  unestimated: { nodeId: string; name: string }[];
  total: number;
  categories: { id: CostCategoryId; name: string; usd: number; items: CostItem[] }[];
  /** La partida más cara, si hay alguna con coste. */
  top: CostItem | null;
}

/** Costes por tipo de servicio y nube que sustituyen a los locales (los que sirve el backend). */
export type CostOverrides = Record<string, Partial<Record<CloudProviderId, number>>>;

/**
 * Suma el coste orientativo de los nodos del lienzo en la nube elegida, por categoría.
 * Si el backend ha servido el coste de un servicio, manda sobre el que lleva el estudio.
 */
/**
 * `live` son precios de lista reales por tipo de servicio (USD al mes de una unidad): mandan
 * sobre cualquier otra cifra y quedan marcados, para que nunca se confundan con una estimación.
 */
export function estimateCost(
  nodes: CloudNode[], provider: CloudProviderId, overrides: CostOverrides = {}, live: Readonly<Record<string, number>> = {},
): CostEstimate {
  const items = nodes.flatMap((node) => {
    const cost = NODE_COSTS[node.type];
    const local = !cost ? 0 : typeof cost.usd === 'number' ? cost.usd : cost.usd[provider];
    const real = live[node.type];
    const usd = real ?? overrides[node.type]?.[provider] ?? local;
    // Un servicio sin cifra orientativa también cuenta si llega su precio real.
    const category = cost?.category ?? LIVE_CATEGORIES[node.type] ?? 'data';
    return usd > 0 && (cost || real !== undefined)
      ? [{ category, nodeId: node.id, type: node.type, name: forProvider(node.service, provider), usd, ...(real !== undefined ? { live: true } : {}) }]
      : [];
  });
  const unestimated = nodes.filter((node) => COST_UNKNOWN_TYPES.has(node.type) && live[node.type] === undefined && !((overrides[node.type]?.[provider] ?? 0) > 0))
    .map((node) => ({ nodeId: node.id, name: node.name?.trim() || forProvider(node.service, provider) }));
  const categories = COST_CATEGORIES.map((category) => {
    const own = items.filter((item) => item.category === category.id).sort((a, b) => b.usd - a.usd);
    return {
      ...category,
      usd: own.reduce((sum, item) => sum + item.usd, 0),
      items: own.map(({ nodeId, type, name, usd, live: real }) => ({ nodeId, type, name, usd, ...(real ? { live: true } : {}) })),
    };
  }).filter((category) => category.usd > 0);

  const all = categories.flatMap((category) => category.items);
  return {
    total: categories.reduce((sum, category) => sum + category.usd, 0),
    categories,
    liveUsd: all.filter((item) => item.live).reduce((sum, item) => sum + item.usd, 0),
    unestimated,
    top: all.reduce<CostItem | null>((best, item) => (!best || item.usd > best.usd ? item : best), null),
  };
}

export function formatUsd(usd: number): string {
  return `$${Math.round(usd).toLocaleString('en-US')}`;
}

// ---------- Catálogo servido por el backend ----------

/** Una entrada del catálogo en una nube, tal como la guarda y la sirve el backend. */
export interface CatalogRow {
  id: string;
  provider: CloudProviderId;
  code: string;
  name: string;
  category: string;
  defaultMonthlyCost: number;
  isEnterprise: boolean;
}

const PROVIDER_IDS: CloudProviderId[] = ['aws', 'gcp', 'azure'];

/** El catálogo del estudio como filas: lo que se siembra en el backend y lo que simula el modo demo. */
export function catalogRows(): CatalogRow[] {
  return SERVICE_CATALOG.flatMap((category) => category.items.flatMap((item) => PROVIDER_IDS.map((provider) => {
    const usd = NODE_COSTS[item.type]?.usd ?? 0;
    return {
      id: `${provider}:${item.type}`, provider, code: item.type, name: forProvider(item.service, provider), category: category.id,
      defaultMonthlyCost: typeof usd === 'number' ? usd : usd[provider], isEnterprise: item.enterprise === true,
    };
  })));
}

/**
 * Aplica al catálogo del estudio lo que dice el backend: el nombre de cada servicio en cada
 * nube, si es de empresa y su coste. El backend no conoce el icono, el recurso de Terraform ni
 * la zona de cada servicio, así que una fila sin equivalente en el estudio se ignora.
 */
export function mergeCatalog(local: CatalogCategory[], rows: CatalogRow[]): { catalog: CatalogCategory[]; costs: CostOverrides } {
  const byCode = new Map<string, Partial<Record<CloudProviderId, CatalogRow>>>();
  for (const row of rows) {
    if (PROVIDER_IDS.includes(row.provider) && typeof row.name === 'string' && row.name.trim()) {
      byCode.set(row.code, { ...byCode.get(row.code), [row.provider]: row });
    }
  }
  const costs: CostOverrides = {};
  const catalog = local.map((category) => ({
    ...category,
    items: category.items.map((item) => {
      const served = byCode.get(item.type);
      if (!served) {
        return item;
      }
      for (const provider of PROVIDER_IDS) {
        const cost = served[provider]?.defaultMonthlyCost;
        if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
          costs[item.type] = { ...costs[item.type], [provider]: cost };
        }
      }
      const names = Object.fromEntries(PROVIDER_IDS.map((provider) =>
        [provider, served[provider]?.name.trim().slice(0, 60) ?? forProvider(item.service, provider)])) as PerProvider;
      const sameEverywhere = names.aws === names.gcp && names.gcp === names.azure;
      return {
        ...item,
        service: sameEverywhere ? names.aws : names,
        enterprise: PROVIDER_IDS.some((provider) => served[provider]?.isEnterprise === true),
      };
    }),
  }));
  return { catalog, costs };
}
