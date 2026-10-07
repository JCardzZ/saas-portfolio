import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { provideApi } from '../../../../core/api';
import { SystemEventsService } from '../../data/system-events.service';
import { MAX_PROMPT_LENGTH, RagChatStore } from './rag-chat.store';

describe('RagChatStore', () => {
  const url = `${environment.apiBaseUrl}/ai/rag/query`;
  let store: RagChatStore;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi(environment.apiBaseUrl), RagChatStore],
    });
    store = TestBed.inject(RagChatStore);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('adds the question, then the answer with its citations', () => {
    store.ask('  ¿Qué caché usa?  ');

    expect(store.pending()).toBeTrue();
    expect(store.messages().map((message) => [message.role, message.text])).toEqual([['user', '¿Qué caché usa?']]);

    const request = backend.expectOne(url);
    expect(request.request.body).toEqual({ prompt: '¿Qué caché usa?' });
    request.flush({
      answer: 'Redis con cache-aside.',
      citations: [{ filePath: 'RedisCacheAdapter.java', lineNumberRange: '20-45', codeSnippet: 'class X {}' }],
    });

    expect(store.pending()).toBeFalse();
    const answer = store.messages()[1];
    expect(answer.role).toBe('assistant');
    expect(answer.text).toBe('Redis con cache-aside.');
    expect(answer.failed).toBeFalse();
    expect(answer.citations[0].filePath).toBe('RedisCacheAdapter.java');
  });

  it('injects the steps of each question into the system event stream', () => {
    const events = TestBed.inject(SystemEventsService);

    store.ask('¿Qué caché usa?');
    expect(events.events().map((event) => event.tag)).toEqual(['POST /ai/rag/query', 'RateLimit check', 'Gemini embedQuery']);

    backend.expectOne(url).flush({ answer: 'ok', citations: [{ filePath: 'A.java' }] });
    const tags = events.events().map((event) => event.tag);
    expect(tags.slice(3)).toEqual(['pgvector CosineDistance', 'Gemini generateContent', '200 OK']);
    expect(events.events().every((event) => event.fromUser && event.origin === 'simulated')).toBeTrue();
  });

  it('does not simulate backend steps while the real telemetry stream is connected', () => {
    const events = TestBed.inject(SystemEventsService);
    events.live.set(true);

    store.ask('¿Qué caché usa?');
    backend.expectOne(url).flush({ answer: 'ok', citations: [] });

    expect(events.events()).toEqual([]);
  });

  it('raises a dismissible alert with the wait time when rate limited, instead of a chat message', () => {
    store.ask('hola');
    backend.expectOne(url).flush(
      { code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '7200' } },
    );

    expect(store.alert()?.title).toBe('Límite de preguntas alcanzado');
    expect(store.alert()?.message).toContain('2 horas');
    expect(store.messages().length).toBe(1);
    expect(store.pending()).toBeFalse();

    store.dismissAlert();
    expect(store.alert()).toBeNull();
  });

  it('shows the API detail as a failed message when the AI engine is unavailable', () => {
    store.ask('hola');
    backend
      .expectOne(url)
      .flush({ detail: 'El motor de IA no está disponible' }, { status: 503, statusText: 'Service Unavailable' });

    expect(store.messages()[1].text).toBe('El motor de IA no está disponible');
    expect(store.messages()[1].failed).toBeTrue();
    expect(store.alert()).toBeNull();
  });

  it('ignores blank or oversized questions and a second question while one is pending', () => {
    store.ask('   ');
    store.ask('a'.repeat(MAX_PROMPT_LENGTH + 1));
    expect(store.messages().length).toBe(0);

    store.ask('primera');
    store.ask('segunda');

    expect(store.messages().length).toBe(1);
    backend.expectOne(url).flush({ answer: 'ok' });
  });
});
