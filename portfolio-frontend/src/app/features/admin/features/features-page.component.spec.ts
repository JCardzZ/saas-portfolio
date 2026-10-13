import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { OpenFeature } from '@openfeature/web-sdk';

import { BASE_PATH } from '../../../core/api';
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
