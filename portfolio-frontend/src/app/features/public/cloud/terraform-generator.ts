import { CLOUD_PROVIDERS, CloudLink, CloudNode, CloudProviderId, forProvider, resourceFor } from './cloud-topology.data';

/** Origen de cada proveedor de Terraform, según el prefijo del tipo de recurso. */
const PROVIDER_SOURCES: Record<string, string> = {
  aws: 'hashicorp/aws',
  google: 'hashicorp/google',
  azurerm: 'hashicorp/azurerm',
  azuread: 'hashicorp/azuread',
  oci: 'oracle/oci',
  cloudflare: 'cloudflare/cloudflare',
  helm: 'hashicorp/helm',
  vault: 'hashicorp/vault',
  datadog: 'DataDog/datadog',
  mongodbatlas: 'mongodb/mongodbatlas',
  elasticstack: 'elastic/elasticstack',
  snowflake: 'snowflakedb/snowflake',
  databricks: 'databricks/databricks',
};

/**
 * Servicios del catálogo que el generador todavía no sabe aprovisionar. No se callan: cada
 * uno deja su aviso en `main.tf` y en el panel. (Un sistema del centro de datos propio es otra
 * cosa: queda «fuera de Terraform» porque no se aprovisiona en la nube.)
 */
export const TERRAFORM_UNSUPPORTED_TYPES: readonly string[] = ['debezium', 'goldengate', 'tableau', 'powerbi', 'looker-studio'];

/** Nombres de los servicios del lienzo que aún no tienen soporte de Terraform. */
export function unsupportedTerraform(nodes: CloudNode[], provider: CloudProviderId): string[] {
  return nodes.filter((node) => !node.terraform && TERRAFORM_UNSUPPORTED_TYPES.includes(node.type))
    .map((node) => oneLine(node.name?.trim() || forProvider(node.service, provider)));
}

const CLOUD_PROVIDER_BLOCK: Record<CloudProviderId, string[]> = {
  aws: ['provider "aws" {', '  region = var.region', '}'],
  gcp: ['provider "google" {', '  project = var.project', '  region  = var.region', '}'],
  azure: ['provider "azurerm" {', '  features {}', '}'],
  oci: ['provider "oci" {', '  region = var.region', '}'],
};

/** Piezas con recurso de Terraform en otras nubes pero no en la elegida: se avisa, no se omiten. */
function withoutResource(nodes: CloudNode[], provider: CloudProviderId): CloudNode[] {
  return nodes.filter((node) => node.terraform && !resourceFor(node.terraform, provider));
}

interface Resource {
  node: CloudNode;
  type: string;
  name: string;
}

/** Nombre local del recurso: el id del nodo en formato de identificador HCL. */
export function resourceName(node: CloudNode): string {
  return node.id.replace(/[^a-zA-Z0-9]+/g, '_');
}

/**
 * Genera el esqueleto de `main.tf` de la topología del lienzo para la nube elegida: los
 * proveedores necesarios, la red y un recurso por nodo, con `depends_on` según las conexiones.
 * Es un esqueleto: no incluye los argumentos de cada recurso, así que no se puede aplicar tal cual.
 */
export function generateMainTf(nodes: CloudNode[], links: CloudLink[], provider: CloudProviderId): string {
  const cloud = CLOUD_PROVIDERS.find((candidate) => candidate.id === provider)!;
  const resources: Resource[] = nodes.flatMap((node) => {
    const type = resourceFor(node.terraform, provider);
    return type ? [{ node, type, name: resourceName(node) }] : [];
  });
  const byId = new Map(resources.map((resource) => [resource.node.id, resource]));

  const prefixes = new Set([cloud.networkResource, ...resources.map((resource) => resource.type)].map(providerPrefix));
  const lines: string[] = [
    `# main.tf — esqueleto generado desde el lienzo (${cloud.name})`,
    '# Ilustrativo: faltan los argumentos de cada recurso; no se puede aplicar tal cual.',
    '',
    'terraform {',
    '  required_providers {',
    ...[...prefixes].sort().map((prefix) => `    ${prefix} = { source = "${PROVIDER_SOURCES[prefix] ?? `hashicorp/${prefix}`}" }`),
    '  }',
    '}',
    '',
    ...CLOUD_PROVIDER_BLOCK[provider],
    '',
    `resource "${cloud.networkResource}" "main" {`,
    `  # ${cloud.network} · red privada con subred pública y subredes privadas`,
    '}',
  ];

  for (const resource of resources) {
    const dependencies = links
      .filter((link) => link.from === resource.node.id)
      .flatMap((link) => (byId.has(link.to) ? [byId.get(link.to)!] : []))
      .map((target) => `${target.type}.${target.name}`);
    lines.push(
      '',
      `resource "${resource.type}" "${resource.name}" {`,
      `  # ${oneLine(forProvider(resource.node.service, provider))} · ${oneLine(resource.node.role)}`,
      ...propertyLines(resource),
      ...(dependencies.length ? [`  depends_on = [${dependencies.join(', ')}]`] : []),
      '}',
    );
  }

  const unsupported = unsupportedTerraform(nodes, provider);
  if (unsupported.length) {
    lines.push('', ...unsupported.map((name) => `# ${name}: sin soporte de Terraform todavía`));
  }
  const missing = withoutResource(nodes, provider);
  if (missing.length) {
    // Sin nombre del servicio en esta nube, la pieza se nombra por lo que hace.
    const label = (node: CloudNode) => node.name?.trim()
      || (typeof node.service !== 'string' && !node.service[provider] ? (node.role.trim() || node.id) : forProvider(node.service, provider));
    lines.push('', ...missing.map((node) => `# ${oneLine(label(node))}: sin recurso de Terraform equivalente en ${cloud.name}`));
  }
  const unmanaged = nodes.filter((node) => !node.terraform && !TERRAFORM_UNSUPPORTED_TYPES.includes(node.type))
    .map((node) => oneLine(forProvider(node.service, provider)));
  if (unmanaged.length) {
    lines.push('', `# Fuera de Terraform: ${unmanaged.join(', ')}`);
  }
  return lines.join('\n');
}

