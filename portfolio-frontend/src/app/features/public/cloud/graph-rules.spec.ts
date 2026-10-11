import { SERVICE_CATALOG } from './cloud-catalog.data';
import { CLOUD_LINKS, CLOUD_NODES, CloudNode, LINK_KINDS } from './cloud-topology.data';
import { DATA_BLUEPRINTS } from './data-blueprints';
import { GRAPH_RULES, anchorFor, canConnect, checkGraph, endpointOf, inferKind } from './graph-rules';
import { STUDIO_PRESETS } from './studio-project';
import { TERRAFORM_UNSUPPORTED_TYPES } from './terraform-generator';

const ITEMS = SERVICE_CATALOG.flatMap((category) => category.items);
const node = (id: string, type: string): CloudNode =>
  ({ id, type, x: 0, y: 0, zone: 'managed', role: '', service: id, icon: null, terraform: null, why: '' });

describe('data catalog', () => {
  it('has unique types and covers every logical data role', () => {
    const types = ITEMS.map((item) => item.type);
    expect(new Set(types).size).toBe(types.length);
    const roles = new Set(ITEMS.flatMap((item) => (item.logical ? [item.logical] : [])));
    expect([...roles].sort()).toEqual(['bi', 'cdc', 'data-warehouse', 'database', 'event-stream', 'global-database', 'queue', 'stream-processing']);
  });

  it('offers the new cloud services with a name in each cloud', () => {
    const byType = (type: string) => ITEMS.find((item) => item.type === type)!;
    expect(byType('cdc').service).toEqual({ aws: 'Database Migration Service', gcp: 'Datastream', azure: 'Data Factory (CDC)' });
    expect(byType('event-stream').service).toEqual({ aws: 'Kinesis Data Streams', gcp: 'Pub/Sub', azure: 'Event Hubs' });
    expect(byType('global-database').service).toEqual({ aws: 'Aurora Global Database', gcp: 'Cloud Spanner', azure: 'Azure SQL Database (failover groups)' });
    // El Kafka gestionado sigue siendo otro servicio: no se ha fundido con el stream nativo.
    expect(byType('streaming').service).toEqual({ aws: 'MSK (Kafka)', gcp: 'Managed Kafka', azure: 'Event Hubs' });
    for (const type of ['kafka', 'debezium', 'goldengate', 'snowflake', 'databricks', 'tableau', 'powerbi', 'looker-studio']) {
      expect(typeof byType(type).service).withContext(type).toBe('string');
    }
  });

  it('says where a cloud has no direct equivalent, with the trade-off', () => {
    const gaps = ITEMS.filter((item) => item.noDirectEquivalent).map((item) => [item.type, Object.keys(item.noDirectEquivalent!)]);
    expect(gaps).toEqual([['global-database', ['azure']], ['cdc', ['azure']]]);
    for (const item of ITEMS.filter((candidate) => candidate.noDirectEquivalent)) {
      expect(item.noDirectEquivalent!.azure).toMatch(/^Sin equivalente directo: .{40,}/);
    }
  });

  it('no longer offers the retired Cosmos DB for PostgreSQL on Azure', () => {
    const service = ITEMS.find((item) => item.type === 'newsql-pg')!.service;
    expect(service).toEqual(jasmine.objectContaining({ azure: 'Azure Database for PostgreSQL (Elastic Clusters)' }));
  });

  it('shows third-party data products with the neutral glyph, not their logo', () => {
    for (const type of ['kafka', 'debezium', 'goldengate', 'snowflake', 'databricks', 'tableau', 'powerbi', 'looker-studio']) {
      expect(ITEMS.find((item) => item.type === type)!.icon).withContext(type).toBe('dataService');
    }
  });

  it('declares exactly the services without Terraform as unsupported', () => {
    expect(ITEMS.filter((item) => item.terraform === null).map((item) => item.type).sort()).toEqual([...TERRAFORM_UNSUPPORTED_TYPES].sort());
  });
});

