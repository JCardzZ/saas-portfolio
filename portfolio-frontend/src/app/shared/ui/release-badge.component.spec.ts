import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OpenFeature } from '@openfeature/web-sdk';

import { RuntimeConfig, resetRuntimeConfig, runtimeConfig } from '../../core/config/runtime-config';
import { PlatformFlagsProvider } from '../../core/flags/feature-flags';
import { LanguageService } from '../../core/i18n/language.service';
import { RELEASE_INFO_URL, parseReleaseInfo } from '../../core/release/release';
import { ReleaseBadgeComponent, relativeTime } from './release-badge.component';

const SHA = '548cae9b3ccfd115f5df8ab1fc51d757435d0aac';
const FILE = {
  schema: 1, version: 'v0.2.0', previous: 'v0.1.0', sha: SHA, repository: 'JCardzZ/saas-portfolio',
  deployedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  notes: [
    { type: 'feat', scope: 'frontend', text: 'Turn the assistant into a live chat' },
    { type: 'fix', scope: null, text: 'Keep the caret visible while streaming' },
  ],
};

describe('parseReleaseInfo', () => {
  it('accepts the file the CD writes', () => {
    const release = parseReleaseInfo(FILE)!;
    expect(release.version).toBe('v0.2.0');
    expect(release.deployedAt instanceof Date).toBeTrue();
    expect(release.notes.length).toBe(2);
  });

  it('rejects anything else, and drops unknown notes', () => {
    expect(parseReleaseInfo('<!doctype html>')).toBeNull();
    expect(parseReleaseInfo({ ...FILE, schema: 2 })).toBeNull();
    expect(parseReleaseInfo({ ...FILE, version: '0.2.0' })).toBeNull();
    expect(parseReleaseInfo({ ...FILE, sha: 'abc' })).toBeNull();
    expect(parseReleaseInfo({ ...FILE, repository: 'javascript:alert(1)' })).toBeNull();
    expect(parseReleaseInfo({ ...FILE, deployedAt: 'ayer' })).toBeNull();
    expect(parseReleaseInfo({ ...FILE, notes: [{ type: 'chore', text: 'x' }, { type: 'feat', text: ' ' }] })!.notes).toEqual([]);
  });
});

describe('relativeTime', () => {
  it('speaks the language of the site', () => {
    const es = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
    expect(relativeTime(-2 * 3_600_000, 'es')).toBe(es.format(-2, 'hour'));
    expect(relativeTime(-5 * 60_000, 'es')).toBe(es.format(-5, 'minute'));
    expect(relativeTime(-3 * 86_400_000, 'en')).toBe(new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-3, 'day'));
  });
});

