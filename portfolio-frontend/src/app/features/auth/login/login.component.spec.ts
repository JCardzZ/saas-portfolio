import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { permissionGuard } from '../../../core/guards/permission.guard';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let navigate: jasmine.Spy;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login', 'loginUser', 'can']);
    auth.login.and.returnValue(of(undefined));
    auth.loginUser.and.returnValue(of(undefined));
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
    navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
  });

  function create() {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  function type(element: HTMLElement, id: string, value: string): void {
    const input = element.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  const tab = (element: HTMLElement, text: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((candidate) => candidate.textContent!.trim() === text)!;

  it('signs a person in with e-mail and password by default', () => {
    const { fixture, element } = create();

    expect(tab(element, 'Usuario').getAttribute('aria-selected')).toBe('true');
    type(element, 'email', 'ana@example.com');
    type(element, 'password', 'una-clave-larga');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(auth.loginUser).toHaveBeenCalledOnceWith('ana@example.com', 'una-clave-larga');
    expect(auth.login).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/admin');
  });

  it('signs the machine client in from its own tab', () => {
    const { fixture, element } = create();
    tab(element, 'Cliente').click();
    fixture.detectChanges();

    type(element, 'clientId', 'admin-ui');
    type(element, 'clientSecret', 's3cret');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));

    expect(auth.login).toHaveBeenCalledOnceWith('admin-ui', 's3cret');
    expect(auth.loginUser).not.toHaveBeenCalled();
  });

  it('does not call the API with an invalid e-mail or without a password, and shows a rejected sign-in', () => {
    const { fixture, element } = create();
    type(element, 'email', 'no-es-un-correo');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(auth.loginUser).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Escribe un correo válido.');
    expect(element.textContent).toContain('La contraseña es obligatoria.');

    auth.loginUser.and.returnValue(throwError(() => new Error('Correo o contraseña incorrectos')));
    type(element, 'email', 'ana@example.com');
    type(element, 'password', 'mala');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(element.querySelector('app-alert')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('guards a page by permission and sends the rest back to the panel home', () => {
    const run = (...permissions: string[]) => TestBed.runInInjectionContext(() => permissionGuard(...permissions)({} as never, {} as never));

    auth.can.and.callFake((permission: string) => permission === 'cms:read');
    expect(run('cms:read')).toBeTrue();
    expect(run('ai:reindex', 'cms:read')).toBeTrue();
    const denied = run('users:manage') as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(denied)).toBe('/admin');
  });
});
