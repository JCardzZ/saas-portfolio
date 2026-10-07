import { CLOUD_LINKS, CLOUD_NODES, CloudNode } from './cloud-topology.data';
import { countResources, generateMainTf } from './terraform-generator';
import { validateTopology } from './topology-validator';

const KAFKA: CloudNode = {
  id: 'streaming-1', type: 'streaming', x: 556, y: 340, zone: 'compute', role: 'Streaming de eventos (Kafka)', icon: 'kafka',
  service: { aws: 'MSK (Kafka)', gcp: 'Managed Kafka', azure: 'Event Hubs' },
  terraform: { aws: 'aws_msk_cluster', gcp: 'google_managed_kafka_cluster', azure: 'azurerm_eventhub_namespace' },
  why: '', custom: true,
};

describe('generateMainTf', () => {
  it('declares the providers, the network and one resource per node of the reference architecture', () => {
    const hcl = generateMainTf(CLOUD_NODES, CLOUD_LINKS, 'aws');

    expect(hcl).toContain('aws = { source = "hashicorp/aws" }');
    expect(hcl).toContain('cloudflare = { source = "cloudflare/cloudflare" }');
    expect(hcl).toContain('provider "aws" {');
    expect(hcl).toContain('resource "aws_vpc" "main" {');
    expect(hcl).toContain('resource "aws_ecs_service" "api" {');
    expect(hcl).toContain('resource "aws_db_instance" "postgres" {');
    expect((hcl.match(/^resource "/gm) ?? []).length).toBe(countResources(CLOUD_NODES));
    expect(countResources(CLOUD_NODES)).toBe(10);
  });

  it('turns the connections into depends_on and lists what stays outside Terraform', () => {
    const hcl = generateMainTf(CLOUD_NODES, CLOUD_LINKS, 'aws');

    expect(hcl).toContain('depends_on = [aws_db_instance.postgres, aws_elasticache_replication_group.redis]');
    expect(hcl).toContain('depends_on = [aws_cloudfront_distribution.static, aws_lb.lb]');
    // Gemini no es un recurso: la API no depende de él en Terraform.
    expect(hcl).not.toContain('gemini');
    expect(hcl).toContain('# Fuera de Terraform: Visitantes, Gemini API, Terraform + Docker');
  });

  it('translates every resource to the selected cloud', () => {
    const gcp = generateMainTf(CLOUD_NODES, CLOUD_LINKS, 'gcp');
    expect(gcp).toContain('provider "google" {');
    expect(gcp).toContain('resource "google_compute_network" "main" {');
    expect(gcp).toContain('resource "google_cloud_run_v2_service" "api" {');
    expect(gcp).not.toContain('aws_');

    const azure = generateMainTf(CLOUD_NODES, CLOUD_LINKS, 'azure');
    expect(azure).toContain('features {}');
    expect(azure).toContain('resource "azurerm_virtual_network" "main" {');
    expect(azure).toContain('resource "azurerm_key_vault" "secrets" {');
  });

  it('adds the block and the provider of a service placed by the visitor', () => {
    const helm: CloudNode = { ...KAFKA, id: 'prometheus-2', type: 'prometheus', service: 'Prometheus + Grafana', terraform: 'helm_release' };
    const hcl = generateMainTf([...CLOUD_NODES, KAFKA, helm], [...CLOUD_LINKS, { from: 'api', to: 'streaming-1' }], 'aws');

    expect(hcl).toContain('resource "aws_msk_cluster" "streaming_1" {');
    expect(hcl).toContain('# MSK (Kafka) · Streaming de eventos (Kafka)');
    expect(hcl).toContain('aws_msk_cluster.streaming_1]');
    expect(hcl).toContain('helm = { source = "hashicorp/helm" }');
    expect(hcl).toContain('resource "helm_release" "prometheus_2" {');
  });
});

describe('validateTopology', () => {
  const checks = (nodes: CloudNode[], links = CLOUD_LINKS) => validateTopology(nodes, links, 'aws').map((finding) => finding.check);

  it('passes every check on the reference architecture', () => {
    expect(checks(CLOUD_NODES)).toEqual([
      'Check: VPC Isolation OK', 'Check: Public Access to DB Disabled', 'Check: Single Entry Point OK', 'Check: Secrets Managed OK',
      'Terraform Plan Ready',
    ]);
    expect(validateTopology(CLOUD_NODES, CLOUD_LINKS, 'aws').at(-1)!.detail).toBe('10 recursos · sin avisos');
  });

  it('warns when Internet reaches a private subnet or a database directly', () => {
    const findings = validateTopology(CLOUD_NODES, [...CLOUD_LINKS, { from: 'edge', to: 'postgres' }], 'aws');

    expect(findings[0]).toEqual({ level: 'warn', check: 'Warning: VPC Isolation', detail: 'Cloudflare → RDS PostgreSQL' });
    expect(findings[1].check).toBe('Warning: Public Access to DB');
    expect(findings[1].detail).toBe('RDS PostgreSQL accesible desde Cloudflare');
    expect(findings.at(-1)).toEqual({ level: 'warn', check: 'Terraform Plan Ready', detail: '10 recursos · 2 avisos' });
  });

  it('warns when the load balancer or the secrets store is removed', () => {
    const without = (id: string) => CLOUD_NODES.filter((node) => node.id !== id);

    expect(checks(without('lb'))).toContain('Warning: No Load Balancer');
    expect(checks(without('secrets'))).toContain('Warning: No Secrets Manager');
    // Vault también cuenta como almacén de secretos.
    const vault: CloudNode = { ...KAFKA, id: 'vault-1', type: 'vault', zone: 'managed', service: 'HashiCorp Vault', terraform: 'vault_mount' };
    expect(checks([...without('secrets'), vault])).toContain('Check: Secrets Managed OK');
  });
});
