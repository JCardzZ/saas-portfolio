import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { runtimeConfig } from '../../../core/config/runtime-config';
import { LiveHealthService, componentDetail, componentState, parseHealth } from './live-health.service';

describe('live health of the deployed API', () => {
  const health = (body: Record<string, unknown>) => parseHealth(body, performance.now())!;

  it('reads /telemetry/health and judges each piece the way the API reports it', () => {
    const up = health({ status: 'UP', database: 'PostgreSQL 16 - Connected', redisCache: 'Redis - Healthy', circuitBreakers: { aiEngine: 'CLOSED' } });
    expect(componentState(up, 'status')).toBe('ok');
    expect(componentState(up, 'database')).toBe('ok');
    expect(componentState(up, 'redisCache')).toBe('ok');
    expect(componentState(up, 'aiEngine')).toBe('ok');
    expect(componentDetail(up, 'database')).toBe('PostgreSQL 16 - Connected');
    expect(componentDetail(up, 'aiEngine')).toBe('Circuit breaker CLOSED');

    const degraded = health({ status: 'DEGRADED', database: 'PostgreSQL 16 - Connected', redisCache: 'Redis - Unavailable', circuitBreakers: { aiEngine: 'HALF_OPEN' } });
    expect(componentState(degraded, 'status')).toBe('degraded');
    expect(componentState(degraded, 'redisCache')).toBe('down');
    expect(componentState(degraded, 'aiEngine')).toBe('degraded');
    expect(componentState(degraded, 'unknown-field')).toBeNull();
  });

  it('ignores anything that is not a health answer, and long or odd values', () => {
    expect(parseHealth(null, 0)).toBeNull();
    expect(parseHealth({ ok: true }, 0)).toBeNull();
    const odd = health({ status: 'UP', database: 'x'.repeat(500), redisCache: 42 });
    expect(odd.database).toBeNull();
    expect(odd.redisCache).toBeNull();
    expect(componentState(odd, 'database')).toBeNull();
  });

  it('never shows a live state in demo mode, and does not call any API', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(LiveHealthService);
    expect(runtimeConfig.mockMode).withContext('los tests corren en modo demo').toBeTrue();

    service.load();
    expect(service.state().kind).toBe('demo');
    TestBed.inject(HttpTestingController).verify();
  });
});
