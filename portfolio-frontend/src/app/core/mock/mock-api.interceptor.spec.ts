import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AIQueryResponse, Project, Technology, TokenResponse } from '../api';
import { MOCK_LATENCY_MS, mockApiInterceptor, resetMockApi } from './mock-api.interceptor';

describe('mockApiInterceptor (demo mode)', () => {
  const api = environment.apiBaseUrl;
  let http: HttpClient;
  let network: HttpTestingController;

  beforeEach(() => {
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    network = TestBed.inject(HttpTestingController);
  });

  // Ninguna petición a la API debe llegar a la red.
  afterEach(() => network.verify());

  it('serves the public catalog after the simulated latency', fakeAsync(() => {
    let projects: Project[] | undefined;
    let technologies: Technology[] | undefined;
    http.get<Project[]>(`${api}/public/projects`).subscribe((body) => (projects = body));
    http.get<Technology[]>(`${api}/public/technologies`).subscribe((body) => (technologies = body));

    tick(MOCK_LATENCY_MS - 1);
    expect(projects).toBeUndefined();
    tick(1);

    expect(projects?.length).toBe(3);
    expect(new Set(technologies?.map((technology) => technology.category))).toEqual(
      new Set(['Backend', 'Frontend', 'AI/ML', 'Cloud']),
    );
  }));

  it('answers RAG questions with citations and can simulate the rate limit', fakeAsync(() => {
    let answer: AIQueryResponse | undefined;
    let error: HttpErrorResponse | undefined;
    http.post<AIQueryResponse>(`${api}/ai/rag/query`, { prompt: '¿Qué arquitectura usa?' }).subscribe((body) => (answer = body));
    http.post(`${api}/ai/rag/query`, { prompt: 'prueba 429' }).subscribe({ error: (e) => (error = e) });
    tick(MOCK_LATENCY_MS);

    expect(answer?.answer).toContain('arquitectura hexagonal');
    expect(answer?.citations?.map((citation) => citation.filePath)).toContain('CLAUDE.md');
    expect(error?.status).toBe(429);
    expect(error?.headers.get('Retry-After')).toBe('42');
  }));

  it('issues a fake token and keeps admin changes in memory', fakeAsync(() => {
    let token: TokenResponse | undefined;
    http.post<TokenResponse>(`${api}/auth/token`, { clientId: 'x', clientSecret: 'y', grantType: 'client_credentials' })
      .subscribe((body) => (token = body));
    http.post(`${api}/admin/technologies`, { name: 'Kotlin', category: 'Backend', proficiencyLevel: 'Medio', iconUrl: '' })
      .subscribe();
    tick(MOCK_LATENCY_MS);
    expect(token?.accessToken).toBeTruthy();

    let technologies: Technology[] = [];
    http.get<Technology[]>(`${api}/public/technologies`).subscribe((body) => (technologies = body));
    tick(MOCK_LATENCY_MS);
    expect(technologies.map((technology) => technology.name)).toContain('Kotlin');
  }));

  it('lets requests to other hosts through', () => {
    http.get('https://example.com/data').subscribe();

    network.expectOne('https://example.com/data').flush({});
  });
});
