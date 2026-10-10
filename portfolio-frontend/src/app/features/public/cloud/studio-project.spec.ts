import { NODE_COSTS } from './cloud-costs.data';
import { CLOUD_NODES, CloudNode, forProvider } from './cloud-topology.data';
import { History } from './studio-history';
import {
  BASE_ZONES, PROJECT_VERSION, STUDIO_PRESETS, StudioProject, migrateProject, nodeLabel, parseProject, referenceProject, roleAt, serializeProject, slotsIn, zoneAt, zoneLabel,
  zonesInside,
} from './studio-project';
import { generateMainTf, generateVariablesTf, parseEnv, secretEnvKeys } from './terraform-generator';
import { validateTopology } from './topology-validator';
import { crc32, createZip } from './zip-writer';

describe('zones', () => {
  it('finds the innermost zone under a point and the network zone a node gets there', () => {
    expect(zoneAt(BASE_ZONES, 710, 250)!.id).toBe('subnet-data');
    expect(zoneAt(BASE_ZONES, 800, 400)!.id).toBe('cloud');
    expect(zoneAt(BASE_ZONES, 50, 50)).toBeNull();

    expect(roleAt(BASE_ZONES, 402, 250, 'data')).toBe('public');
    expect(roleAt(BASE_ZONES, 556, 250, 'managed')).toBe('compute');
    // Dentro de la nube y fuera de la red: servicio gestionado, salvo que ya fuera global.
    expect(roleAt(BASE_ZONES, 865, 300, 'data')).toBe('managed');
    expect(roleAt(BASE_ZONES, 402, 95, 'global')).toBe('global');
    // Fuera de todo: Internet se queda Internet; lo demás pasa a ser externo.
    expect(roleAt(BASE_ZONES, 64, 250, 'outside')).toBe('outside');
    expect(roleAt(BASE_ZONES, 64, 250, 'data')).toBe('external');
    // Una red sin subredes es privada.
    expect(roleAt([{ id: 'v', kind: 'vpc', role: null, x: 0, y: 0, w: 200, h: 200 }], 100, 100, 'outside')).toBe('compute');
  });

  it('labels zones with the vocabulary of the cloud, offers slots inside them and knows what they contain', () => {
    const [cloud, network, , , data] = BASE_ZONES;
    expect(zoneLabel(cloud, 'gcp')).toBe('Google Cloud · región');
    expect(zoneLabel(network, 'azure')).toBe('VNet · red privada');
    expect(zoneLabel(data, 'aws')).toBe('Subred privada · datos');
    expect(zoneLabel({ ...data, label: 'Datos PCI' }, 'aws')).toBe('Datos PCI');

    expect(slotsIn(BASE_ZONES, 'data')).toEqual([[710, 250], [710, 340], [710, 430], [710, 520]]);
    expect(slotsIn([], 'data')).toEqual([]);
    expect(zonesInside(BASE_ZONES, network).map((zone) => zone.id)).toEqual(['subnet-public', 'subnet-app', 'subnet-data']);
    expect(zonesInside(BASE_ZONES, data)).toEqual([]);
  });
});

describe('nodeLabel', () => {
  const twin = (id: string, name?: string): CloudNode => ({ ...CLOUD_NODES.find((node) => node.id === 'redis')!, id, name });

  it('numbers repeated services from the second on and prefers the name given by the visitor', () => {
    const nodes = [twin('redis'), twin('redis-2'), twin('redis-3', 'Redis réplica 1'), twin('redis-4')];
    expect(nodes.map((node) => nodeLabel(node, nodes, 'ElastiCache'))).toEqual(['ElastiCache', 'ElastiCache #2', 'Redis réplica 1', 'ElastiCache #3']);
    expect(nodeLabel(twin('solo', '   '), [twin('solo', '   ')], 'ElastiCache')).toBe('ElastiCache');
  });
});

