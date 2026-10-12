import { CostOverrides, estimateCost, formatUsd } from './cloud-costs.data';
import { CLOUD_PROVIDERS, CloudLink, CloudNode, CloudProviderId, forProvider } from './cloud-topology.data';
import { validateTopology } from './topology-validator';

export type AuditArea = 'ha' | 'security' | 'cost';

export interface Recommendation {
  area: AuditArea;
  /** `action`: algo que cambiar. `ok`: ya está cubierto. */
  level: 'action' | 'ok';
  title: string;
  detail: string;
}

export const AUDIT_AREAS: { id: AuditArea; name: string }[] = [
  { id: 'ha', name: 'Alta disponibilidad' },
  { id: 'security', name: 'Seguridad' },
  { id: 'cost', name: 'Optimización de costes' },
];

const TERMS: Record<CloudProviderId, { multiAz: string; privateAccess: string; peering: string; commitment: string }> = {
  aws: { multiAz: 'Multi-AZ', privateAccess: 'VPC endpoints (PrivateLink)', peering: 'VPC Peering o PrivateLink', commitment: 'Savings Plans e instancias reservadas' },
  gcp: { multiAz: 'alta disponibilidad regional', privateAccess: 'Private Service Connect', peering: 'VPC Network Peering', commitment: 'descuentos por compromiso de uso' },
  azure: { multiAz: 'redundancia de zona', privateAccess: 'Private Endpoints', peering: 'VNet Peering o Private Link', commitment: 'reservas y planes de ahorro' },
  oci: { multiAz: 'varios dominios de disponibilidad o de fallo', privateAccess: 'acceso privado a los servicios desde la VCN', peering: 'emparejamiento de VCN', commitment: 'un compromiso anual de consumo' },
};

const COMPUTE_TYPES = ['containers', 'kubernetes', 'vm'];
const MONITORING_TYPES = ['native-monitoring', 'datadog', 'prometheus'];

/**
 * Revisa el diagrama con reglas de alta disponibilidad, seguridad y coste. Es un análisis
 * determinista de lo que hay en el lienzo (no lo redacta un modelo): las mismas piezas dan
 * siempre las mismas recomendaciones, con los términos de la nube activa.
 */
