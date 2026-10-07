import { TestBed } from '@angular/core/testing';

import { SystemEventsService } from './system-events.service';
import {
  EVENT_SOURCE_FACTORY,
  TELEMETRY_STREAM_CONFIG,
  TelemetryStreamConfig,
  TelemetryStreamService,
} from './telemetry-stream.service';

/** Doble de EventSource: los tests disparan a mano lo que haría el navegador. */
class FakeEventSource {
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
}

describe('TelemetryStreamService', () => {
  let created: FakeEventSource[];

  function setup(config: Partial<TelemetryStreamConfig> = {}) {
    created = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TELEMETRY_STREAM_CONFIG,
          useValue: { enabled: true, url: 'http://api.test/v1/telemetry/live-stream', maxFailures: 3, ...config },
        },
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: (url: string) => {
            const source = new FakeEventSource(url);
            created.push(source);
            return source as unknown as EventSource;
          },
        },
      ],
    });
    return { service: TestBed.inject(TelemetryStreamService), events: TestBed.inject(SystemEventsService) };
  }

  it('never opens a connection in demo mode', () => {
    const { service } = setup({ enabled: false });

    service.connect();

    expect(created.length).toBe(0);
    expect(service.status()).toBe('simulated');
  });

  it('goes live on open and injects each server event with its colour code', () => {
    const { service, events } = setup();

    service.connect();
    expect(created[0].url).toBe('http://api.test/v1/telemetry/live-stream');
    expect(service.status()).toBe('connecting');

    created[0].onopen!();
    expect(service.status()).toBe('live');
    expect(events.live()).toBeTrue();

    created[0].onmessage!({
      data: JSON.stringify({
        timestamp: '2026-10-05T10:00:00Z', eventType: 'CACHE_HIT', details: 'portfolio:projects:all', traceId: 't1',
      }),
    });
    created[0].onmessage!({
      data: JSON.stringify({ timestamp: '2026-10-05T10:00:01Z', eventType: 'VECTOR_SEARCH', details: '5 fragmentos · 12 ms', traceId: 't2' }),
    });

    expect(events.events().map((event) => [event.origin, event.kind, event.tag, event.detail])).toEqual([
      ['live', 'ok', '200 OK CacheHit Redis', 'portfolio:projects:all'],
      ['live', 'vector', 'pgvector CosineDistance', '5 fragmentos · 12 ms'],
    ]);
  });

  it('shows unknown event types generically and ignores malformed payloads', () => {
    const { service, events } = setup();
    service.connect();
    created[0].onopen!();

    created[0].onmessage!({ data: '{not json' });
    created[0].onmessage!({ data: JSON.stringify({ details: 'sin tipo' }) });
    created[0].onmessage!({ data: JSON.stringify({ timestamp: 'x', eventType: 'RATE_LIMITED', details: 'nuevo', traceId: 't' }) });

    expect(events.events().map((event) => [event.kind, event.tag])).toEqual([['info', 'RATE_LIMITED']]);
  });

  it('keeps retrying through a transient drop and recovers', () => {
    const { service, events } = setup();
    service.connect();
    created[0].onopen!();

    created[0].readyState = 0; // el navegador está reconectando
    created[0].onerror!();
    expect(service.status()).toBe('connecting');
    expect(events.live()).toBeFalse();
    expect(created[0].closed).toBeFalse();

    created[0].onopen!();
    expect(service.status()).toBe('live');
  });

  it('falls back to simulation when the stream cannot be reached', () => {
    const { service, events } = setup();
    service.connect();

    created[0].onerror!();
    created[0].onerror!();
    expect(service.status()).toBe('connecting');
    created[0].onerror!();

    expect(service.status()).toBe('simulated');
    expect(events.live()).toBeFalse();
    expect(created[0].closed).toBeTrue();
  });

  it('falls back at once when the browser gives up on the connection', () => {
    const { service } = setup();
    service.connect();

    created[0].readyState = 2;
    created[0].onerror!();

    expect(service.status()).toBe('simulated');
  });

  it('closes the connection on disconnect and can connect again', () => {
    const { service } = setup();
    service.connect();
    service.connect();
    expect(created.length).toBe(1);

    service.disconnect();
    expect(created[0].closed).toBeTrue();

    service.connect();
    expect(created.length).toBe(2);
  });
});