describe('presets', () => {
  it('offers the reference architecture, three banking and electoral scenarios and a blank canvas', () => {
    expect(STUDIO_PRESETS.map((preset) => preset.name)).toEqual([
      'Arquitectura de referencia',
      'Modernización bancaria (AKS + OAuth2 + Redis)',
      'Core bancario AS400 (IBM MQ + Spring Batch + AWS Lambda + SQS)',
      'Plataforma electoral anti-DDoS',
      'Arquitectura Event-Driven de Alto Rendimiento (Kafka + Spring Cloud Stream + DynamoDB)',
      'E-Commerce Global Multi-Region (CQRS + Event Sourcing + Aurora Multi-AZ)',
      'Plataforma SaaS B2B Multi-Inquilino (API Gateway + Micro-Frontends + Isolated Tenant Schemas)',
      'Pasarela de Pagos Zero-Trust FinTech (Vault + Kafka + Idempotency Engine)',
      'Sistema RAG Enterprise & Vector Search (Spring Boot + pgvector + Redis + LLM API)',
      'Lienzo en blanco',
    ]);
    // El backend limita el título a 120 caracteres.
    expect(STUDIO_PRESETS.every((preset) => preset.name.length <= 120)).toBeTrue();
    expect(STUDIO_PRESETS.at(-1)!.build()).toEqual({ provider: 'aws', nodes: [], links: [], zones: [] });
  });

  it('builds consistent projects that pass the security checks and survive a save and reload', () => {
    for (const preset of STUDIO_PRESETS) {
      const project = preset.build();
      const ids = project.nodes.map((node) => node.id);
      expect(new Set(ids).size).withContext(preset.id).toBe(ids.length);
      expect(project.links.every((link) => ids.includes(link.from) && ids.includes(link.to))).withContext(preset.id).toBeTrue();
      // Cada nodo está donde dice su zona de red.
      for (const node of project.nodes) {
        expect(roleAt(project.zones, node.x, node.y, node.zone)).withContext(`${preset.id}/${node.id}`).toBe(node.zone);
        expect(NODE_COSTS[node.type]).withContext(node.type).toBeDefined();
      }
      const warnings = validateTopology(project.nodes, project.links, project.provider).filter((finding) => finding.check.startsWith('Warning'));
      expect(warnings.map((warning) => warning.check).filter((check) => check !== 'Warning: No Secrets Manager')).withContext(preset.id).toEqual([]);
      expect(generateMainTf(project.nodes, project.links, project.provider)).toContain('terraform {');
      expect(parseProject(serializeProject(project))).withContext(preset.id).toEqual({ ok: true, project });
    }
  });

  it('models the asynchronous core: the APIs only reach the AS400 through the queue', () => {
    const { nodes, links, zones, provider } = STUDIO_PRESETS.find((preset) => preset.id === 'core-banking')!.build();
    const into = (id: string) => links.filter((link) => link.to === id).map((link) => link.from);

    expect(into('as400')).toEqual(['mq']);
    // La API deja eventos en SQS; una función Lambda los entrega a IBM MQ.
    expect(into('mq')).toEqual(['lambda', 'batch']);
    expect(into('lambda')).toEqual(['queue']);
    expect(into('queue')).toEqual(['api']);
    expect(zones.at(-1)!.label).toBe('Centro de datos propio');
    // El core y la cola están en el centro de datos: fuera de Terraform.
    expect(generateMainTf(nodes, links, provider)).toContain('# Fuera de Terraform: Visitantes, IBM MQ, IBM AS400');
    expect(nodes.find((node) => node.id === 'batch')!.name).toBe('Spring Batch');
  });
});

