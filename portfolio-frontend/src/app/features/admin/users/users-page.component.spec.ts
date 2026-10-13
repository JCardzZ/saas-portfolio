import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { provideApi } from '../../../core/api';
import { MOCK_LATENCY_MS, mockApiInterceptor, resetMockApi } from '../../../core/mock/mock-api.interceptor';
import { AuthService } from '../../../core/auth/auth.service';
import { AdminHomeComponent } from '../home/admin-home.component';
import { AdminLayoutComponent } from '../layout/admin-layout.component';
import { UsersPageComponent } from './users-page.component';

function storeSession(role: string, permissions: string[], subject = 'u-1'): void {
  sessionStorage.setItem('portfolio.session', JSON.stringify({
    accessToken: 'jwt', expiresAt: Date.now() + 600_000, refreshToken: 'refresh', refreshExpiresAt: Date.now() + 6_000_000,
    profile: { subject, email: 'ana@example.com', displayName: 'Ana', role, permissions },
  }));
}

describe('users administration', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([mockApiInterceptor])), provideApi(environment.apiBaseUrl)],
    });
  });

  afterEach(() => sessionStorage.clear());

  function open(): { fixture: ComponentFixture<UsersPageComponent>; element: HTMLElement } {
    const fixture = TestBed.createComponent(UsersPageComponent);
    fixture.detectChanges();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement };
  }

  function fill(element: HTMLElement, id: string, value: string): void {
    const input = element.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
  }

  const rows = (element: HTMLElement) => Array.from(element.querySelectorAll('tr[data-user]')).map((row) => row.getAttribute('data-user'));
  const button = (scope: Element, text: string) =>
    Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => candidate.textContent!.trim() === text)!;

  it('lists the accounts and what each role may do', fakeAsync(() => {
    const { element } = open();

    expect(rows(element)).toEqual(['demo@example.com']);
    const matrix = element.querySelector('[data-testid="roles-matrix"]')!.textContent!;
    expect(matrix).toContain('VIEWER');
    expect(matrix).toContain('users:manage');
  }));

  it('creates an account with a role and never shows the password back', fakeAsync(() => {
    const { fixture, element } = open();

    fill(element, 'new-email', 'Nueva@Example.com');
    fill(element, 'new-name', 'Nueva');
    fill(element, 'new-password', 'una-clave-larga-1');
    fill(element, 'new-role', 'EDITOR');
    button(element, 'Crear cuenta').click();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();

    expect(rows(element)).toEqual(['demo@example.com', 'nueva@example.com']);
    expect(element.querySelector('[data-testid="users-notice"]')!.textContent).toContain('Cuenta creada para nueva@example.com');
    expect(element.querySelector<HTMLSelectElement>('tr[data-user="nueva@example.com"] select')!.value).toBe('EDITOR');
    expect(element.textContent).not.toContain('una-clave-larga-1');
    expect(element.querySelector<HTMLInputElement>('#new-password')!.value).toBe('');
  }));

  it('does not send a short password or an invalid e-mail', fakeAsync(() => {
    const { fixture, element } = open();

    fill(element, 'new-email', 'no-es-un-correo');
    fill(element, 'new-name', 'Alguien');
    fill(element, 'new-password', 'corta');
    button(element, 'Crear cuenta').click();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();

    expect(rows(element)).toEqual(['demo@example.com']);
    expect(element.textContent).toContain('Escribe un correo válido.');
    expect(element.textContent).toContain('Entre 12 y 72 caracteres.');
  }));

  it('changes the role, deactivates and sets a new password of another account', fakeAsync(() => {
    const { fixture, element } = open();
    fill(element, 'new-email', 'otra@example.com');
    fill(element, 'new-name', 'Otra');
    fill(element, 'new-password', 'una-clave-larga-1');
    button(element, 'Crear cuenta').click();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    const row = () => element.querySelector('tr[data-user="otra@example.com"]')!;

    const role = row().querySelector<HTMLSelectElement>('select')!;
    role.value = 'ADMIN';
    role.dispatchEvent(new Event('change'));
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="users-notice"]')!.textContent).toContain('otra@example.com pasa a ADMIN');

    button(row(), 'Desactivar').click();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    expect(row().textContent).toContain('Desactivada');
    expect(button(row(), 'Activar')).toBeDefined();

    button(row(), 'Cambiar contraseña').click();
    fixture.detectChanges();
    const password = row().querySelector<HTMLInputElement>('input[type="password"]')!;
    password.value = 'corta';
    password.dispatchEvent(new Event('input'));
    button(row(), 'Guardar').click();
    fixture.detectChanges();
    expect(row().textContent).toContain('Entre 12 y 72 caracteres.');
    password.value = 'otra-clave-muy-larga';
    password.dispatchEvent(new Event('input'));
    button(row(), 'Guardar').click();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="users-notice"]')!.textContent).toContain('Contraseña de otra@example.com cambiada');
    expect(row().querySelector('input[type="password"]')).toBeNull();
  }));

  it('does not let you change your own role or deactivate yourself', fakeAsync(() => {
    storeSession('ADMIN', ['users:manage'], 'demo-admin');
    const { element } = open();
    const own = element.querySelector('tr[data-user="demo@example.com"]')!;

    expect(own.textContent).toContain('(tú)');
    expect(own.querySelector<HTMLSelectElement>('select')!.disabled).toBeTrue();
    expect(button(own, 'Desactivar').disabled).toBeTrue();
  }));
});