describe('ReleaseBadgeComponent (site.release-version)', () => {
  let fixture: ComponentFixture<ReleaseBadgeComponent>;
  let backend: HttpTestingController;
  let element: HTMLElement;

  async function setUp(enabled: boolean, mockMode = false): Promise<void> {
    // Con backend salvo que se pida: en modo demo la línea dice «Modo demo» y no llama a /telemetry/health.
    Object.assign(runtimeConfig as RuntimeConfig, { mockMode });
    await OpenFeature.setProviderAndWait(new PlatformFlagsProvider(() => Promise.resolve({ 'site.release-version': enabled })));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReleaseBadgeComponent);
    element = fixture.nativeElement;
    document.body.appendChild(element);
    fixture.detectChanges();
  }

  afterEach(async () => {
    backend.verify();
    element?.remove();
    await OpenFeature.clearProviders();
    resetRuntimeConfig();
  });

  const $ = <T extends HTMLElement>(selector: string) => element.querySelector<T>(selector);
  const health = () => backend.expectOne((request) => request.url.endsWith('/telemetry/health'));

  function deployed(file: object = FILE, api: object = { status: 'UP', version: 'v0.2.0' }): void {
    backend.expectOne(RELEASE_INFO_URL).flush(file);
    health().flush(api);
    fixture.detectChanges();
  }

  function openNotes(): void {
    $<HTMLButtonElement>('[data-testid="release-badge"]')!.click();
    fixture.detectChanges();
  }

  it('shows nothing and asks for nothing with the flag off', async () => {
    await setUp(false);
    backend.expectNone(RELEASE_INFO_URL);
    backend.expectNone((request) => request.url.endsWith('/telemetry/health'));
    expect($('[data-testid="release-badge"]')).toBeNull();
  });

  it('is a status line: the API state, the deployed version and how long ago', async () => {
    await setUp(true);
    deployed();

    const badge = $('[data-testid="release-badge"]')!;
    expect($('[data-testid="release-status"]')!.textContent).toContain('Operativo');
    expect(badge.textContent).toContain('v0.2.0');
    const lang = TestBed.inject(LanguageService).lang();
    expect(badge.textContent).toContain(new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-2, 'hour'));
    expect(badge.querySelector('.bg-status-ok')).not.toBeNull();
    expect(badge.getAttribute('aria-expanded')).toBe('false');
  });

  it('turns amber when the API is degraded and red when it does not answer', async () => {
    await setUp(true);
    deployed(FILE, { status: 'DEGRADED', version: 'v0.2.0' });
    expect($('[data-testid="release-status"]')!.textContent).toContain('Degradado');
    expect($('[data-testid="release-badge"]')!.querySelector('.bg-status-warn')).not.toBeNull();
  });

  it('opens the notes: what changed, links to GitHub and an API on the same version', async () => {
    await setUp(true);
    deployed();
    openNotes();

    const notes = $('[data-testid="release-notes"]')!;
    expect($('[data-testid="release-badge"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(notes.getAttribute('role')).toBe('dialog');
    expect(notes.textContent).toContain('Turn the assistant into a live chat');
    expect(notes.textContent).toContain('Nuevo');
    expect(notes.textContent).toContain('Corrección');
    expect($<HTMLAnchorElement>('[data-testid="release-link-notes"]')!.href)
      .toBe('https://github.com/JCardzZ/saas-portfolio/releases/tag/v0.2.0');
    expect(notes.querySelector<HTMLAnchorElement>('a[href*="/compare/v0.1.0...v0.2.0"]')).not.toBeNull();
    expect($('[data-testid="release-skew"]')!.textContent).toContain('misma versión');
  });

  it('warns when the API runs another version', async () => {
    await setUp(true);
    deployed(FILE, { status: 'UP', version: 'v0.1.0' });
    openNotes();
    expect($('[data-testid="release-skew"]')!.textContent).toContain('v0.1.0');
    expect($('[data-testid="release-skew"]')!.textContent).toContain('se despliega aparte');
  });

  it('says so when the API is down', async () => {
    await setUp(true);
    backend.expectOne(RELEASE_INFO_URL).flush(FILE);
    health().flush({ status: 503 }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect($('[data-testid="release-status"]')!.textContent).toContain('Sin conexión con la API');
    openNotes();
    expect($('[data-testid="release-skew"]')!.textContent).toContain('sin respuesta');
  });

  it('closes with Escape returning the focus, and with a click outside', async () => {
    await setUp(true);
    deployed();
    openNotes();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect($('[data-testid="release-notes"]')).toBeNull();
    expect(document.activeElement).toBe($('[data-testid="release-badge"]'));

    openNotes();
    document.body.click();
    fixture.detectChanges();
    expect($('[data-testid="release-notes"]')).toBeNull();
  });

  it('says it is the demo, without asking the API, when there is no backend', async () => {
    await setUp(true, true);
    backend.expectOne(RELEASE_INFO_URL).flush(FILE);
    fixture.detectChanges();
    expect($('[data-testid="release-status"]')!.textContent).toContain('Modo demo');
  });

  it('marks a build that was never deployed as local', async () => {
    await setUp(true);
    backend.expectOne(RELEASE_INFO_URL).flush('Not found', { status: 404, statusText: 'Not Found' });
    health().flush({ status: 'UP' });
    fixture.detectChanges();
    expect($('[data-testid="release-badge"]')!.textContent).toContain('dev');
    expect($('[data-testid="release-badge"]')!.textContent).toContain('build local');
  });
});