describe('pattern presets', () => {
  const build = (id: string) => STUDIO_PRESETS.find((preset) => preset.id === id)!.build();
  const names = (id: string, provider: 'aws' | 'gcp' | 'azure') => {
    const { nodes } = build(id);
    return nodes.map((node) => nodeLabel(node, nodes, forProvider(node.service, provider)));
  };
  const into = (id: string, target: string) => build(id).links.filter((link) => link.to === target).map((link) => link.from);

  it('translate every component to each cloud, and pass the security checks in all three', () => {
    expect(names('event-driven', 'aws')).toEqual(jasmine.arrayContaining(['MSK (Kafka)', 'DynamoDB', 'ECS Fargate', 'ECS Fargate #2']));
    expect(names('event-driven', 'gcp')).toEqual(jasmine.arrayContaining(['Managed Kafka', 'Firestore (Datastore)', 'Cloud Run']));
    expect(names('event-driven', 'azure')).toEqual(jasmine.arrayContaining(['Event Hubs', 'Cosmos DB', 'Container Apps']));

    expect(names('ecommerce-cqrs', 'aws')).toEqual(jasmine.arrayContaining(['Aurora PostgreSQL', 'Aurora PostgreSQL #2', 'Elasticsearch']));
    expect(names('ecommerce-cqrs', 'gcp')).toContain('AlloyDB');
    expect(names('saas-multitenant', 'azure')).toEqual(jasmine.arrayContaining(['API Management', 'Entra External ID', 'Service Bus']));
    expect(names('fintech-payments', 'gcp')).toEqual(jasmine.arrayContaining(['Cloud Armor', 'Apigee', 'HashiCorp Vault', 'Memorystore']));
    expect(names('rag-enterprise', 'aws')).toEqual(jasmine.arrayContaining(['Bedrock', 'S3', 'SQS']));
    expect(names('rag-enterprise', 'gcp')).toEqual(jasmine.arrayContaining(['Vertex AI', 'Cloud Storage', 'Pub/Sub']));
    expect(names('rag-enterprise', 'azure')).toEqual(jasmine.arrayContaining(['Azure OpenAI', 'Blob Storage', 'Service Bus']));

    for (const id of ['event-driven', 'ecommerce-cqrs', 'saas-multitenant', 'fintech-payments', 'rag-enterprise']) {
      const { nodes, links } = build(id);
      for (const provider of ['aws', 'gcp', 'azure'] as const) {
        expect(validateTopology(nodes, links, provider).filter((finding) => finding.check.startsWith('Warning'))).withContext(`${id}/${provider}`).toEqual([]);
        expect(generateMainTf(nodes, links, provider)).withContext(`${id}/${provider}`).not.toContain('resource "" ');
      }
    }
  });

  it('draw the flow each pattern is named after', () => {
    // Event-driven: quien produce no habla con quien consume, solo con el bus.
    expect(into('event-driven', 'kafka')).toEqual(['api']);
    expect(into('event-driven', 'consumers')).toEqual(['kafka']);
    expect(into('event-driven', 'store')).toEqual(['consumers']);

    // CQRS: la API de comandos escribe; la de consultas solo lee de su propio modelo.
    expect(into('ecommerce-cqrs', 'event-store')).toEqual(['api']);
    expect(into('ecommerce-cqrs', 'read-model')).toEqual(['queries']);
    expect(into('ecommerce-cqrs', 'queries')).toEqual(['lb', 'events']);
    expect(into('ecommerce-cqrs', 'replica')).toEqual(['event-store']);
    expect(build('ecommerce-cqrs').zones.at(-1)!.label).toBe('Región secundaria');

    // SaaS: todo entra por la puerta de APIs, que valida al inquilino.
    expect(into('saas-multitenant', 'api')).toEqual(['gateway']);
    expect(into('saas-multitenant', 'identity')).toEqual(['gateway']);

    // Pagos: cortafuegos, puerta de APIs y, antes de cobrar, la clave de idempotencia; los secretos, de Vault.
    expect(into('fintech-payments', 'gateway')).toEqual(['waf']);
    expect(build('fintech-payments').links.find((link) => link.to === 'redis')!.label).toBe('¿ya cobrado?');
    expect(into('fintech-payments', 'vault')).toEqual(['api', 'ledger']);

    // RAG: la ingesta y la API comparten el índice vectorial y el modelo.
    expect(into('rag-enterprise', 'postgres')).toEqual(['api', 'ingest']);
    expect(into('rag-enterprise', 'llm')).toEqual(['api', 'ingest']);
  });
});

describe('project schema versions', () => {
  // Un proyecto tal como lo guardaba el estudio antes de las conexiones con tipo.
  const savedInVersion1 = (): Record<string, any> => ({ ...JSON.parse(serializeProject(referenceProject())), version: 1 });

  it('writes the current version', () => {
    expect(JSON.parse(serializeProject(referenceProject()))['version']).toBe(PROJECT_VERSION);
    expect(PROJECT_VERSION).toBe(2);
  });

  it('still opens a project saved with version 1, unchanged', () => {
    const parsed = parseProject(JSON.stringify(savedInVersion1()));
    expect(parsed).toEqual({ ok: true, project: referenceProject() });
  });

  it('opens every preset as version 1 would have stored it', () => {
    for (const preset of STUDIO_PRESETS) {
      const project = preset.build();
      const stored = JSON.stringify({ ...JSON.parse(serializeProject(project)), version: 1 });
      expect(parseProject(stored)).withContext(preset.id).toEqual({ ok: true, project });
    }
  });

  it('drops a link kind from a version 1 file, where it did not exist', () => {
    const old = savedInVersion1();
    old['links'][0]['kind'] = 'CDC_STREAM';
    const parsed = parseProject(JSON.stringify(old));
    expect(parsed.ok && parsed.project.links[0].kind).toBeUndefined();
  });

  it('keeps a known link kind in version 2 and discards an unknown one', () => {
    const current = JSON.parse(serializeProject(referenceProject()));
    current['links'][0]['kind'] = 'REPLICATION';
    current['links'][1]['kind'] = 'TELEPATHY';
    const parsed = parseProject(JSON.stringify(current));
    expect(parsed.ok && parsed.project.links[0].kind).toBe('REPLICATION');
    expect(parsed.ok && parsed.project.links[1].kind).toBeUndefined();
  });

  it('refuses versions it does not know, older or newer', () => {
    expect(migrateProject({ version: 0 })).toBeNull();
    expect(migrateProject({ version: 3 })).toBeNull();
    expect(migrateProject({})).toBeNull();
    expect(migrateProject({ version: 1, links: 'no' })).toEqual({ version: 2, links: 'no' });
  });
});

