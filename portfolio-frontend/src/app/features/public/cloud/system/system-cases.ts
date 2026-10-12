import { CLOUD_NODES, forProvider } from '../cloud-topology.data';
import { SystemDesign, SystemFinding, defaultSystemDesign, evaluateSystem } from './system-design';

/**
 * Casos de referencia de las comprobaciones del diseño de sistemas. Los evalúa este módulo y
 * `npm run export:presets` los escribe, con su resultado, en
 * `portfolio-backend/src/test/resources/architecture/system-cases.json`: el backend tiene que
 * dar exactamente lo mismo con los mismos datos.
 */
export interface CaseNode {
  id: string;
  type: string;
  /** Nombre con el que se ve el nodo: es el que aparece en los mensajes. */
  service: string;
}

export interface SystemCase {
  name: string;
  design: SystemDesign;
  nodes: CaseNode[];
  costUsd: number | null;
}

/** La arquitectura de referencia en AWS, con lo justo de cada nodo. */
const REFERENCE: CaseNode[] = CLOUD_NODES.map((node) => ({ id: node.id, type: node.type, service: forProvider(node.service, 'aws') }));
const extra = (id: string, type: string, service: string): CaseNode => ({ id, type, service });

const deployed: SystemDesign = {
  ...defaultSystemDesign(),
  deployments: { client: 'static', backend: 'api', database: 'postgres' },
};

export const SYSTEM_CASES: SystemCase[] = [
  { name: 'default-undeployed', design: defaultSystemDesign(), nodes: REFERENCE, costUsd: 138 },
  { name: 'deployed-without-requirements', design: deployed, nodes: REFERENCE, costUsd: 138 },
  {
    name: 'invalid-and-missing-deployments',
    design: { ...deployed, deployments: { client: 'static', backend: 'postgres', database: 'ya-no-existe' } },
    nodes: REFERENCE, costUsd: 138,
  },
  {
    name: 'nothing-to-deploy-on',
    design: { ...defaultSystemDesign(), choices: { ...defaultSystemDesign().choices, client: 'mobile-cross', database: 'document', push: 'websocket' } },
    nodes: REFERENCE.filter((node) => node.type !== 'containers'), costUsd: null,
  },
  {
    name: 'demanding-requirements-on-the-reference',
    design: { ...deployed, nfr: { users: 500000, rps: 3000, latencyMs: 80, availability: 99.99, budgetUsd: 100, compliance: ['pci', 'health'] } },
    nodes: REFERENCE.filter((node) => !['edge', 'static', 'lb', 'secrets', 'native-monitoring'].includes(node.type)), costUsd: 138.4,
  },
  {
    name: 'demanding-requirements-met',
    design: {
      choices: { client: 'web-spa', backend: 'go', api: 'grpc', auth: 'oidc-managed', database: 'postgresql', cache: 'redis', queue: 'stream', bff: 'gateway', push: 'sse' },
      deployments: { client: 'static', backend: 'api', auth: 'identity', database: 'global', cache: 'redis', queue: 'kafka', bff: 'gateway', push: 'api' },
      nfr: { users: 500000, rps: 3000, latencyMs: 80, availability: 99.99, budgetUsd: 5000, compliance: ['pci', 'health'] },
    },
    nodes: [
      ...REFERENCE, extra('identity', 'identity', 'Cognito'), extra('global', 'global-database', 'Aurora Global Database'),
      extra('kafka', 'streaming', 'MSK (Kafka)'), extra('gateway', 'api-gateway', 'Amazon API Gateway'), extra('waf', 'waf', 'WAF'),
    ],
    costUsd: 1210,
  },
  {
    name: 'one-database-replicated-or-not',
    design: { ...deployed, nfr: { availability: 99.9, compliance: [] } },
    nodes: [...REFERENCE, extra('postgres-standby', 'postgres', 'RDS · réplica')], costUsd: null,
  },
  {
    name: 'requirements-out-of-range',
    design: { ...deployed, nfr: { users: 2_000_000_000, rps: 0, latencyMs: 250, availability: 97, budgetUsd: 0.5, compliance: [] } },
    nodes: REFERENCE, costUsd: 138,
  },
  {
    name: 'session-needs-a-shared-store',
    design: { ...deployed, choices: { ...deployed.choices, auth: 'session', cache: 'cdn' }, deployments: { ...deployed.deployments, auth: 'redis', cache: 'postgres' } },
    nodes: REFERENCE, costUsd: 99.5,
  },
  {
    name: 'budget-without-an-estimate',
    design: { ...deployed, nfr: { budgetUsd: 10, compliance: [] } },
    nodes: REFERENCE, costUsd: null,
  },
];

/** Cada caso con lo que dan las comprobaciones: lo que se exporta al backend. */
export function evaluatedCases(): (SystemCase & { findings: SystemFinding[] })[] {
  return SYSTEM_CASES.map((entry) => ({
    ...entry,
    findings: evaluateSystem(entry.design, entry.nodes, entry.costUsd, (node) => entry.nodes.find((candidate) => candidate.id === node.id)!.service),
  }));
}
