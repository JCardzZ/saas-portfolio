import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { resetRuntimeConfig, runtimeConfig } from '../config/runtime-config';
import { lazyMockApiInterceptor } from './mock-api.loader';

describe('lazyMockApiInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([lazyMockApiInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    resetRuntimeConfig();
  });

  it('lets requests reach the network when demo mode is off', () => {
    Object.assign(runtimeConfig, { mockMode: false, demoReason: null });

    http.get(`${runtimeConfig.apiBaseUrl}/public/technologies`).subscribe();

    backend.expectOne(`${runtimeConfig.apiBaseUrl}/public/technologies`).flush([]);
  });

  it('answers with simulated data once demo mode is switched on after start-up', async () => {
    Object.assign(runtimeConfig, { mockMode: true, demoReason: 'backend-unavailable' });

    const technologies = await firstValueFrom(http.get<unknown[]>(`${runtimeConfig.apiBaseUrl}/public/technologies`));

    expect(technologies.length).toBeGreaterThan(0);
    backend.expectNone(`${runtimeConfig.apiBaseUrl}/public/technologies`);
  });
});
