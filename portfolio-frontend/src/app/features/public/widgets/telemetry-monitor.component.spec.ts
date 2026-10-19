import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { runtimeConfig } from '../../../core/config/runtime-config';
import { SystemEventsService } from '../data/system-events.service';
import { TelemetryMonitorComponent } from './telemetry-monitor.component';

describe('TelemetryMonitorComponent', () => {
  const config = runtimeConfig as { mockMode: boolean };
  const original = config.mockMode;
  let fixture: ComponentFixture<TelemetryMonitorComponent>;
  let element: HTMLElement;

  const create = (mockMode: boolean, before?: (events: SystemEventsService) => void) => {
    config.mockMode = mockMode;
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    before?.(TestBed.inject(SystemEventsService));
    fixture = TestBed.createComponent(TelemetryMonitorComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  };
  const health = () => TestBed.inject(HttpTestingController).expectOne((request) => request.url.endsWith('/telemetry/health'));

  afterEach(() => {
    config.mockMode = original;
    TestBed.inject(HttpTestingController).verify();
  });

  it('shows no figure at all in demo mode: there is no API to measure', () => {
    create(true);
    fixture.componentInstance.probe = () => fail('no debe sondear en modo demo');

    expect(element.querySelector('[data-testid="telemetry-badge"]')!.textContent).toContain('Modo demo');
    expect(element.querySelector('[data-testid="telemetry-demo"]')).not.toBeNull();
    expect(element.textContent).not.toMatch(/\d+\s?%|12[.,]4/);
  });

  it('shows the real health of the API and of each piece, and the latency it measured', () => {
    create(false);
    fixture.componentInstance.probe();
    health().flush({ status: 'DEGRADED', database: 'PostgreSQL 16 - Connected', redisCache: 'Redis - Unavailable', circuitBreakers: { aiEngine: 'CLOSED' } });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="telemetry-status"]')!.textContent).toContain('API DEGRADED');
    expect(element.querySelector('[data-testid="telemetry-badge"]')!.textContent).toContain('En vivo');
    const pieces = Object.fromEntries(Array.from(element.querySelectorAll('[data-piece]'))
      .map((item) => [item.getAttribute('data-piece'), item.querySelector('.dot')!.getAttribute('data-tone')]));
    expect(pieces).toEqual({ PostgreSQL: 'ok', Redis: 'down', Gemini: 'ok' });
    expect(element.querySelectorAll('svg rect.bar').length).toBe(1);
    expect(element.querySelector('[data-testid="telemetry-latency"]')!.textContent).toMatch(/^\d+ ms$/);
  });

  it('says so when the API does not answer, without inventing a latency', () => {
    create(false);
    fixture.componentInstance.probe();
    health().error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="telemetry-badge"]')!.textContent).toContain('Sin respuesta');
    expect(element.querySelector('[data-testid="telemetry-latency"]')!.textContent).toContain('—');
    expect(element.querySelectorAll('svg rect.bar').length).toBe(0);
  });

  it('counts only what the backend does after the page opened, from the live stream', () => {
    // Esto ya estaba en la consola antes de abrir la tarjeta: no cuenta.
    create(false, (events) => events.emitLive('ok', '200 OK CacheHit Redis', '', new Date()));
    const live = TestBed.inject(SystemEventsService);
    live.emitLive('ok', '200 OK CacheHit Redis', '', new Date());
    live.emitLive('ok', '200 OK CacheHit Redis', '', new Date());
    live.emitLive('ok', '200 OK CacheHit Redis', '', new Date());
    live.emitLive('cache', 'CacheMiss → PostgreSQL', '', new Date());
    live.emitLive('ai', 'RAG query', '', new Date());
    // Lo simulado en el navegador no cuenta.
    live.emit('ai', 'RAG query');
    fixture.detectChanges();

    const session = element.querySelector('[data-testid="telemetry-session"]')!.textContent!.replace(/\s+/g, ' ');
    expect(session).toContain('75 %');
    expect(session).toMatch(/RAG\s*1/);
  });
});
