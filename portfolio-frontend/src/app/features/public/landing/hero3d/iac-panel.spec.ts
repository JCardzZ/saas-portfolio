import { IAC_CYCLE, IacLive, iacPhase, nodeDetail, nodeHealth, paintIacPanel } from './iac-panel';

const LIVE: IacLive = {
  api: 'up', latencyMs: 88, siteVersion: 'v1.0.0', apiVersion: 'v1.0.0', sha: '62c9d56'.padEnd(40, '0'),
  database: true, cache: true, ai: 'CLOSED',
  cd: { run: 103, seconds: 108, jobs: [{ id: 'source', seconds: 12, ok: true }, { id: 'deploy', seconds: 60, ok: true }, { id: 'rollback', seconds: null, ok: null }] },
  ci: { run: 263, ok: true },
  events: [],
};

describe('iacPanel', () => {
  it('cycles through code, the real deploy and the live map', () => {
    expect(iacPhase(1)[0]).toBe(0);
    expect(iacPhase(7)[0]).toBe(1);
    expect(iacPhase(13)[0]).toBe(2);
    expect(iacPhase(IAC_CYCLE + 1)[0]).toBe(0);
  });

  it('shows the live figure of each piece', () => {
    expect(nodeDetail('sb', LIVE)).toBe('API · 88 ms');
    expect(nodeDetail('gh', LIVE)).toBe('CI #263 ✓');
    expect(nodeDetail('cf', LIVE)).toContain('v1.0.0');
    expect(nodeDetail('gm', { ...LIVE, ai: 'OPEN' })).toBe('circuito OPEN');
  });

  it('marks each piece by its real health and never invents one', () => {
    expect(nodeHealth('pg', LIVE)).toBeTrue();
    expect(nodeHealth('rd', { ...LIVE, api: 'degraded', cache: false })).toBeFalse();
    expect(nodeHealth('sb', { ...LIVE, api: 'down' })).toBeFalse();
    expect(nodeHealth('pg', { ...LIVE, api: 'demo' })).toBeNull();
    expect(nodeHealth('gh', { ...LIVE, ci: null })).toBeNull();
  });

  it('paints every phase in both themes without throwing', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 640;
    const ctx = canvas.getContext('2d')!;
    for (const light of [false, true]) {
      const colors = { accent: '#7FEE64', accentText: '#8FF06F', ink: light ? '#0B0D0B' : '#EEF6EC', muted: '#88938A', surface: '#151816', line: '#232824', light };
      for (const time of [3, 9, 15, 20]) {
        expect(() => paintIacPanel(ctx, 1024, 640, time, performance.now(), colors, { ...LIVE, events: [{ at: performance.now() - 300, target: 'cache' }] })).not.toThrow();
      }
      expect(() => paintIacPanel(ctx, 1024, 640, 9, 0, colors, { ...LIVE, api: 'demo', cd: null, ci: null, latencyMs: null })).not.toThrow();
    }
  });
});
