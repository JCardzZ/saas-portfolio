import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RuntimeConfig, resetRuntimeConfig, runtimeConfig } from '../../../core/config/runtime-config';
import { RELEASE_INFO_URL } from '../../../core/release/release';
import { HeroProofComponent } from './hero-proof.component';

/** La prueba en vivo del hero (flag `site.refresh`): estado real, latencia y versión desplegada. */
describe('HeroProofComponent', () => {
  afterEach(() => resetRuntimeConfig());

  it('shows the live state, the latency and the deployed version, linking to how it is built', () => {
    Object.assign(runtimeConfig as RuntimeConfig, { mockMode: false });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const backend = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(HeroProofComponent);
    fixture.detectChanges();

    backend.expectOne(RELEASE_INFO_URL).flush({
      schema: 1, version: 'v1.0.0', previous: 'v0.3.0', sha: '62c9d56'.padEnd(40, '0'), repository: 'JCardzZ/saas-portfolio',
      deployedAt: new Date().toISOString(), notes: [],
    });
    backend.expectOne((request) => request.url.endsWith('/telemetry/health')).flush({ status: 'UP', version: 'v1.0.0' });
    fixture.detectChanges();

    const proof = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('[data-testid="hero-proof"]')!;
    expect(proof.getAttribute('href')).toBe('#entrega');
    expect(proof.textContent).toContain('En producción · operativa');
    expect(proof.textContent).toMatch(/\d+ ms/);
    expect(proof.textContent).toContain('v1.0.0');
    backend.verify();
  });
});