describe('graph rules', () => {
  it('are plain data that covers every role and every link kind', () => {
    expect(JSON.parse(JSON.stringify(GRAPH_RULES))).toEqual(GRAPH_RULES);
    expect(Object.keys(GRAPH_RULES.kinds).sort()).toEqual(LINK_KINDS.map((entry) => entry.kind).sort());
    expect(GRAPH_RULES.logical['postgres']).toBe('database');
    expect(endpointOf('containers')).toBe('service');
    expect(GRAPH_RULES.maxInstances['cdc']).toBe(3);
  });

  it('decides which piece may feed which', () => {
    expect(canConnect('postgres', 'cdc')).toBeTrue();
    expect(canConnect('containers', 'cdc')).toBeFalse(); // el CDC lee de una base de datos
    expect(canConnect('cdc', 'warehouse')).toBeTrue();
    expect(canConnect('containers', 'stream-processing')).toBeFalse();
    expect(canConnect('event-stream', 'stream-processing')).toBeTrue();
    expect(canConnect('containers', 'bi')).toBeFalse(); // los paneles leen del almacén
    expect(canConnect('warehouse', 'tableau')).toBeTrue();
    expect(canConnect('warehouse', 'containers')).toBeTrue(); // lo que no es de datos no tiene regla
  });

  it('infers what a new connection carries', () => {
    expect(inferKind('postgres', 'cdc')).toBe('CDC_STREAM');
    expect(inferKind('cdc', 'warehouse')).toBe('CDC_STREAM');
    expect(inferKind('containers', 'event-stream')).toBe('EVENT_BUS');
    expect(inferKind('stream-processing', 'warehouse')).toBe('ANALYTICS_SINK');
    expect(inferKind('warehouse', 'bi')).toBe('ANALYTICS_SINK');
    expect(inferKind('global-database', 'global-database')).toBe('REPLICATION');
    expect(inferKind('containers', 'postgres')).toBeUndefined();
    expect(inferKind('lb', 'containers')).toBeUndefined();
  });

  it('reports a connection that is not allowed, next to the node that receives it', () => {
    const nodes = [node('api', 'containers'), node('cdc-1', 'cdc')];
    expect(checkGraph(nodes, [{ from: 'api', to: 'cdc-1' }], (item) => item.id.toUpperCase())).toEqual([{
      rule: 'connection', nodeId: 'cdc-1', link: { from: 'api', to: 'cdc-1' },
      message: 'Conexión no permitida: API → CDC-1. Un CDC solo recibe de: una base de datos, una base de datos global.',
    }]);
  });

  it('reports a link kind that does not fit its two ends', () => {
    const nodes = [node('api', 'containers'), node('db', 'postgres')];
    expect(checkGraph(nodes, [{ from: 'api', to: 'db', kind: 'REPLICATION' }]).map((violation) => violation.rule)).toEqual(['link-kind']);
    expect(checkGraph(nodes, [{ from: 'api', to: 'db' }])).toEqual([]);
  });

  it('reports the instances over the limit, on the extra ones', () => {
    const nodes = [node('bi-1', 'tableau'), node('bi-2', 'tableau'), ...[1, 2, 3, 4].map((index) => node(`cdc-${index}`, 'cdc'))];
    expect(checkGraph(nodes, [])).toEqual([
      { rule: 'max-instances', nodeId: 'bi-2', message: 'Instancia duplicada: bi-2. Este lienzo admite una sola.' },
      { rule: 'max-instances', nodeId: 'cdc-4', message: 'Demasiadas instancias de cdc-4: 4 de 3 como máximo.' },
    ]);
  });

  it('ignores links to nodes that are not there', () => {
    expect(checkGraph([node('cdc-1', 'cdc')], [{ from: 'fantasma', to: 'cdc-1' }])).toEqual([]);
  });

  it('starts with no warnings in the reference architecture, the templates and the blueprints', () => {
    expect(checkGraph(CLOUD_NODES, CLOUD_LINKS)).toEqual([]);
    for (const preset of [...STUDIO_PRESETS, ...DATA_BLUEPRINTS]) {
      const { nodes, links } = preset.build();
      expect(checkGraph(nodes, links)).withContext(preset.id).toEqual([]);
    }
  });

  it('anchors a new data piece only to something its rules accept', () => {
    const at = { x: 0, y: 0 };
    // Un servicio corriente: su origen habitual o nada (el estudio busca entonces el más cercano).
    expect(anchorFor('functions', 'api', at, CLOUD_NODES)?.id).toBe('api');
    // Una cola admite a la API, que es su origen habitual.
    expect(anchorFor('queue', 'api', at, CLOUD_NODES)?.id).toBe('api');
    // El CDC no admite a la API: se engancha a la base de datos.
    expect(anchorFor('cdc', 'api', at, CLOUD_NODES)?.id).toBe('postgres');
    // Los paneles leen de la base de datos si no hay almacén.
    expect(anchorFor('bi', 'api', at, CLOUD_NODES)?.id).toBe('postgres');
    // Sin nada que admita, queda suelto en vez de nacer con una conexión no permitida.
    expect(anchorFor('stream-processing', 'api', at, CLOUD_NODES)).toBeNull();
    expect(anchorFor('cdc', 'api', at, [])).toBeNull();
  });
});
