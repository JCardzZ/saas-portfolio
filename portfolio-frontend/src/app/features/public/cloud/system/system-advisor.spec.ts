import { CLOUD_NODES } from '../cloud-topology.data';
import { Assessment, assessSystem } from './system-advisor';
import { InfraNode, SystemDesign, defaultSystemDesign, withChoice } from './system-design';

const REFERENCE: InfraNode[] = CLOUD_NODES.map((node) => ({ id: node.id, type: node.type }));
const deployed = (design: SystemDesign): SystemDesign => ({ ...design, deployments: { ...design.deployments, backend: 'api' } });
const adviceIds = (assessment: Assessment) => assessment.advice.map((item) => item.id);
const level = (assessment: Assessment, id: string) => assessment.dimensions.find((dimension) => dimension.id === id)!.level;

describe('system design advisor', () => {
  it('says the default system scales with limits and why', () => {
    const assessment = assessSystem(defaultSystemDesign(), REFERENCE);

    expect(assessment.verdict).toBe('limited');
    expect(assessment.headline).toBe('Escala, pero con límites');
    expect(adviceIds(assessment)).toEqual(jasmine.arrayContaining(['backend-not-deployed', 'no-cache', 'no-queue', 'own-credentials', 'no-waf']));
    for (const item of assessment.advice) {
      expect(item.title.length).withContext(item.id).toBeGreaterThan(10);
      expect(item.why.length).withContext(`${item.id}: dice por qué`).toBeGreaterThan(30);
    }
  });

  it('says it can scale once the backend is elastic, reads are cached and slow work is queued', () => {
    let design = deployed(defaultSystemDesign());
    design = withChoice(withChoice(design, 'cache', 'redis'), 'queue', 'queue');
    design = { ...design, deployments: { backend: 'api' } };
    const assessment = assessSystem(design, REFERENCE);

    expect(assessment.verdict).toBe('good');
    expect(assessment.headline).toBe('Este diseño puede escalar');
    expect(level(assessment, 'scalability')).toBe('good');
    expect(assessment.dimensions.find((dimension) => dimension.id === 'scalability')!.strengths.join(' ')).toContain('contenedores serverless');
  });

  it('blocks on a server-side session without a shared store, and offers the fix as a choice', () => {
    const design = deployed(withChoice(defaultSystemDesign(), 'auth', 'session'));
    const assessment = assessSystem(design, REFERENCE);
    const blocking = assessment.advice[0];

    expect(assessment.verdict).toBe('risk');
    expect(assessment.headline).toBe('Así no va a escalar');
    expect(blocking.id).withContext('lo más grave va primero').toBe('session-without-store');
    expect(blocking.action).toEqual({ kind: 'choose', label: 'Añadir Redis como almacén de sesiones', category: 'cache', option: 'redis' });
    expect(adviceIds(assessSystem(withChoice(design, 'cache', 'redis'), REFERENCE))).not.toContain('session-without-store');
  });

  it('reads the infrastructure: virtual machines, missing balancer, firewall, secrets and observability', () => {
    const bare: InfraNode[] = [{ id: 'vm1', type: 'vm' }, { id: 'db', type: 'postgres' }];
    const assessment = assessSystem({ ...defaultSystemDesign(), deployments: { backend: 'vm1' } }, bare);

    expect(adviceIds(assessment)).toEqual(jasmine.arrayContaining(['backend-on-vm', 'no-entry-point', 'no-waf', 'no-secrets', 'no-observability']));
    expect(level(assessment, 'availability')).toBe('limited');
    expect(assessment.advice.find((item) => item.id === 'no-waf')!.action).toEqual({ kind: 'infra', label: 'Añade un cortafuegos de aplicación (WAF) en la vista de Infraestructura' });

    const complete = assessSystem(deployed(defaultSystemDesign()), [...REFERENCE, { id: 'waf', type: 'waf' }]);
    expect(adviceIds(complete)).not.toContain('no-waf');
    expect(adviceIds(complete)).not.toContain('no-entry-point');
    expect(adviceIds(complete)).not.toContain('no-secrets');
    expect(adviceIds(complete)).not.toContain('no-observability');
  });

  it('warns about what each API style and real-time choice brings', () => {
    const grpc = assessSystem(withChoice(defaultSystemDesign(), 'api', 'grpc'), REFERENCE);
    expect(adviceIds(grpc)).toContain('grpc-in-browser');
    expect(adviceIds(assessSystem(withChoice(withChoice(defaultSystemDesign(), 'api', 'grpc'), 'bff', 'gateway'), REFERENCE))).not.toContain('grpc-in-browser');
    expect(adviceIds(assessSystem(withChoice(defaultSystemDesign(), 'api', 'graphql'), REFERENCE))).toContain('graphql-cost');
    expect(adviceIds(assessSystem(withChoice(defaultSystemDesign(), 'api', 'events'), REFERENCE))).toContain('eventual-consistency');
    expect(adviceIds(assessSystem(withChoice(defaultSystemDesign(), 'push', 'websocket'), REFERENCE))).toContain('websocket-fanout');
    expect(adviceIds(assessSystem(withChoice(withChoice(defaultSystemDesign(), 'push', 'websocket'), 'queue', 'pubsub'), REFERENCE))).not.toContain('websocket-fanout');
  });

  it('adds what the non-functional requirements ask for and the design lacks, under its dimension', () => {
    const assessment = assessSystem(deployed(defaultSystemDesign()), REFERENCE, [
      { rule: 'availability-database', kind: 'nfr', severity: 'warning', message: 'Con 99,9 % la base de datos necesita réplica.', suggestion: 'Añade una base de datos con réplica.' },
      { rule: 'budget', kind: 'nfr', severity: 'error', message: 'El coste supera el presupuesto.' },
      { rule: 'deployment-pending', kind: 'deployment', severity: 'warning', message: 'No cuenta: no es de un requisito.' },
    ]);

    expect(assessment.dimensions.find((dimension) => dimension.id === 'availability')!.advice.map((item) => item.id)).toContain('nfr-availability-database');
    expect(level(assessment, 'operations')).toBe('risk');
    expect(adviceIds(assessment)).not.toContain('nfr-deployment-pending');
  });

  it('is deterministic: the same system always gets the same assessment', () => {
    const design = deployed(withChoice(defaultSystemDesign(), 'cache', 'cdn'));
    expect(assessSystem(design, REFERENCE)).toEqual(assessSystem(structuredClone(design), structuredClone(REFERENCE)));
  });
});