describe('parseProject', () => {
  const valid = (): Record<string, unknown> => JSON.parse(serializeProject(referenceProject()));
  const parse = (change: (project: Record<string, any>) => void) => {
    const project = valid();
    change(project);
    return parseProject(JSON.stringify(project));
  };

  it('rejects what is not a project of this studio', () => {
    expect(parseProject('{ roto')).toEqual({ ok: false, error: 'El archivo no es un JSON válido.' });
    expect(parseProject('[]').ok).toBeFalse();
    expect(parseProject('{"format":"otra-cosa"}')).toEqual({ ok: false, error: 'El archivo no es un proyecto del Estudio de arquitectura.' });
    expect(parse((project) => (project['version'] = 99)).ok).toBeFalse();
    expect(parse((project) => (project['provider'] = 'oracle')).ok).toBeFalse();
    expect(parse((project) => delete project['zones']).ok).toBeFalse();
    expect(parse((project) => (project['nodes'] = Array.from({ length: 61 }, () => project['nodes'][0]))))
      .toEqual({ ok: false, error: 'El proyecto es demasiado grande para este lienzo.' });
  });

  it('rejects invalid or duplicated nodes and zones', () => {
    expect(parse((project) => project['nodes'].push(project['nodes'][0])).ok).toBeFalse();
    expect(parse((project) => (project['nodes'][0].id = '<script>')).ok).toBeFalse();
    expect(parse((project) => (project['nodes'][0].x = 'NaN')).ok).toBeFalse();
    expect(parse((project) => (project['nodes'][0].zone = 'dmz')).ok).toBeFalse();
    expect(parse((project) => (project['nodes'][3].terraform = 'aws_lb" {} resource "x')).ok).toBeFalse();
    expect(parse((project) => (project['zones'][0].kind = 'galaxy')).ok).toBeFalse();
    expect(parse((project) => (project['zones'][0].w = null)).ok).toBeFalse();
  });

  it('keeps only known fields, within their limits, and drops the rest', () => {
    const parsed = parse((project) => {
      Object.assign(project['nodes'][0], {
        x: 99999, name: 'N'.repeat(200), icon: 'no-existe', onclick: 'alert(1)',
        props: { instance: 't3.medium', ports: 8080, env: 'A=1', extra: true },
      });
      project['nodes'][1].icon = { default: 'provider', aws: 'awsWaf', gcp: 'inventado' };
      project['links'].push({ from: 'api', to: 'fantasma' }, { from: 'api', to: 'api' });
      project['zones'][0].x = -500;
      project['extra'] = { anything: true };
    });

    expect(parsed.ok).toBeTrue();
    const { nodes, links, zones } = (parsed as { ok: true; project: StudioProject }).project;
    expect(nodes[0].x).toBe(1110);
    expect(nodes[0].name!.length).toBe(60);
    expect(nodes[0].icon).toBeNull();
    expect(nodes[0].props).toEqual({ instance: 't3.medium', env: 'A=1' });
    expect(Object.keys(nodes[0])).not.toContain('onclick');
    expect(nodes[1].icon).toEqual({ default: 'provider', aws: 'awsWaf' } as never);
    expect(links.length).toBe(8);
    expect(zones[0].x).toBe(0);
  });
});

describe('History', () => {
  it('undoes and redoes, forgetting the redo branch after a new change and the oldest steps beyond its limit', () => {
    const history = new History<{ value: number }>(3);
    expect(history.canUndo).toBeFalse();
    expect(history.undo({ value: 0 })).toBeNull();

    history.record({ value: 1 });
    history.record({ value: 2 });
    expect(history.undo({ value: 3 })).toEqual({ value: 2 });
    expect(history.canRedo).toBeTrue();
    expect(history.redo({ value: 2 })).toEqual({ value: 3 });

    history.undo({ value: 3 });
    history.record({ value: 9 });
    expect(history.canRedo).toBeFalse();

    for (let value = 10; value < 20; value++) {
      history.record({ value });
    }
    const steps: number[] = [];
    for (let previous = history.undo({ value: 0 }); previous; previous = history.undo(previous)) {
      steps.push(previous.value);
    }
    expect(steps).toEqual([19, 18, 17]);
  });

  it('keeps its own copies, so later edits do not rewrite the past', () => {
    const history = new History<{ list: number[] }>();
    const state = { list: [1] };
    history.record(state);
    state.list.push(2);

    expect(history.undo(state)).toEqual({ list: [1] });
  });
});

