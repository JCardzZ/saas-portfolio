import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { provideApi } from '../api';
import { authGuard } from '../guards/auth.guard';
import { AuthService } from './auth.service';

describe('AuthService and authGuard', () => {
  let backend: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApi(environment.apiBaseUrl),
      ],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    jasmine.clock().uninstall();
  });

  function login(auth: AuthService, expiresInSeconds = 3600): void {
    auth.login('admin-ui', 's3cret').subscribe();
    const request = backend.expectOne(`${environment.apiBaseUrl}/auth/token`);
    expect(request.request.body).toEqual({
      clientId: 'admin-ui',
      clientSecret: 's3cret',
      grantType: 'client_credentials',
    });
    request.flush({ accessToken: 'jwt-123', expiresInSeconds });
  }

  function runGuard(): boolean | UrlTree {
    return TestBed.runInInjectionContext(() => authGuard({} as never, { url: '/admin/projects' } as never)) as
      | boolean
      | UrlTree;
  }

  it('stores the token after a successful login', () => {
    const auth = TestBed.inject(AuthService);

    login(auth);

    expect(auth.token()).toBe('jwt-123');
    expect(auth.isAuthenticated()).toBeTrue();
  });

  it('drops the session once the token expires', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 0, 1));
    const auth = TestBed.inject(AuthService);
    login(auth, 60);

    jasmine.clock().tick(61_000);

    expect(auth.token()).toBeNull();
    expect(auth.isAuthenticated()).toBeFalse();
  });

  it('clears the session on logout', () => {
    const auth = TestBed.inject(AuthService);
    login(auth);

    auth.logout();

    expect(auth.token()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('guard redirects anonymous users to login keeping the return url', () => {
    const result = runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fadmin%2Fprojects');
  });

  it('guard lets authenticated users through', () => {
    login(TestBed.inject(AuthService));

    expect(runGuard()).toBeTrue();
  });

  describe('a person', () => {
    const SESSION = {
      accessToken: 'jwt-ana', expiresInSeconds: 900, refreshToken: 'refresh-1', refreshExpiresInSeconds: 604800,
      user: { subject: 'u1', email: 'ana@example.com', displayName: 'Ana', role: 'EDITOR', permissions: ['cms:read', 'cms:write'] },
    };

    function signIn(auth: AuthService, session: object = SESSION): void {
      auth.loginUser('ana@example.com', 'una-clave-larga').subscribe();
      const request = backend.expectOne(`${environment.apiBaseUrl}/auth/login`);
      expect(request.request.body).toEqual({ email: 'ana@example.com', password: 'una-clave-larga' });
      request.flush(session);
    }

    it('signs in with e-mail and password and knows what the role may do', () => {
      const auth = TestBed.inject(AuthService);
      signIn(auth);

      expect(auth.token()).toBe('jwt-ana');
      expect(auth.who()).toEqual({ name: 'Ana', role: 'EDITOR' });
      expect(auth.can('cms:write')).toBeTrue();
      expect(auth.can('users:manage')).toBeFalse();
      // La contraseña no se guarda; el perfil y los tokens, solo mientras dure la pestaña.
      expect(sessionStorage.getItem('portfolio.session')).not.toContain('una-clave-larga');
    });

    it('treats the machine client as an administrator and an anonymous visitor as nobody', () => {
      const auth = TestBed.inject(AuthService);
      expect(auth.can('cms:read')).toBeFalse();
      expect(auth.who()).toBeNull();

      login(auth);
      expect(auth.can('users:manage')).toBeTrue();
      expect(auth.who()).toEqual({ name: 'Cliente de máquina', role: 'ADMIN' });
      expect(auth.canRefresh()).toBeFalse();
    });

    it('keeps the session while it can still be renewed, and renews it once for everyone waiting', () => {
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date('2026-10-12T10:00:00Z'));
      const auth = TestBed.inject(AuthService);
      signIn(auth);

      jasmine.clock().tick(901_000);
      expect(auth.token()).withContext('caducado, pero renovable').toBe('jwt-ana');
      expect(auth.canRefresh()).toBeTrue();

      const results: boolean[] = [];
      auth.refresh().subscribe((ok) => results.push(ok));
      auth.refresh().subscribe((ok) => results.push(ok));
      const request = backend.expectOne(`${environment.apiBaseUrl}/auth/refresh`);
      expect(request.request.body).toEqual({ refreshToken: 'refresh-1' });
      request.flush({ ...SESSION, accessToken: 'jwt-ana-2', refreshToken: 'refresh-2' });

      expect(results).toEqual([true, true]);
      expect(auth.token()).toBe('jwt-ana-2');
    });

    it('closes the session when the renewal is rejected or there is nothing to renew with', () => {
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date('2026-10-12T10:00:00Z'));
      const auth = TestBed.inject(AuthService);
      signIn(auth);

      let renewed: boolean | undefined;
      auth.refresh().subscribe((ok) => (renewed = ok));
      backend.expectOne(`${environment.apiBaseUrl}/auth/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });
      expect(renewed).toBeFalse();
      expect(auth.token()).toBeNull();

      signIn(auth);
      jasmine.clock().tick(604_801_000);
      expect(auth.canRefresh()).toBeFalse();
      expect(auth.token()).toBeNull();
      auth.refresh().subscribe((ok) => (renewed = ok));
      expect(renewed).toBeFalse();
    });

    it('revokes the refresh token on the server when signing out', () => {
      const auth = TestBed.inject(AuthService);
      signIn(auth);

      auth.logout();

      const request = backend.expectOne(`${environment.apiBaseUrl}/auth/logout`);
      expect(request.request.body).toEqual({ refreshToken: 'refresh-1' });
      request.flush(null, { status: 204, statusText: 'No Content' });
      expect(auth.token()).toBeNull();
      expect(sessionStorage.getItem('portfolio.session')).toBeNull();
    });

    it('restores a stored session and ignores a profile that does not have the expected shape', () => {
      const future = Date.now() + 60_000;
      sessionStorage.setItem('portfolio.session', JSON.stringify({ accessToken: 'jwt-x', expiresAt: future, profile: { subject: 'u1', role: 'ADMIN', permissions: 'todo' } }));
      const tampered = TestBed.inject(AuthService);

      expect(tampered.token()).toBe('jwt-x');
      expect(tampered.profile()).withContext('perfil manipulado').toBeNull();
    });
  });
});
