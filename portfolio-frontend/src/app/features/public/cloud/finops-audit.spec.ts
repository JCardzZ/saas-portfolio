import { SERVICE_CATALOG } from './cloud-catalog.data';
import { NODE_COSTS, catalogRows, estimateCost, formatUsd, mergeCatalog, COST_UNKNOWN_TYPES } from './cloud-costs.data';
import { CLOUD_LINKS, CLOUD_NODES, CloudNode } from './cloud-topology.data';
import { auditPrompt, auditTopology } from './topology-auditor';

function custom(type: string, zone: CloudNode['zone'] = 'data'): CloudNode {
  const item = SERVICE_CATALOG.flatMap((category) => category.items).find((candidate) => candidate.type === type)!;
  return {
    id: `${type}-1`, type, x: 0, y: 0, zone, role: item.capability, service: item.service, icon: item.icon, terraform: item.terraform,
    why: item.why, custom: true,
  };
}

describe('estimateCost', () => {
  it('has a price for every node type of the diagram and the catalog, or says there is none', () => {
    const types = [...CLOUD_NODES.map((node) => node.type), ...SERVICE_CATALOG.flatMap((category) => category.items.map((item) => item.type))];
    expect(types.filter((type) => !NODE_COSTS[type] && !COST_UNKNOWN_TYPES.has(type))).toEqual([]);
    // Nunca las dos cosas: un tipo con precio no puede figurar como «sin estimación».
    expect([...COST_UNKNOWN_TYPES].filter((type) => NODE_COSTS[type])).toEqual([]);
    expect([...COST_UNKNOWN_TYPES].filter((type) => !types.includes(type))).toEqual([]);
  });

  it('lists the services without an estimate instead of counting them as free', () => {
    const debezium = { ...CLOUD_NODES[0], id: 'debezium-1', type: 'debezium', service: 'Debezium' };
    const named = { ...debezium, id: 'debezium-2', name: 'CDC de pedidos' };
    const estimate = estimateCost([...CLOUD_NODES, debezium, named], 'aws');
    expect(estimate.total).toBe(estimateCost(CLOUD_NODES, 'aws').total);
    expect(estimate.unestimated).toEqual([{ nodeId: 'debezium-1', name: 'Debezium' }, { nodeId: 'debezium-2', name: 'CDC de pedidos' }]);
    expect(estimateCost(CLOUD_NODES, 'aws').unestimated).toEqual([]);
    // Un coste servido por el backend sí cuenta; un cero no es una estimación.
    expect(estimateCost([debezium], 'aws', { debezium: { aws: 0 } }).unestimated.length).toBe(1);
    expect(estimateCost([debezium], 'aws', { debezium: { aws: 40 } }).unestimated).toEqual([]);
  });

  it('adds up the reference architecture by category for each cloud', () => {
    const aws = estimateCost(CLOUD_NODES, 'aws');
    expect(aws.total).toBe(138);
    expect(aws.categories.map((category) => [category.name, category.usd])).toEqual([
      ['Cómputo', 36], ['Datos', 43], ['Borde, CDN y red', 47], ['Observabilidad y seguridad', 12],
    ]);
    expect(aws.top).toEqual({ nodeId: 'api', type: 'containers', name: 'ECS Fargate', usd: 36 });
    // Dentro de cada categoría, de mayor a menor; lo que no cuesta no aparece.
    expect(aws.categories[1].items.map((item) => item.name)).toEqual(['RDS PostgreSQL', 'ElastiCache']);
    expect(aws.categories.flatMap((category) => category.items).some((item) => item.name === 'Gemini API')).toBeFalse();

    expect(estimateCost(CLOUD_NODES, 'gcp').total).toBe(147);
    expect(estimateCost(CLOUD_NODES, 'azure').total).toBe(159);
  });

  it('follows the topology: added services add their category, removed ones leave', () => {
    const withKafka = estimateCost([...CLOUD_NODES, custom('streaming', 'compute')], 'aws');
    expect(withKafka.total).toBe(208);
    expect(withKafka.categories.find((category) => category.id === 'messaging')!.items).toEqual([
      { nodeId: 'streaming-1', type: 'streaming', name: 'MSK (Kafka)', usd: 70 },
    ]);
    expect(estimateCost(CLOUD_NODES.filter((node) => node.id !== 'api'), 'aws').categories.some((category) => category.id === 'compute')).toBeFalse();
    expect(estimateCost([], 'aws')).toEqual({ total: 0, categories: [], liveUsd: 0, unestimated: [], top: null });
    expect(formatUsd(1234.4)).toBe('$1,234');

    // Apigee no tiene escalón pequeño: en GCP domina el coste y la auditoría lo señala.
    const withApis = [...CLOUD_NODES, custom('api-gateway', 'public')];
    expect(estimateCost(withApis, 'aws').total).toBe(142);
    expect(estimateCost(withApis, 'gcp').top).toEqual({ nodeId: 'api-gateway-1', type: 'api-gateway', name: 'Apigee', usd: 365 });
    expect(auditTopology(withApis, CLOUD_LINKS, 'gcp').map((item) => item.title)).toContain('Apigee es el 71 % del coste');
  });
});

