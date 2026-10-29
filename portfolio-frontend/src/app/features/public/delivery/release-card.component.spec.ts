import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OpenFeature } from '@openfeature/web-sdk';

import { RuntimeConfig, resetRuntimeConfig, runtimeConfig } from '../../../core/config/runtime-config';
import { PlatformFlagsProvider } from '../../../core/flags/feature-flags';
import { RELEASE_INFO_URL } from '../../../core/release/release';
import { ReleaseCardComponent } from './release-card.component';

const FILE = {
  schema: 1, version: 'v0.3.0', previous: 'v0.2.1', sha: '12026cf2dc6ac16537fea8869531067bc55da104',
  repository: 'JCardzZ/saas-portfolio', deployedAt: new Date(Date.now() - 26 * 60_000).toISOString(),
  notes: [{ type: 'feat', scope: 'frontend', text: 'Show the release in the delivery section' }],
};

/** La release en producción al principio de «Despliegues» (flag `site.release-version`). */
describe('ReleaseCardComponent', () => {
  let fixture: ComponentFixture<ReleaseCardComponent>;
  let backend: HttpTestingController;

  async function setUp(enabled: boolean): Promise<void> {
    // Con backend: en modo demo la línea dice «Modo demo» y no llama a /telemetry/health.
    Object.assign(runtimeConfig as RuntimeConfig, { mockMode: false });
    await OpenFeature.setProviderAndWait(new PlatformFlagsProvider(() => Promise.resolve({ 'site.release-version': enabled })));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReleaseCardComponent);
    fixture.detectChanges();
  }

  afterEach(async () => {
    backend.verify();
    await OpenFeature.clearProviders();
    resetRuntimeConfig();
  });

  const $ = (selector: string) => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);

  it('shows the version in production, its state, what changed and the links', async () => {
    await setUp(true);
    backend.expectOne(RELEASE_INFO_URL).flush(FILE);
    backend.expectOne((request) => request.url.endsWith('/telemetry/health')).flush({ status: 'UP', version: 'v0.3.0' });
    fixture.detectChanges();

    expect($('[data-testid="release-card-version"]')!.textContent).toContain('v0.3.0');
    const card = $('[data-testid="release-card"]')!;
    expect(card.textContent).toContain('Operativo');
    expect(card.textContent).toContain('Show the release in the delivery section');
    expect(card.textContent).toContain('misma versión');
    expect(card.querySelector<HTMLAnchorElement>('a[href*="/compare/v0.2.1...v0.3.0"]')).not.toBeNull();
  });

  it('renders nothing with the flag off', async () => {
    await setUp(false);
    backend.expectNone(RELEASE_INFO_URL);
    expect($('[data-testid="release-card"]')).toBeNull();
  });
});
