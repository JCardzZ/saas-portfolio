import { CloudLink, CloudNode, CloudProviderId, ZoneId, forProvider } from './cloud-topology.data';
import { countResources, secretEnvKeys } from './terraform-generator';

export interface Finding {
  level: 'ok' | 'warn';
  check: string;
  detail: string;
}

const INTERNET: ZoneId[] = ['outside'];
const PRIVATE: ZoneId[] = ['compute', 'data'];
const SECRET_STORES = ['secrets', 'vault'];

/**
 * Revisa la topología del lienzo con reglas de seguridad básicas. Las comprobaciones son
 * reales sobre el diagrama (qué nodo se conecta con cuál y en qué zona vive); no auditan
 * ninguna infraestructura desplegada.
 */
export function validateTopology(nodes: CloudNode[], links: CloudLink[], provider: CloudProviderId): Finding[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const name = (node: CloudNode) => forProvider(node.service, provider);
  const resolved = links.flatMap((link) => {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    return from && to ? [{ from, to }] : [];
  });
  const findings: Finding[] = [];

  // 1. Nada de Internet entra directamente en una subred privada.
  const breaches = resolved.filter((link) => INTERNET.includes(link.from.zone) && PRIVATE.includes(link.to.zone));
  findings.push(breaches.length === 0
    ? { level: 'ok', check: 'Check: VPC Isolation OK', detail: 'Internet solo alcanza la subred pública' }
    : { level: 'warn', check: 'Warning: VPC Isolation', detail: breaches.map((link) => `${name(link.from)} → ${name(link.to)}`).join(', ') });

  // 2. Las bases de datos solo reciben tráfico de la capa de cómputo.
  const exposed = resolved.filter((link) => link.to.zone === 'data' && link.from.zone !== 'compute' && link.from.zone !== 'data');
  findings.push(exposed.length === 0
    ? { level: 'ok', check: 'Check: Public Access to DB Disabled', detail: 'las bases de datos solo aceptan a la capa de cómputo' }
    : { level: 'warn', check: 'Warning: Public Access to DB', detail: exposed.map((link) => `${name(link.to)} accesible desde ${name(link.from)}`).join(', ') });

  // 3. La capa de cómputo recibe el tráfico a través de un único punto de entrada público.
  const hasCompute = nodes.some((node) => node.zone === 'compute');
  const hasEntry = resolved.some((link) => link.from.zone === 'public' && link.to.zone === 'compute');
  if (hasCompute) {
    findings.push(hasEntry
      ? { level: 'ok', check: 'Check: Single Entry Point OK', detail: 'el tráfico entra por la subred pública' }
      : { level: 'warn', check: 'Warning: No Load Balancer', detail: 'la capa de cómputo no tiene punto de entrada' });
  }

  // 4. Hay dónde guardar los secretos.
  findings.push(nodes.some((node) => SECRET_STORES.includes(node.type))
    ? { level: 'ok', check: 'Check: Secrets Managed OK', detail: 'hay un almacén de secretos' }
    : { level: 'warn', check: 'Warning: No Secrets Manager', detail: 'las credenciales no tienen dónde guardarse' });

  // 5. Ninguna credencial escrita como variable de entorno de un recurso.
  const leaked = nodes.flatMap((node) => secretEnvKeys(node.props?.env).map((key) => `${node.name ?? name(node)} · ${key}`));
  if (leaked.length > 0) {
    findings.push({ level: 'warn', check: 'Warning: Secret in Env', detail: `${leaked.join(', ')}: debe leerse del almacén de secretos` });
  }

  const warnings = findings.filter((finding) => finding.level === 'warn').length;
  findings.push({
    level: warnings === 0 ? 'ok' : 'warn',
    check: 'Terraform Plan Ready',
    detail: `${countResources(nodes)} recursos · ${warnings === 0 ? 'sin avisos' : warnings + (warnings === 1 ? ' aviso' : ' avisos')}`,
  });
  return findings;
}
