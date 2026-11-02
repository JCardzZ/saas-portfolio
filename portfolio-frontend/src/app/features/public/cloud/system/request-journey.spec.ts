import { defaultSystemDesign, SystemDesign } from './system-design';
import { requestJourney } from './request-journey';

function design(choices: SystemDesign['choices'], latencyMs?: number): SystemDesign {
  const base = defaultSystemDesign();
  return { ...base, choices: { ...base.choices, ...choices }, nfr: { ...base.nfr, ...(latencyMs ? { latencyMs } : {}) } };
}

describe('requestJourney', () => {
  it('walks a read from the browser to the database and back, adding up what the user waits', () => {
    const journey = requestJourney(design({}), 'read');

    expect(journey.steps.map((step) => step.actor)).toEqual(['Navegador', 'Red', 'Balanceador', 'JWT propio', 'Spring Boot', 'PostgreSQL', 'Red']);
    expect(journey.totalMs).toBe(journey.steps.reduce((sum, step) => sum + step.ms, 0));
    expect(journey.targetMs).toBeNull();
    expect(journey.steps.every((step) => step.failure.impact && step.failure.mitigation)).toBeTrue();
  });

  it('reads from Redis before the database and enters through the gateway when they are chosen', () => {
    const journey = requestJourney(design({ cache: 'redis', bff: 'gateway', auth: 'oidc-managed' }), 'read');
    const actors = journey.steps.map((step) => step.actor);

    expect(actors.indexOf('API gateway')).toBeLessThan(actors.indexOf('Spring Boot'));
    expect(actors.indexOf('Redis')).toBeLessThan(actors.indexOf('PostgreSQL'));
    expect(journey.steps.find((step) => step.actor === 'Token OIDC')!.failure.impact).toContain('quien ya tiene token sigue dentro');
  });

  it('keeps the queue and the push after the response: they do not add to what the user waits', () => {
    const journey = requestJourney(design({ queue: 'queue', push: 'websocket', cache: 'redis' }), 'write');
    const async = journey.steps.filter((step) => step.async);

    expect(async.map((step) => step.actor)).toEqual(['Cola', 'WebSocket']);
    expect(journey.totalMs).toBe(journey.steps.filter((step) => !step.async).reduce((sum, step) => sum + step.ms, 0));
    expect(journey.steps.find((step) => step.category === 'database')!.action).toContain('outbox');
    expect(journey.steps.some((step) => step.action.includes('Invalida'))).toBeTrue();
  });

  it('serves a public read from the CDN edge and compares the total with the p95 target', () => {
    const journey = requestJourney(design({ cache: 'cdn' }, 100), 'read');

    expect(journey.steps[1].actor).toBe('CDN');
    expect(journey.targetMs).toBe(100);
  });
});