describe('catalog served by the backend', () => {
  it('describes the studio catalog as one row per service and cloud', () => {
    const rows = catalogRows();

    expect(rows.length).toBe(SERVICE_CATALOG.flatMap((category) => category.items).length * 3);
    expect(rows.length).toBe(132);
    expect(rows.find((row) => row.id === 'gcp:api-gateway')).toEqual({
      id: 'gcp:api-gateway', provider: 'gcp', code: 'api-gateway', name: 'Apigee', category: 'api-management', defaultMonthlyCost: 365, isEnterprise: true,
    });
    expect(rows.filter((row) => row.isEnterprise).length).toBe(42);
    // Sembrar el backend con estas filas y volver a leerlas deja el catálogo como estaba.
    expect(mergeCatalog(SERVICE_CATALOG, rows).catalog).toEqual(SERVICE_CATALOG.map((category) => ({
      ...category, items: category.items.map((item) => ({ ...item, enterprise: item.enterprise === true })),
    })));
  });

  it('lets the backend rename services, mark them as enterprise and set their cost', () => {
    const rows = catalogRows().map((row) => (row.id === 'aws:functions'
      ? { ...row, name: 'AWS Lambda', defaultMonthlyCost: 9.5, isEnterprise: true }
      : row));
    const { catalog, costs } = mergeCatalog(SERVICE_CATALOG, [...rows, { ...rows[0], id: 'aws:quantum', code: 'quantum', name: 'Braket' }]);
    const lambda = catalog.flatMap((category) => category.items).find((item) => item.type === 'functions')!;

    // El backend no tiene filas de Oracle Cloud: su nombre sigue siendo el del estudio.
    expect(lambda.service).toEqual({ aws: 'AWS Lambda', gcp: 'Cloud Functions', azure: 'Functions', oci: 'Functions' });
    expect(lambda.enterprise).toBeTrue();
    expect(lambda.terraform).toEqual({ aws: 'aws_lambda_function', gcp: 'google_cloudfunctions2_function', azure: 'azurerm_linux_function_app', oci: 'oci_functions_function' });
    expect(costs['functions']).toEqual({ aws: 9.5, gcp: 2, azure: 2 });
    // Lo que el estudio no sabe dibujar no entra.
    expect(catalog.flatMap((category) => category.items).some((item) => item.type === 'quantum')).toBeFalse();

    const node = custom('functions', 'compute');
    expect(estimateCost([node], 'aws').total).toBe(2);
    expect(estimateCost([node], 'aws', costs).total).toBe(9.5);
    expect(estimateCost([node], 'gcp', costs).total).toBe(2);
  });

  it('ignores rows with an unknown cloud, an empty name or an invalid cost', () => {
    const bad = [
      { id: 'x', provider: 'oracle', code: 'functions', name: 'X', category: 'c', defaultMonthlyCost: 1, isEnterprise: true },
      { id: 'y', provider: 'aws', code: 'functions', name: '  ', category: 'c', defaultMonthlyCost: 1, isEnterprise: true },
      { id: 'z', provider: 'gcp', code: 'queue', name: 'Pub/Sub', category: 'c', defaultMonthlyCost: -4, isEnterprise: false },
    ] as never[];
    const { catalog, costs } = mergeCatalog(SERVICE_CATALOG, bad);

    expect(catalog.flatMap((category) => category.items).find((item) => item.type === 'functions')!.enterprise).toBeUndefined();
    expect(costs).toEqual({});
  });
});

