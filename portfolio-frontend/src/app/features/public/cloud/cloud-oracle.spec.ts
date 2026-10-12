import { TECH_ICONS } from '../../../shared/ui/tech-icons';
import { SERVICE_CATALOG } from './cloud-catalog.data';
import { NODE_COSTS, estimateCost } from './cloud-costs.data';
import { ORACLE_EQUIVALENTS, withOracle } from './cloud-oracle.data';
import { CLOUD_LINKS, CLOUD_NODES, CLOUD_PROVIDERS, CloudNode, NO_OCI_EQUIVALENT, forProvider, resolveIcon, resourceFor } from './cloud-topology.data';
import { parseProject, referenceProject, serializeProject } from './studio-project';
import { generateMainTf, generateVariablesTf } from './terraform-generator';
import { auditTopology } from './topology-auditor';

const ITEMS = SERVICE_CATALOG.flatMap((category) => category.items);

describe('Oracle Cloud (cloud.oracle)', () => {
  it('is the fourth cloud, with its network and no logo of its own', () => {
    expect(CLOUD_PROVIDERS.map((provider) => provider.id)).toEqual(['aws', 'gcp', 'azure', 'oci']);
    expect(CLOUD_PROVIDERS[3]).toEqual({ id: 'oci', name: 'OCI', boundary: 'Oracle Cloud · región', network: 'VCN', networkResource: 'oci_core_vcn' });
    // Sin permiso de marca confirmado: símbolo neutro y el nombre en texto.
    expect(TECH_ICONS.oci.official).toBeFalse();
    expect(TECH_ICONS.oci.image).toBeUndefined();
  });

  it('names every cloud service of the catalog and of the reference architecture in OCI', () => {
    const pieces = [...ITEMS, ...CLOUD_NODES].filter((piece) => typeof piece.service !== 'string');

    expect(pieces.length).toBeGreaterThan(35);
    for (const piece of pieces) {
      expect(forProvider(piece.service, 'oci')).withContext(piece.type).not.toBe(NO_OCI_EQUIVALENT);
      expect(resourceFor(piece.terraform, 'oci')).withContext(piece.type).toMatch(/^oci_[a-z0-9_]+$/);
    }
    // Un producto de terceros se llama igual en cualquier nube.
    expect(forProvider(ITEMS.find((item) => item.type === 'mongodb')!.service, 'oci')).toBe('MongoDB Atlas');
    expect(resourceFor(ITEMS.find((item) => item.type === 'rabbitmq')!.terraform, 'oci')).toBe('helm_release');
  });

  it('only maps pieces that exist, and never shows a cloud logo for them', () => {
    const types = new Set([...ITEMS, ...CLOUD_NODES].map((piece) => piece.type));
    for (const type of Object.keys(ORACLE_EQUIVALENTS)) {
      expect(types.has(type)).withContext(type).toBeTrue();
    }
    for (const piece of [...ITEMS, ...CLOUD_NODES].filter((candidate) => candidate.icon)) {
      const icon = TECH_ICONS[resolveIcon(piece.icon!, 'oci')];
      expect(icon.family).withContext(piece.type).toBeUndefined();
    }
  });

  it('says where OCI has no direct equivalent, with the trade-off', () => {
    const gaps = ITEMS.filter((item) => item.noDirectEquivalent?.oci).map((item) => item.type);

    expect(gaps).toEqual(['app-platform', 'global-sql', 'global-database', 'graph', 'wide-column', 'sql-query', 'stream-processing', 'workflow']);
  });

  it('does not touch what a piece already says about OCI', () => {
    const custom = { type: 'postgres', service: { aws: 'a', gcp: 'g', azure: 'z', oci: 'Mi PostgreSQL' }, terraform: { aws: 'aws_x', gcp: 'google_x', azure: 'azurerm_x', oci: 'oci_x' } };

    expect(withOracle(custom)).toBe(custom);
    expect(withOracle({ type: 'mainframe', service: 'AS400', terraform: null })).toEqual({ type: 'mainframe', service: 'AS400', terraform: null });
  });

  describe('Terraform', () => {
    it('uses the official provider and one OCI resource per node', () => {
      const tf = generateMainTf(CLOUD_NODES, CLOUD_LINKS, 'oci');

      expect(tf).toContain('oci = { source = "oracle/oci" }');
      expect(tf).toContain('provider "oci" {\n  region = var.region\n}');
      expect(tf).toContain('resource "oci_core_vcn" "main" {');
      expect(tf).toContain('resource "oci_psql_db_system" "postgres" {\n  # OCI Database with PostgreSQL · PostgreSQL + pgvector');
      expect(tf).toContain('resource "oci_container_instances_container_instance" "api" {');
      expect(tf).not.toMatch(/aws_|google_|azurerm_/);
      expect(generateVariablesTf(CLOUD_NODES, 'oci')).toContain('default = "us-ashburn-1"');
    });

    it('says which pieces have no OCI resource instead of dropping them', () => {
      const own: CloudNode = {
        id: 'propio', type: 'algo-propio', x: 0, y: 0, zone: 'managed', role: 'Motor de reglas', icon: null, why: '', custom: true,
        service: { aws: 'A', gcp: 'G', azure: 'Z' }, terraform: { aws: 'aws_thing', gcp: 'google_thing', azure: 'azurerm_thing' },
      };

      const tf = generateMainTf([...CLOUD_NODES, own], CLOUD_LINKS, 'oci');

      expect(tf).not.toContain('"propio"');
      expect(tf).toContain('# Motor de reglas: sin recurso de Terraform equivalente en OCI');
      // En las otras nubes sigue teniendo su recurso.
      expect(generateMainTf([...CLOUD_NODES, own], CLOUD_LINKS, 'aws')).toContain('resource "aws_thing" "propio" {');
    });
  });

  describe('saved projects', () => {
    it('opens a project saved before the fourth cloud and gives its nodes their OCI names', () => {
      const old = JSON.parse(serializeProject(referenceProject()));
      for (const node of old.nodes) {
        for (const field of ['service', 'terraform']) {
          if (node[field] && typeof node[field] === 'object') {
            delete node[field].oci;
          }
        }
      }

      const parsed = parseProject(JSON.stringify(old));

      expect(parsed.ok).toBeTrue();
      const postgres = (parsed as { project: { nodes: CloudNode[] } }).project.nodes.find((node) => node.id === 'postgres')!;
      expect(forProvider(postgres.service, 'aws')).toBe('RDS PostgreSQL');
      expect(forProvider(postgres.service, 'oci')).toBe('OCI Database with PostgreSQL');
      expect(resourceFor(postgres.terraform, 'oci')).toBe('oci_psql_db_system');
    });

    it('saves and opens a project in OCI', () => {
      const parsed = parseProject(serializeProject({ ...referenceProject(), provider: 'oci' }));

      expect(parsed.ok && parsed.project.provider).toBe('oci');
    });
  });

  describe('costs', () => {
    it('puts no hand-written figure on an OCI service: it is "sin estimación" until a list price arrives', () => {
      const estimate = estimateCost(CLOUD_NODES, 'oci');

      // Solo suma lo que no es de la nube: el borde de Cloudflare cuesta lo mismo se despliegue donde se despliegue.
      expect(estimate.categories.flatMap((category) => category.items).map((item) => item.nodeId)).toEqual(['edge']);
      const cloudServices = CLOUD_NODES.filter((node) => typeof node.service !== 'string' && NODE_COSTS[node.type]).map((node) => node.id);
      expect(estimate.unestimated.map((item) => item.nodeId)).toEqual(cloudServices);
      expect(estimate.unestimated.map((item) => item.name)).toContain('OCI Database with PostgreSQL');
    });

    it('counts only real list prices in OCI', () => {
      const estimate = estimateCost(CLOUD_NODES, 'oci', {}, { postgres: 71.54 });

      expect(estimate.total).toBeCloseTo(71.54 + estimateCost(CLOUD_NODES, 'oci').total, 2);
      expect(estimate.liveUsd).toBeCloseTo(71.54, 2);
      expect(estimate.unestimated.map((item) => item.nodeId)).not.toContain('postgres');
    });

    it('keeps OCI out of the comparison between clouds', () => {
      const titles = (provider: 'aws' | 'oci') => auditTopology(CLOUD_NODES, CLOUD_LINKS, provider).map((item) => `${item.title} ${item.detail}`).join('\n');

      expect(titles('aws')).not.toContain('OCI');
      expect(titles('oci')).toContain('Sin comparación de costes en OCI');
      expect(titles('oci')).not.toContain('más barata');
    });
  });
});
