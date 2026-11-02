import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { OpenFeature } from '@openfeature/web-sdk';
import { throwError } from 'rxjs';

import { BASE_PATH, FeatureFlagsService } from '../../../core/api';
import { DEMO_FLAGS_STORAGE_KEY, FEATURE_FLAGS, loadFeatureFlags } from '../../../core/flags/feature-flags';
import { FlagService } from '../../../core/flags/flag.service';
import { MOCK_LATENCY_MS, mockApiInterceptor, resetMockApi } from '../../../core/mock/mock-api.interceptor';
import { environment } from '../../../../environments/environment';
import { FeaturesPageComponent } from './features-page.component';

describe('FeaturesPageComponent (demo mode)', () => {
  let fixture: ComponentFixture<FeaturesPageComponent>;

  const switches = () => Array.from(fixture.nativeElement.querySelectorAll('button[role="switch"]')) as HTMLButtonElement[];
  const settle = () => {
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    // La página está detrás del inicio de sesión: aquí entra el cliente de máquina, que es administrador.
    sessionStorage.setItem('portfolio.session', JSON.stringify({ accessToken: 'jwt', expiresAt: Date.now() + 600_000 }));
    localStorage.removeItem(DEMO_FLAGS_STORAGE_KEY);
    resetMockApi();
    await loadFeatureFlags();
    TestBed.configureTestingModule({
      imports: [FeaturesPageComponent],
      providers: [
        provideHttpClient(withInterceptors([mockApiInterceptor])),
        { provide: BASE_PATH, useValue: environment.apiBaseUrl },
      ],
    });
    fixture = TestBed.createComponent(FeaturesPageComponent);
  });

  afterEach(async () => {
    sessionStorage.removeItem('portfolio.session');
    localStorage.removeItem(DEMO_FLAGS_STORAGE_KEY);
    await OpenFeature.clearProviders();
  });

  it('lists every flag turned off and says that demo changes stay in this browser', fakeAsync(() => {
    fixture.detectChanges();
    settle();

    expect(switches().length).toBe(FEATURE_FLAGS.length);
    expect(switches().every((button) => button.getAttribute('aria-checked') === 'false')).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('vale solo en este navegador');
    expect(fixture.nativeElement.textContent).toContain('Nadie ha cambiado una flag todavía.');
  }));

  it('turns a flag on, shows it in the audit trail and applies it to this session', fakeAsync(() => {
    fixture.detectChanges();
    settle();
    const oracle = switches().find((button) => button.getAttribute('aria-label') === 'cloud.oracle')!;

    oracle.click();
    settle();
    settle();

    const updated = switches().find((button) => button.getAttribute('aria-label') === 'cloud.oracle')!;
    expect(updated.getAttribute('aria-checked')).toBe('true');
    expect(updated.textContent).toContain('Encendida');
    expect(fixture.nativeElement.textContent).toContain('Apagada → Encendida');
    expect(fixture.nativeElement.textContent).toContain('demo-admin');
    expect(TestBed.inject(FlagService).isEnabled('cloud.oracle')).toBeTrue();
  }));

  it('lets a role that can only read the flags see them without changing them', fakeAsync(() => {
    sessionStorage.setItem('portfolio.session', JSON.stringify({
      accessToken: 'jwt', expiresAt: Date.now() + 600_000,
      profile: { subject: 'u1', role: 'VIEWER', permissions: ['flags:read'] },
    }));
    // El servicio de sesión ya se creó con la del administrador: se parte de un inyector nuevo.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FeaturesPageComponent],
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), { provide: BASE_PATH, useValue: environment.apiBaseUrl }],
    });
    fixture = TestBed.createComponent(FeaturesPageComponent);
    fixture.detectChanges();
    settle();

    expect(switches().length).toBeGreaterThan(0);
    expect(switches().every((item) => item.disabled)).toBeTrue();
  }));
});

