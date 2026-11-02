import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';

import { BASE_PATH, TelemetryObservabilityService } from '../../../core/api';
import { MOCK_LATENCY_MS, mockApiInterceptor, resetMockApi } from '../../../core/mock/mock-api.interceptor';
import { environment } from '../../../../environments/environment';
import { AdminDashboardComponent, levelOf } from './admin-dashboard.component';

function storeSession(role: string, permissions: string[]): void {
  sessionStorage.setItem('portfolio.session', JSON.stringify({
    accessToken: 'jwt', expiresAt: Date.now() + 600_000,
    profile: { subject: 'u-1', email: 'ana@example.com', displayName: 'Ana Ruiz', role, permissions },
  }));
}

describe('AdminDashboardComponent', () => {
  let fixture: ComponentFixture<AdminDashboardComponent>;
  const $ = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  const all = (selector: string) => Array.from(fixture.nativeElement.querySelectorAll(selector)) as HTMLElement[];

  beforeEach(() => {
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([mockApiInterceptor])), { provide: BASE_PATH, useValue: environment.apiBaseUrl }],
    });
  });

  afterEach(() => sessionStorage.clear());

  function open(): void {
    fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
  }

  it('greets whoever signed in and fills every panel with what the API returns', fakeAsync(() => {
    storeSession('ADMIN', ['cms:read', 'flags:read', 'users:manage', 'ai:reindex']);
    open();
    // Mientras llegan los datos, esqueletos.
    expect(all('.dash-skeleton, .dash-skeleton-list').length).toBeGreaterThan(0);

    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();

    expect($('.dash-title')!.textContent).toContain('Ana');
    expect(all('[data-kpi]').map((kpi) => kpi.dataset['kpi'])).toEqual(['projects', 'technologies', 'articles', 'users']);
    expect(all('.dash-kpi-value').every((value) => /^\d+$/.test(value.textContent!.trim()))).toBeTrue();
    expect($('[data-testid="dash-status"]')!.textContent).toContain('Operativo');
    expect(all('.dash-health li').length).toBe(4);
    expect($('.dash-ring-num')!.textContent).toMatch(/\d+\/\d+/);
    expect(all('.dash-bars li').length).toBeGreaterThan(0);
    expect(all('.dash-list li').length).toBeGreaterThan(0);
    expect(all('.dash-action').map((action) => action.textContent!.trim())).toContain('Invitar a alguien');
  }));

  it('only asks for what the role may read, and shows only those panels', fakeAsync(() => {
    storeSession('VIEWER', ['cms:read']);
    open();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();

    expect(all('[data-kpi]').map((kpi) => kpi.dataset['kpi'])).toEqual(['projects', 'technologies', 'articles']);
    expect($('#dash-flags')).toBeNull();
    expect($('#dash-activity')).toBeNull();
    // Solo lee: no se le ofrece crear nada.
    expect(all('.dash-action').length).toBe(0);
  }));

  it('says when a panel could not load and retries it on its own', fakeAsync(() => {
    storeSession('ADMIN', ['cms:read']);
    const health = TestBed.inject(TelemetryObservabilityService);
    const real = health.telemetryHealthGet.bind(health);
    const spy = spyOn(health, 'telemetryHealthGet').and.returnValue(throwError(() => new Error('caído')) as never);
    open();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();

    const retry = all('.dash-retry')[0];
    expect(retry).toBeDefined();
    spy.and.callFake(real as never);
    retry.click();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    expect(all('.dash-health li').length).toBe(4);
  }));

  it('reads the health the backend reports: connected, degraded, down or simulated', () => {
    expect(levelOf('PostgreSQL 16 - Connected')).toBe('up');
    expect(levelOf('Redis - Healthy')).toBe('up');
    expect(levelOf('CLOSED')).toBe('up');
    expect(levelOf('DEGRADED')).toBe('warn');
    expect(levelOf('HALF_OPEN')).toBe('warn');
    expect(levelOf('Redis - Unavailable')).toBe('down');
    expect(levelOf('OPEN')).toBe('down');
    expect(levelOf('Demo - Simulada')).toBe('demo');
  });
});