describe('Terraform properties', () => {
  const api = (): CloudNode => ({
    ...CLOUD_NODES.find((node) => node.id === 'api')!,
    name: 'API de pagos',
    props: { instance: 't3.medium', ports: '8080, 443', env: 'SPRING_PROFILES_ACTIVE=prod\nJWT_SECRET=super"secreto\n# comentario\nNOMBRE CON ESPACIOS=x\nVACIA=' },
  });

  it('reads KEY=value lines and spots credentials written in clear', () => {
    expect(parseEnv(api().props!.env)).toEqual([['SPRING_PROFILES_ACTIVE', 'prod'], ['JWT_SECRET', 'super"secreto'], ['VACIA', '']]);
    expect(parseEnv(undefined)).toEqual([]);
    expect(secretEnvKeys(api().props!.env)).toEqual(['JWT_SECRET']);
    expect(secretEnvKeys('DB_PASSWORD=\nAPI_KEY=abc\nPUERTO=8080')).toEqual(['API_KEY']);
  });

  it('notes the properties in main.tf and declares them in variables.tf without copying secrets', () => {
    const nodes = [api(), CLOUD_NODES.find((node) => node.id === 'postgres')!];
    const main = generateMainTf(nodes, [], 'aws');
    expect(main).toContain('  # nombre: API de pagos');
    expect(main).toContain('  # capacidad: var.api_instance');
    expect(main).toContain('  # puertos: 8080, 443');
    expect(main).toContain('  # entorno: var.api_env (SPRING_PROFILES_ACTIVE, JWT_SECRET, VACIA)');

    const variables = generateVariablesTf(nodes, 'aws');
    expect(variables).toContain('variable "region" {\n  type    = string\n  default = "us-east-1"\n}');
    expect(variables).toContain('variable "api_instance" {\n  type    = string\n  default = "t3.medium"\n}');
    expect(variables).toContain('variable "api_env" {\n  type = map(string)\n  default = {\n    SPRING_PROFILES_ACTIVE = "prod"\n    VACIA = ""\n  }\n}');
    expect(variables).toContain('variable "api_jwt_secret" {\n  type      = string\n  sensitive = true\n}');
    expect(variables).not.toContain('secreto');
    expect(variables).not.toContain('postgres');
    expect(generateVariablesTf(nodes, 'gcp')).toContain('variable "project" {');
  });

  it('cannot be broken out of with quotes or interpolations', () => {
    const node = { ...api(), props: { instance: 'x"\n}\nresource "evil" "x" { ${file("/etc/passwd")}', env: 'A=${var.x} "y"' } };
    const variables = generateVariablesTf([node], 'aws');

    expect(variables).toContain('default = "x\\" } resource \\"evil\\" \\"x\\" { $${file(\\"/etc/passwd\\")}"');
    expect(variables).toContain('A = "$${var.x} \\"y\\""');
    expect(variables.match(/^resource /gm)).toBeNull();
  });

  it('warns when a credential is written as an environment variable', () => {
    const findings = validateTopology([...CLOUD_NODES.filter((node) => node.id !== 'api'), api()], [], 'aws');
    expect(findings.find((finding) => finding.check === 'Warning: Secret in Env')!.detail)
      .toBe('API de pagos · JWT_SECRET: debe leerse del almacén de secretos');
    expect(validateTopology(CLOUD_NODES, [], 'aws').some((finding) => finding.check === 'Warning: Secret in Env')).toBeFalse();
  });
});

describe('createZip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('packs the files uncompressed in a valid archive', async () => {
    const zip = createZip([{ name: 'main.tf', content: 'terraform {}\n' }, { name: 'variables.tf', content: 'ñ' }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const text = new TextDecoder().decode(bytes);

    expect(zip.type).toBe('application/zip');
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(text).toContain('main.tf');
    expect(text).toContain('terraform {}\n');
    // Fin del directorio central: dos entradas y el desplazamiento correcto del directorio.
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const directory = view.getUint32(end + 16, true);
    expect(view.getUint32(directory, true)).toBe(0x02014b50);
    // La segunda entrada apunta a su cabecera local y declara el tamaño en bytes (ñ ocupa dos).
    const second = directory + 46 + 'main.tf'.length;
    expect(view.getUint32(second + 24, true)).toBe(2);
    expect(view.getUint32(view.getUint32(second + 42, true), true)).toBe(0x04034b50);
  });
});
