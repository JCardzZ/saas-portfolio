import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { jwtInterceptor } from './jwt.interceptor';
import { unauthorizedInterceptor } from './unauthorized.interceptor';

describe('HTTP interceptors', () => {
  const api = environment.apiBaseUrl;
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService>;
  let navigate: jasmine.Spy;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['token', 'logout', 'canRefresh', 'refresh']);
    auth.token.and.returnValue('jwt-123');
    auth.canRefresh.and.returnValue(false);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([jwtInterceptor, unauthorizedInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  afterEach(() => backend.verify());

  it('adds the bearer token to admin requests', () => {
    http.get(`${api}/admin/technologies`).subscribe();

    const request = backend.expectOne(`${api}/admin/technologies`).request;
    expect(request.headers.get('Authorization')).toBe('Bearer jwt-123');
  });

  it('does not add the token to public or token-issuing requests', () => {
    http.get(`${api}/public/projects`).subscribe();
    http.post(`${api}/auth/token`, {}).subscribe();

    expect(backend.expectOne(`${api}/public/projects`).request.headers.has('Authorization')).toBeFalse();
    expect(backend.expectOne(`${api}/auth/token`).request.headers.has('Authorization')).toBeFalse();
  });

  it('never sends the token to another origin', () => {
    http.get('https://evil.example/admin/technologies').subscribe();

    const request = backend.expectOne('https://evil.example/admin/technologies').request;
    expect(request.headers.has('Authorization')).toBeFalse();
  });

  it('sends admin requests without header when there is no session', () => {
    auth.token.and.returnValue(null);

    http.get(`${api}/admin/projects`).subscribe({ error: () => undefined });

    const request = backend.expectOne(`${api}/admin/projects`);
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush(null, { status: 401, statusText: 'Unauthorized' });
  });

  it('logs out and redirects to login when a protected request returns 401', () => {
    http.get(`${api}/admin/technologies`).subscribe({ error: () => undefined });
    backend.expectOne(`${api}/admin/technologies`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], jasmine.anything());
  });

  it('keeps the session when the login request itself returns 401', () => {
    http.post(`${api}/auth/token`, {}).subscribe({ error: () => undefined });
    backend.expectOne(`${api}/auth/token`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('sends the token to /auth/me too', () => {
    http.get(`${api}/auth/me`).subscribe();

    expect(backend.expectOne(`${api}/auth/me`).request.headers.get('Authorization')).toBe('Bearer jwt-123');
  });

  it('renews the session once on a 401 and repeats the request with the new token', () => {
    auth.canRefresh.and.returnValue(true);
    auth.refresh.and.callFake(() => {
      auth.token.and.returnValue('jwt-nuevo');
      return of(true);
    });
    let body: unknown;

    http.get(`${api}/admin/technologies`).subscribe((response) => (body = response));
    backend.expectOne(`${api}/admin/technologies`).flush(null, { status: 401, statusText: 'Unauthorized' });
    const retried = backend.expectOne(`${api}/admin/technologies`);
    retried.flush([{ id: 't1' }]);

    expect(retried.request.headers.get('Authorization')).toBe('Bearer jwt-nuevo');
    expect(body).toEqual([{ id: 't1' }]);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('gives up after one renewal: a second 401 closes the session', () => {
    auth.canRefresh.and.returnValue(true);
    auth.refresh.and.returnValue(of(true));

    http.get(`${api}/admin/technologies`).subscribe({ error: () => undefined });
    backend.expectOne(`${api}/admin/technologies`).flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne(`${api}/admin/technologies`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(auth.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], jasmine.anything());
  });

  it('closes the session when it cannot be renewed', () => {
    auth.canRefresh.and.returnValue(true);
    auth.refresh.and.returnValue(of(false));

    http.get(`${api}/admin/technologies`).subscribe({ error: () => undefined });
    backend.expectOne(`${api}/admin/technologies`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.logout).toHaveBeenCalled();
  });

  it('does not treat a 403 as an expired session', () => {
    auth.canRefresh.and.returnValue(true);
    let status = 0;

    http.get(`${api}/admin/users`).subscribe({ error: (error) => (status = error.status) });
    backend.expectOne(`${api}/admin/users`).flush(null, { status: 403, statusText: 'Forbidden' });

    expect(status).toBe(403);
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
