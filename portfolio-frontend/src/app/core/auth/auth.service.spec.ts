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
});
