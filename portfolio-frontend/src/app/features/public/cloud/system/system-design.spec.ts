import { SERVICE_CATALOG } from '../cloud-catalog.data';
import { CLOUD_NODES } from '../cloud-topology.data';
import { evaluatedCases } from './system-cases';
import { NFR_INPUTS, NFR_RULES, SYSTEM_CATALOG } from './system-catalog.data';
import { chosen, defaultSystemDesign, deployTargets, evaluateSystem, parseSystemDesign, plain, withChoice } from './system-design';

const INFRA_TYPES = new Set([...SERVICE_CATALOG.flatMap((category) => category.items), ...CLOUD_NODES].map((piece) => piece.type));
const findingsOf = (name: string) => evaluatedCases().find((entry) => entry.name === name)!.findings;
const rulesOf = (name: string) => findingsOf(name).map((finding) => finding.rule);

describe('system design (studio.system-design)', () => {
  describe('catalog', () => {
    it('is curated: nine categories with three or four options each', () => {
      expect(SYSTEM_CATALOG.map((category) => category.id)).toEqual(['client', 'backend', 'api', 'auth', 'database', 'cache', 'queue', 'bff', 'push']);
      for (const category of SYSTEM_CATALOG) {
        // Las opcionales cuentan «sin elegir» como una opción más.
        const options = category.options.length + (category.optional ? 1 : 0);
        expect(options).withContext(category.id).toBeGreaterThanOrEqual(3);
        expect(options).withContext(category.id).toBeLessThanOrEqual(4);
        expect(new Set(category.options.map((option) => option.id)).size).toBe(category.options.length);
      }
    });

    it('only deploys on pieces the infrastructure view has, and says why when something is not deployed', () => {
      for (const option of SYSTEM_CATALOG.flatMap((category) => category.options)) {
        for (const type of option.deploysOn) {
          expect(INFRA_TYPES.has(type)).withContext(`${option.id} → ${type}`).toBeTrue();
        }
        expect(option.deploysOn.length > 0 || (option.notDeployed ?? '').length > 20).withContext(option.id).toBeTrue();
        expect(option.summary.length).withContext(option.id).toBeGreaterThan(30);
      }
    });

    it('generates a contract only for REST and gRPC', () => {
      const contracts = SYSTEM_CATALOG.find((category) => category.id === 'api')!.options.map((option) => [option.id, option.contract]);

      expect(contracts).toEqual([['rest', 'openapi'], ['grpc', 'proto'], ['graphql', undefined], ['events', undefined]]);
    });
  });

  describe('rules of the non-functional requirements', () => {
    it('are data that only name things that exist', () => {
      expect(NFR_RULES.length).toBeGreaterThanOrEqual(12);
      expect(new Set(NFR_RULES.map((rule) => rule.id)).size).toBe(NFR_RULES.length);
      for (const rule of NFR_RULES) {
        const expect_ = rule.expect;
        if (expect_.kind === 'choice-in') {
          const options = SYSTEM_CATALOG.find((category) => category.id === expect_.category)!.options.map((option) => option.id);
          expect(expect_.options.every((option) => options.includes(option))).withContext(rule.id).toBeTrue();
        } else if (expect_.kind !== 'cost-within-budget') {
          const types = [...expect_.types, ...(expect_.kind === 'infra-replicated' ? expect_.orAny : [])];
          expect(types.every((type) => INFRA_TYPES.has(type))).withContext(rule.id).toBeTrue();
        }
        expect(rule.suggestion.length).withContext(rule.id).toBeGreaterThan(15);
      }
      expect(NFR_INPUTS.map((input) => input.field)).toEqual(['users', 'rps', 'latencyMs', 'availability', 'budgetUsd']);
    });
  });

  describe('"se despliega en"', () => {
    it('offers only the pieces of the infrastructure where the choice can run', () => {
      const backend = chosen(defaultSystemDesign(), 'backend')!;

      expect(deployTargets(backend, CLOUD_NODES).map((node) => node.id)).toEqual(['api']);
      expect(deployTargets(chosen(defaultSystemDesign(), 'database')!, CLOUD_NODES).map((node) => node.id)).toEqual(['postgres']);
    });

    it('reminds what is still not deployed, and where it could go', () => {
      expect(findingsOf('default-undeployed')).toEqual([
        jasmine.objectContaining({ rule: 'deployment-pending', severity: 'warning', category: 'client', suggestion: 'Despliégalo en S3 + CloudFront.' }),
        jasmine.objectContaining({ rule: 'deployment-pending', category: 'backend', message: 'Java · Spring Boot todavía no se despliega en ninguna pieza de la infraestructura.', suggestion: 'Despliégalo en ECS Fargate.' }),
        jasmine.objectContaining({ rule: 'deployment-pending', category: 'database', suggestion: 'Despliégalo en RDS PostgreSQL.' }),
      ]);
      expect(findingsOf('deployed-without-requirements')).toEqual([]);
    });

    it('refuses a piece deployed where it cannot run or on something that is gone', () => {
      expect(findingsOf('invalid-and-missing-deployments')).toEqual([
        {
          rule: 'deployment-invalid', kind: 'deployment', severity: 'error', category: 'backend', nodeId: 'postgres',
          message: 'Java · Spring Boot no se puede desplegar en RDS PostgreSQL.', suggestion: 'Despliégalo en ECS Fargate.',
        },
        {
          rule: 'deployment-missing', kind: 'deployment', severity: 'error', category: 'database',
          message: 'Relacional · PostgreSQL se desplegaba en una pieza que ya no está en la infraestructura.', suggestion: 'Despliégalo en RDS PostgreSQL.',
        },
      ]);
    });

    it('asks for a piece when the infrastructure has nowhere to run it, and never for a mobile app', () => {
      const findings = findingsOf('nothing-to-deploy-on');

      expect(findings.map((finding) => finding.category)).toEqual(['backend', 'database', 'push']);
      expect(new Set(findings.map((finding) => finding.suggestion))).toEqual(new Set(['Añade a la infraestructura una pieza donde desplegarlo.']));
    });

    it('lets a session live in Redis and flags a cache put on a database', () => {
      expect(rulesOf('session-needs-a-shared-store')).toEqual(['deployment-invalid']);
      expect(findingsOf('session-needs-a-shared-store')[0].message).toBe('Caché en el borde (CDN) no se puede desplegar en RDS PostgreSQL.');
    });
  });

  describe('non-functional requirements', () => {
    it('warns about everything a demanding system is missing, with what to do', () => {
      expect(rulesOf('demanding-requirements-on-the-reference')).toEqual([
        // El cliente se desplegaba en el almacenamiento estático, que este caso no tiene.
        'deployment-missing',
        'rps-cache', 'rps-async', 'latency-cache', 'latency-edge', 'availability-database', 'availability-entry', 'availability-multi-region',
        'users-observability', 'pci-waf', 'pci-secrets', 'pci-audit', 'health-secrets', 'health-identity', 'budget',
      ]);
      const byRule = Object.fromEntries(findingsOf('demanding-requirements-on-the-reference').map((finding) => [finding.rule, finding]));
      expect(byRule['rps-cache'].message).toBe('Con 3000 peticiones por segundo y sin caché, todas las lecturas llegan a la base de datos.');
      expect(byRule['availability-multi-region'].message).toContain('El 99.99 % son menos de 53 minutos');
      expect(byRule['budget'].message).toBe('El coste estimado (≈ $138 al mes) supera el presupuesto de $100.');
      expect(byRule['health-identity']).toEqual(jasmine.objectContaining({ category: 'auth', severity: 'warning', kind: 'nfr' }));
    });

    it('has nothing to say once the design meets them', () => {
      expect(findingsOf('demanding-requirements-met')).toEqual([]);
    });

    it('accepts a second database instance as the replica availability asks for', () => {
      expect(findingsOf('one-database-replicated-or-not')).toEqual([]);
      expect(rulesOf('demanding-requirements-on-the-reference')).toContain('availability-database');
    });

    it('rejects values out of range instead of reasoning with them', () => {
      const findings = findingsOf('requirements-out-of-range');

      expect(findings.filter((finding) => finding.rule === 'nfr-range').map((finding) => finding.message)).toEqual([
        'Usuarios activos al mes: tiene que estar entre 1 y 1000000000.',
        'Peticiones por segundo en el pico: tiene que estar entre 1 y 1000000.',
        'Disponibilidad objetivo: elige uno de estos valores: 99, 99.9, 99.95, 99.99.',
        'Presupuesto mensual: tiene que estar entre 1 y 10000000.',
      ]);
      expect(findings.every((finding) => finding.rule !== 'nfr-range' || finding.severity === 'error')).toBeTrue();
    });

    it('does not judge the budget without a cost estimate', () => {
      expect(findingsOf('budget-without-an-estimate')).toEqual([]);
    });

    it('writes numbers the same way everywhere', () => {
      expect([plain(3000), plain(99.9), plain(99.95), plain(0.5), plain(1_000_000_000)]).toEqual(['3000', '99.9', '99.95', '0.5', '1000000000']);
    });
  });

  describe('a saved design', () => {
    it('is read back as it was', () => {
      const design = evaluatedCases().find((entry) => entry.name === 'demanding-requirements-met')!.design;

      expect(parseSystemDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
    });

    it('keeps only what the catalog knows', () => {
      const parsed = parseSystemDesign({
        choices: { client: 'holograma', backend: 'go', cache: 'memcached', queue: 'queue', intruso: 'x' },
        deployments: { backend: 'api', client: '<script>', api: 'api', queue: 42 },
        nfr: { users: '1000', rps: 250, latencyMs: Infinity, budgetUsd: -5, compliance: ['pci', 'gdpr'], extra: true },
      })!;

      expect(parsed.choices).toEqual({ client: 'web-spa', backend: 'go', api: 'rest', auth: 'jwt-own', database: 'postgresql', queue: 'queue' });
      expect(parsed.deployments).toEqual({ backend: 'api' });
      expect(parsed.nfr).toEqual({ rps: 250, compliance: ['pci'] });
      expect(parseSystemDesign(null)).toBeNull();
      expect(parseSystemDesign([])).toBeNull();
    });

    it('forgets where a piece was deployed when the choice changes', () => {
      const design = { ...defaultSystemDesign(), deployments: { backend: 'api', database: 'postgres' } };

      const changed = withChoice(design, 'database', 'document');

      expect(changed.choices.database).toBe('document');
      expect(changed.deployments).toEqual({ backend: 'api' });
      expect(withChoice({ ...design, choices: { ...design.choices, cache: 'redis' } }, 'cache', null).choices.cache).toBeUndefined();
    });

    it('evaluates with names given by whoever draws the nodes', () => {
      const findings = evaluateSystem(defaultSystemDesign(), [{ id: 'api', type: 'containers' }], null, () => 'Mi contenedor');

      expect(findings.find((finding) => finding.category === 'backend')!.suggestion).toBe('Despliégalo en Mi contenedor.');
    });
  });
});