export function auditTopology(nodes: CloudNode[], links: CloudLink[], provider: CloudProviderId, costs: CostOverrides = {}): Recommendation[] {
  const terms = TERMS[provider];
  const name = (node: CloudNode) => forProvider(node.service, provider);
  const ofType = (...types: string[]) => nodes.filter((node) => types.includes(node.type));
  const byId = (id: string) => nodes.find((node) => node.id === id);
  const out: Recommendation[] = [];
  const add = (area: AuditArea, level: Recommendation['level'], title: string, detail: string) => out.push({ area, level, title, detail });

  // ---------- Alta disponibilidad ----------
  for (const database of ofType('postgres')) {
    add('ha', 'action', `Activa ${terms.multiAz} en ${name(database)}`,
      'El diagrama tiene una sola instancia: si cae su zona, la API se queda sin escrituras. Con una réplica en espera en otra zona la conmutación es automática.');
  }
  for (const cache of ofType('redis')) {
    add('ha', 'action', `Añade una réplica a ${name(cache)}`,
      'Su caída no tumba la API (fail-open a PostgreSQL), pero toda la carga de lectura pasa de golpe a la base de datos.');
  }
  const compute = ofType(...COMPUTE_TYPES);
  const balancer = byId('lb');
  if (compute.length === 0) {
    add('ha', 'action', 'No hay cómputo en el diagrama', 'Sin un servicio que ejecute la API no hay nada que mantener disponible.');
  } else if (!balancer) {
    add('ha', 'action', 'Sin balanceador no hay reparto entre zonas',
      `${name(compute[0])} queda como punto único de entrada: una réplica caída deja de recibir tráfico solo si algo la retira.`);
  } else {
    add('ha', 'ok', 'El cómputo se puede repartir entre zonas',
      `Con ${name(balancer)} delante, mantén al menos 2 réplicas de ${name(compute[0])} en zonas distintas.`);
  }
  for (const stream of ofType('streaming')) {
    add('ha', 'action', `${name(stream)}: 3 brokers en 3 zonas`, 'Con factor de replicación 3 y un mínimo de 2 réplicas sincronizadas se tolera la pérdida de una zona sin perder eventos.');
  }
  if (byId('gemini') && ofType('queue', 'streaming', 'rabbitmq').length === 0) {
    add('ha', 'action', 'Desacopla la reindexación RAG con una cola',
      'Hoy la ingesta llama a Gemini en el mismo proceso; con una cola, un pico o una caída del proveedor solo retrasa el trabajo.');
  }

  // ---------- Seguridad ----------
  const warnings = validateTopology(nodes, links, provider).filter((finding) => finding.check.startsWith('Warning'));
  for (const warning of warnings) {
    add('security', 'action', warning.check.replace('Warning: ', ''), warning.detail);
  }
  if (!warnings.some((warning) => /VPC Isolation|Public Access/.test(warning.check))) {
    add('security', 'ok', 'Aislamiento de red correcto', 'Internet solo alcanza la subred pública; las bases de datos solo aceptan a la capa de cómputo.');
  }
  const store = ofType('secrets', 'vault')[0];
  if (store) {
    add('security', 'action', `Rota los secretos desde ${name(store)}`,
      'JWT_SECRET, ADMIN_CLIENT_SECRET y la clave de Gemini deben leerse al arrancar y rotarse sin reconstruir la imagen.');
  }
  const managed = nodes.filter((node) => node.zone === 'managed');
  if (managed.length > 0) {
    add('security', 'action', `Acceso privado a los servicios gestionados con ${terms.privateAccess}`,
      `${managed.slice(0, 3).map(name).join(', ')}${managed.length > 3 ? '…' : ''}: así el tráfico no sale de la red privada.`);
  }
  for (const saas of nodes.filter((node) => node.zone === 'external' && node.custom)) {
    add('security', 'action', `${name(saas)}: conéctalo por ${terms.peering}`, 'Es un servicio de terceros: sin enlace privado, sus datos viajan por Internet.');
  }
  if (byId('gemini')) {
    add('security', 'action', 'Limita la salida a Internet a la API de Gemini', 'La API solo necesita salir por NAT hacia ese destino; una lista de destinos permitidos corta cualquier otra salida.');
  }
  if (byId('edge') || ofType('waf').length > 0) {
    add('security', 'ok', 'Hay un cortafuegos de aplicación delante', `${name(ofType('waf')[0] ?? byId('edge')!)} filtra el tráfico antes de que llegue al balanceador.`);
  } else {
    add('security', 'action', 'Falta un cortafuegos de aplicación (WAF)', 'Sin borde ni WAF, el balanceador recibe directamente todo el tráfico de Internet.');
  }

  // ---------- Costes ----------
  const estimate = estimateCost(nodes, provider, costs);
  if (estimate.top && estimate.total > 0 && estimate.top.usd / estimate.total >= 0.3) {
    add('cost', 'action', `${estimate.top.name} es el ${Math.round((estimate.top.usd / estimate.total) * 100)} % del coste`,
      `≈ ${formatUsd(estimate.top.usd)} de ${formatUsd(estimate.total)} al mes: es la primera partida que dimensionar o sustituir.`);
  }
  if (new Set(compute.map((node) => node.type)).size > 1) {
    add('cost', 'action', 'Hay más de una plataforma de cómputo', `${compute.map(name).join(' y ')} duplican operación y coste fijo; consolida en una si la carga lo permite.`);
  }
  const monitoring = ofType(...MONITORING_TYPES);
  if (monitoring.length > 1) {
    add('cost', 'action', 'Observabilidad duplicada', `${monitoring.map(name).join(', ')} recogen en buena parte las mismas métricas: elige una como fuente principal.`);
  }
  // Oracle Cloud no tiene cifras orientativas: ni se compara con ella ni se la compara con las demás.
  const others = provider === 'oci' ? [] : CLOUD_PROVIDERS.filter((candidate) => candidate.id !== provider && candidate.id !== 'oci')
    .map((candidate) => ({ name: candidate.name, total: estimateCost(nodes, candidate.id, costs).total }))
    .sort((a, b) => a.total - b.total);
  const current = CLOUD_PROVIDERS.find((candidate) => candidate.id === provider)!.name;
  if (provider === 'oci') {
    add('cost', 'action', 'Sin comparación de costes en OCI',
      'El estudio solo muestra en OCI los precios de la lista pública de Oracle; lo demás queda «sin estimación», así que el total no se puede comparar con el de otra nube.');
  } else if (others[0] && others[0].total < estimate.total * 0.9) {
    add('cost', 'action', `Esta topología sale más barata en ${others[0].name}`,
      `≈ ${formatUsd(others[0].total)} al mes frente a ≈ ${formatUsd(estimate.total)} en ${current}, con las mismas piezas (estimación orientativa).`);
  } else {
    add('cost', 'ok', `${current} es competitiva para esta topología`,
      `≈ ${formatUsd(estimate.total)} al mes; ${others.map((other) => `${other.name} ≈ ${formatUsd(other.total)}`).join(', ')} (estimación orientativa).`);
  }
  if (estimate.total >= 100) {
    add('cost', 'action', `Con carga estable, contrata ${terms.commitment}`, 'El cómputo y la base de datos funcionan las 24 horas: son las partidas donde el compromiso de uso descuenta más.');
  }
  return out;
}

/** Pregunta que se envía al asistente RAG para contrastar la auditoría con cómo está hecha la plataforma real. */
export function auditPrompt(recommendations: Recommendation[], providerName: string): string {
  const actions = recommendations.filter((item) => item.level === 'action').slice(0, 6).map((item) => item.title).join('; ');
  return `Auditoría de la arquitectura desplegada en ${providerName}. Puntos a revisar: ${actions}. `
    + '¿Cómo resuelve hoy esta plataforma la resiliencia ante la caída de Redis o de Gemini y la gestión de secretos?';
}