describe('FeaturesPageComponent with admin.redesign on', () => {
  let fixture: ComponentFixture<FeaturesPageComponent>;

  const $ = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  const all = (selector: string) => Array.from(fixture.nativeElement.querySelectorAll(selector)) as HTMLElement[];
  const toggle = (key: string) => $(`button[role="switch"][data-flag="${key}"]`) as HTMLButtonElement;
  const settle = () => {
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    sessionStorage.setItem('portfolio.session', JSON.stringify({ accessToken: 'jwt', expiresAt: Date.now() + 600_000 }));
    localStorage.setItem(DEMO_FLAGS_STORAGE_KEY, JSON.stringify({ 'admin.redesign': true }));
    resetMockApi();
    await loadFeatureFlags();
    TestBed.configureTestingModule({
      imports: [FeaturesPageComponent],
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), { provide: BASE_PATH, useValue: environment.apiBaseUrl }],
    });
    fixture = TestBed.createComponent(FeaturesPageComponent);
  });

  afterEach(async () => {
    sessionStorage.removeItem('portfolio.session');
    localStorage.removeItem(DEMO_FLAGS_STORAGE_KEY);
    await OpenFeature.clearProviders();
  });

  it('groups the flags by area, names each by what it does and counts the ones on', fakeAsync(() => {
    fixture.detectChanges();
    settle();

    expect(all('[data-testid="flag-group"] h2').map((title) => title.textContent!.trim()))
      .toEqual(['Sitio público', 'Estudio de arquitectura', 'Nubes', 'MCP', 'Administración']);
    expect(all('button[role="switch"]').length).toBe(FEATURE_FLAGS.length);
    expect($('[data-testid="flag-summary"]')!.textContent!.replace(/\s+/g, ' ')).toContain('1 de 9 encendidas');
    const studio = toggle('studio.smart-rules');
    expect(fixture.nativeElement.querySelector(`#${studio.getAttribute('aria-labelledby')!.replace('.', '\\.')}`).textContent)
      .toContain('Lienzo responsivo');
    expect(fixture.nativeElement.textContent).toContain('En producción cada cambio se guarda en la base de datos');
  }));

  it('turns a switch on at once, confirms where it was saved and records it in the audit', fakeAsync(() => {
    fixture.detectChanges();
    settle();

    toggle('site.adr').click();
    fixture.detectChanges();
    // Optimista: el interruptor ya está encendido mientras se guarda.
    expect(toggle('site.adr').getAttribute('aria-checked')).toBe('true');
    expect(toggle('site.adr').getAttribute('aria-busy')).toBe('true');

    settle();
    settle();
    expect(toggle('site.adr').getAttribute('aria-checked')).toBe('true');
    expect($('[data-testid="flag-toast"]')!.textContent).toContain('site.adr encendida');
    expect($('[data-testid="flag-toast"]')!.textContent).toContain('guardado en este navegador');
    expect(fixture.nativeElement.textContent).toContain('Apagada → Encendida');
    expect(TestBed.inject(FlagService).isEnabled('site.adr')).toBeTrue();

    tick(3000);
    fixture.detectChanges();
    expect($('[data-testid="flag-toast"]')!.textContent!.trim()).toBe('');
  }));

  it('puts the switch back and explains why when the server does not save it', fakeAsync(() => {
    fixture.detectChanges();
    settle();
    spyOn(TestBed.inject(FeatureFlagsService), 'adminFeaturesKeyPut').and.returnValue(throwError(() => new Error('sin conexión')) as never);

    toggle('cloud.oracle').click();
    fixture.detectChanges();

    expect(toggle('cloud.oracle').getAttribute('aria-checked')).toBe('false');
    expect($('app-alert')!.textContent).toContain('Inténtalo de nuevo');
  }));

  it('finds a flag by its key or by what it does, and filters by state', fakeAsync(() => {
    fixture.detectChanges();
    settle();
    const search = $('#flag-search') as HTMLInputElement;

    search.value = 'portada';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(all('button[role="switch"]').map((item) => item.dataset['flag'])).toEqual(['site.refresh', 'site.adr']);

    search.value = 'nada-parecido';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ninguna flag coincide con la búsqueda.');

    search.value = '';
    search.dispatchEvent(new Event('input'));
    all('[aria-label="Mostrar"] button').find((button) => button.textContent!.trim() === 'Encendidas')!.click();
    fixture.detectChanges();
    expect(all('button[role="switch"]').map((item) => item.dataset['flag'])).toEqual(['admin.redesign']);
  }));
});