/** Número de recursos que declara el esqueleto (la red más un recurso por nodo aprovisionable). */
export function countResources(nodes: CloudNode[]): number {
  return 1 + nodes.filter((node) => node.terraform).length;
}

function providerPrefix(resourceType: string): string {
  return resourceType.split('_')[0];
}

// ---------- Propiedades de cada recurso ----------

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SECRET_KEY = /secret|password|passwd|token|api_?key|private_?key|credential/i;

/** Variables de entorno escritas como `CLAVE=valor`, una por línea; lo que no encaja se ignora. */
export function parseEnv(text: string | undefined): [key: string, value: string][] {
  return (text ?? '').split(/\r?\n/).flatMap((line): [string, string][] => {
    const separator = line.indexOf('=');
    const key = (separator < 0 ? line : line.slice(0, separator)).trim();
    return ENV_KEY.test(key) ? [[key, separator < 0 ? '' : line.slice(separator + 1).trim()]] : [];
  });
}

/** Claves que parecen credenciales y llevan un valor escrito: no deberían estar en claro. */
export function secretEnvKeys(text: string | undefined): string[] {
  return parseEnv(text).filter(([key, value]) => SECRET_KEY.test(key) && value !== '').map(([key]) => key);
}

/** Lo que el visitante ha definido en el panel de propiedades, como comentarios del recurso. */
function propertyLines(resource: Resource): string[] {
  const { name: label, props } = resource.node;
  const env = parseEnv(props?.env);
  return [
    ...(label ? [`  # nombre: ${oneLine(label)}`] : []),
    ...(props?.instance?.trim() ? [`  # capacidad: var.${resource.name}_instance`] : []),
    ...(props?.ports?.trim() ? [`  # puertos: ${oneLine(props.ports)}`] : []),
    ...(env.length ? [`  # entorno: var.${resource.name}_env (${env.map(([key]) => key).join(', ')})`] : []),
  ];
}

const DEFAULT_REGION: Record<CloudProviderId, string> = { aws: 'us-east-1', gcp: 'us-central1', azure: 'eastus', oci: 'us-ashburn-1' };

/**
 * `variables.tf` del proyecto: la región y, por cada recurso con propiedades, su capacidad y
 * sus variables de entorno. Las que parecen credenciales se declaran `sensitive` y SIN valor:
 * lo que se haya escrito en el lienzo no se copia al archivo.
 */
export function generateVariablesTf(nodes: CloudNode[], provider: CloudProviderId): string {
  const cloud = CLOUD_PROVIDERS.find((candidate) => candidate.id === provider)!;
  const lines: string[] = [
    `# variables.tf — generado desde el lienzo (${cloud.name})`,
    '',
    'variable "region" {',
    '  type    = string',
    `  default = "${DEFAULT_REGION[provider]}"`,
    '}',
    ...(provider === 'gcp' ? ['', 'variable "project" {', '  type        = string', '  description = "Id del proyecto de Google Cloud"', '}'] : []),
  ];

  for (const node of nodes.filter((candidate) => resourceFor(candidate.terraform, provider))) {
    const name = resourceName(node);
    const instance = node.props?.instance?.trim();
    if (instance) {
      lines.push('', `variable "${name}_instance" {`, '  type    = string', `  default = "${hcl(instance)}"`, '}');
    }
    const env = parseEnv(node.props?.env);
    const plain = env.filter(([key]) => !SECRET_KEY.test(key));
    if (plain.length) {
      lines.push('', `variable "${name}_env" {`, '  type = map(string)', '  default = {',
        ...plain.map(([key, value]) => `    ${key} = "${hcl(value)}"`), '  }', '}');
    }
    for (const [key] of env.filter(([candidate]) => SECRET_KEY.test(candidate))) {
      lines.push('', `variable "${name}_${key.toLowerCase()}" {`, '  type      = string', '  sensitive = true', '}');
    }
  }
  return lines.join('\n');
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Texto dentro de una cadena HCL: sin saltos de línea, comillas ni interpolaciones. */
function hcl(text: string): string {
  return oneLine(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$\{/g, '$$${').replace(/%\{/g, '%%{');
}