describe('admin panel by role', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideApi(environment.apiBaseUrl)],
    });
  });

  afterEach(() => sessionStorage.clear());

  const links = (element: HTMLElement) => Array.from(element.querySelectorAll('nav a')).map((link) => link.textContent!.trim());

  it('shows a viewer only what a viewer may open, with their name and role', () => {
    storeSession('VIEWER', ['cms:read', 'flags:read', 'analytics:read']);
    const fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    expect(links(element)).toEqual(['Tecnologías', 'Proyectos', 'Artículos', 'Flags']);
    expect(element.querySelector('[data-testid="session-who"]')!.textContent).toContain('Ana');
    expect(element.querySelector('[data-testid="session-who"]')!.textContent).toContain('VIEWER');
  });

  it('shows an administrator and the machine client every section', () => {
    storeSession('ADMIN', ['cms:read', 'cms:write', 'ai:reindex', 'profile:write', 'flags:read', 'flags:write', 'users:manage']);
    const admin = TestBed.createComponent(AdminLayoutComponent);
    admin.detectChanges();
    expect(links(admin.nativeElement)).toEqual(['Tecnologías', 'Proyectos', 'Artículos', 'Asistente IA', 'Flags', 'Usuarios']);
  });

  it('treats a machine-client session as an administrator', () => {
    sessionStorage.setItem('portfolio.session', JSON.stringify({ accessToken: 'jwt', expiresAt: Date.now() + 600_000 }));
    expect(TestBed.inject(AuthService).can('users:manage')).toBeTrue();
    const fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
    expect(links(fixture.nativeElement)).toContain('Usuarios');
  });

  it('lists on the home page the sections and the permissions of whoever signed in', () => {
    storeSession('EDITOR', ['cms:read', 'cms:write', 'ai:reindex']);
    const fixture = TestBed.createComponent(AdminHomeComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent).toContain('con el rol EDITOR');
    expect(Array.from(element.querySelectorAll('ul.grid a')).map((link) => link.textContent!.trim())).toEqual(['Tecnologías', 'Proyectos', 'Artículos', 'Asistente IA']);
    expect(Array.from(element.querySelectorAll('[data-testid="own-permissions"] li')).map((item) => item.textContent)).toEqual(['cms:read', 'cms:write', 'ai:reindex']);
  });
});