describe('auditTopology', () => {
  const titles = (nodes: CloudNode[], provider: 'aws' | 'gcp' | 'azure' = 'aws', links = CLOUD_LINKS) =>
    auditTopology(nodes, links, provider).map((item) => `${item.area}/${item.level}: ${item.title}`);

  it('reviews availability, security and cost of the reference architecture', () => {
    expect(titles(CLOUD_NODES)).toEqual([
      'ha/action: Activa Multi-AZ en RDS PostgreSQL',
      'ha/action: Añade una réplica a ElastiCache',
      'ha/ok: El cómputo se puede repartir entre zonas',
      'ha/action: Desacopla la reindexación RAG con una cola',
      'security/ok: Aislamiento de red correcto',
      'security/action: Rota los secretos desde Secrets Manager',
      'security/action: Acceso privado a los servicios gestionados con VPC endpoints (PrivateLink)',
      'security/action: Limita la salida a Internet a la API de Gemini',
      'security/ok: Hay un cortafuegos de aplicación delante',
      'cost/ok: AWS es competitiva para esta topología',
      'cost/action: Con carga estable, contrata Savings Plans e instancias reservadas',
    ]);
  });

  it('speaks the vocabulary of the selected cloud', () => {
    expect(titles(CLOUD_NODES, 'gcp')).toContain('ha/action: Activa alta disponibilidad regional en Cloud SQL');
    expect(titles(CLOUD_NODES, 'azure')).toContain('security/action: Acceso privado a los servicios gestionados con Private Endpoints');
    expect(titles(CLOUD_NODES, 'azure')).toContain('cost/action: Esta topología sale más barata en AWS');
  });

  it('turns topology problems into recommendations', () => {
    const without = (...ids: string[]) => CLOUD_NODES.filter((node) => !ids.includes(node.id));

    expect(titles(without('lb'))).toContain('ha/action: Sin balanceador no hay reparto entre zonas');
    expect(titles(without('lb'))).toContain('security/action: No Load Balancer');
    expect(titles(without('secrets'))).toContain('security/action: No Secrets Manager');
    expect(titles(without('edge'))).toContain('security/action: Falta un cortafuegos de aplicación (WAF)');
    expect(titles(CLOUD_NODES, 'aws', [...CLOUD_LINKS, { from: 'edge', to: 'postgres' }])).not.toContain('security/ok: Aislamiento de red correcto');
  });

  it('flags what the visitor adds: duplicated platforms, third parties and the dominant cost', () => {
    const nodes = [...CLOUD_NODES, custom('kubernetes', 'compute'), custom('datadog', 'external'), custom('queue', 'managed')];
    const found = titles(nodes);

    expect(found).toContain('cost/action: EKS es el 44 % del coste');
    expect(found).toContain('cost/action: Hay más de una plataforma de cómputo');
    expect(found).toContain('cost/action: Observabilidad duplicada');
    expect(found).toContain('security/action: Datadog: conéctalo por VPC Peering o PrivateLink');
    expect(found).not.toContain('ha/action: Desacopla la reindexación RAG con una cola');
    expect(titles([...CLOUD_NODES, custom('wide-column')], 'gcp')).toContain('cost/action: Bigtable es el 76 % del coste');
  });

  it('builds a prompt for the assistant within the limit of the API', () => {
    const prompt = auditPrompt(auditTopology(CLOUD_NODES, CLOUD_LINKS, 'aws'), 'AWS');
    expect(prompt).toContain('Auditoría de la arquitectura desplegada en AWS');
    expect(prompt).toContain('Activa Multi-AZ en RDS PostgreSQL');
    expect(prompt).not.toContain('Aislamiento de red correcto');
    expect(prompt.length).toBeLessThan(2000);
  });
});
