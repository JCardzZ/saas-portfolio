import { TestBed } from '@angular/core/testing';

import { SystemEventsService, techsOf } from './system-events.service';
import { TraceInspectorService } from './trace-inspector.service';

describe('trace inspector', () => {
  it('attributes each event to the technologies it involves', () => {
    expect(techsOf('200 OK CacheHit Redis', 'GET /public/projects · 1 ms')).toEqual(['redis', 'spring', 'angular']);
    expect(techsOf('CacheMiss → PostgreSQL', 'repoblado · TTL 10m')).toEqual(['redis', 'postgresql']);
    expect(techsOf('pgvector CosineDistance: 0.12', 'HNSW · top-5')).toEqual(['postgresql']);
    expect(techsOf('GeminiFlash 120 tokens/sec', 'generateContent')).toEqual(['gemini']);
    expect(techsOf('JWT Verified', 'ROLE_ADMIN · exp 1h')).toEqual(['jwt']);
    expect(techsOf('C4', 'Nivel 3 · Componentes (hexagonal)')).toEqual([]);
  });

  it('shows only the events of the selected technology, as they arrive', () => {
    const events = TestBed.inject(SystemEventsService);
    const inspector = TestBed.inject(TraceInspectorService);
    events.emit('ok', '200 OK CacheHit Redis', 'GET /public/projects · 1 ms');
    events.emit('ai', 'GeminiFlash 120 tokens/sec', 'generateContent');
    events.emit('cache', 'CacheMiss → PostgreSQL', 'repoblado · TTL 10m');

    expect(inspector.events()).toEqual([]);

    inspector.select('redis');
    expect(inspector.events().map((event) => event.tag)).toEqual(['200 OK CacheHit Redis', 'CacheMiss → PostgreSQL']);

    events.emitLive('ok', '200 OK CacheHit Redis', 'portfolio:technologies:all', new Date());
    expect(inspector.events().length).toBe(3);
    expect(inspector.events()[2].origin).toBe('live');

    inspector.select('gemini');
    expect(inspector.events().map((event) => event.tag)).toEqual(['GeminiFlash 120 tokens/sec']);
  });

  it('treats managed services as the technology they host and ignores logos without a trace', () => {
    const inspector = TestBed.inject(TraceInspectorService);

    inspector.select('upstash');
    expect(inspector.selected()).toBe('redis');
    inspector.select('neon');
    expect(inspector.selected()).toBe('postgresql');

    inspector.select('java');
    inspector.select('tailwind');
    inspector.select(undefined);
    expect(inspector.selected()).toBe('postgresql');

    inspector.close();
    expect(inspector.selected()).toBeNull();
  });
});
