import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OpenFeature } from '@openfeature/web-sdk';
import { throwError } from 'rxjs';

import { AdminProjectsCMSService, BASE_PATH } from '../../../core/api';
import { PlatformFlagsProvider } from '../../../core/flags/feature-flags';
import { MOCK_LATENCY_MS, mockApiInterceptor, resetMockApi } from '../../../core/mock/mock-api.interceptor';
import { environment } from '../../../../environments/environment';
import { AdminLayoutComponent } from './admin-layout.component';
import { CREATE_MIME, QuickCreateService, slugify } from './quick-create';

function storeSession(role: string, permissions: string[]): void {
  sessionStorage.setItem('portfolio.session', JSON.stringify({
    accessToken: 'jwt', expiresAt: Date.now() + 600_000,
    profile: { subject: 'u-1', email: 'ana@example.com', displayName: 'Ana Ruiz', role, permissions },
  }));
}

/** Un DragEvent de prueba con su dataTransfer (el constructor de Chrome no deja pasarlo). */
function drag(type: string, data?: DataTransfer): DragEvent {
  const event = new DragEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: data ?? new DataTransfer() });
  return event;
}

describe('quick create palette (admin.redesign)', () => {
  beforeEach(async () => {
    await OpenFeature.setProviderAndWait(new PlatformFlagsProvider(() => Promise.resolve({ 'admin.redesign': true })));
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([mockApiInterceptor])), { provide: BASE_PATH, useValue: environment.apiBaseUrl }],
    });
  });

  afterEach(async () => {
    sessionStorage.clear();
    await OpenFeature.clearProviders();
  });

  function open() {
    const fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('offers to create only what the role may write', () => {
    storeSession('EDITOR', ['cms:read', 'cms:write', 'flags:read']);
    const { element } = open();

    expect(Array.from(element.querySelectorAll('[data-testid="create-palette"] [data-create]')).map((item) => item.getAttribute('data-create')))
      .toEqual(['project', 'article', 'technology']);
  });

  it('opens the drawer when a resource is dropped on its own section, and only there', () => {
    storeSession('ADMIN', ['cms:read', 'cms:write', 'users:manage']);
    const { fixture, element } = open();
    const data = new DataTransfer();
    element.querySelector('.admin-palette [data-create="project"]')!.dispatchEvent(drag('dragstart', data));
    fixture.detectChanges();
    expect(data.getData(CREATE_MIME)).toBe('project');

    const projects = element.querySelector('.admin-link[data-drop="project"]')!;
    expect(projects.classList).toContain('admin-drop-ready');
    // La sección de artículos no admite un proyecto: no se abre nada al soltarlo ahí.
    const wrong = drag('dragover', data);
    element.querySelector('.admin-link[data-drop="article"]')!.dispatchEvent(wrong);
    expect(wrong.defaultPrevented).toBeFalse();

    const over = drag('dragover', data);
    projects.dispatchEvent(over);
    expect(over.defaultPrevented).toBeTrue();
    projects.dispatchEvent(drag('drop', data));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="quick-create"] #qc-title')!.textContent).toContain('Nuevo proyecto');
    expect(element.querySelector('.admin-drop-ready')).toBeNull();
  });

  it('creates the resource against the API, closes the drawer and announces it', fakeAsync(() => {
    storeSession('ADMIN', ['cms:read', 'cms:write']);
    const { fixture, element } = open();
    (element.querySelector('.admin-palette [data-create="article"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const type = (name: string, value: string) => {
      const field = element.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-testid="quick-create"] [name="${name}"]`)!;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const submit = () => element.querySelector<HTMLButtonElement>('.qc-btn-primary')!;

    expect(submit().disabled).toBeTrue();
    type('title', 'Colas idempotentes, sin dramas');
    expect(element.querySelector<HTMLInputElement>('[name="slug"]')!.value).toBe('colas-idempotentes-sin-dramas');
    type('contentMarkdown', '# Hola');
    expect(submit().disabled).toBeFalse();

    submit().click();
    fixture.detectChanges();
    expect(submit().textContent).toContain('Creando');
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="quick-create"]')).toBeNull();
    expect(TestBed.inject(QuickCreateService).created()).toEqual({ kind: 'article', count: 1 });
  }));

  it('keeps the drawer open with the reason when the API refuses', fakeAsync(() => {
    storeSession('ADMIN', ['cms:read', 'cms:write']);
    spyOn(TestBed.inject(AdminProjectsCMSService), 'adminProjectsPost').and.returnValue(throwError(() => new Error('no')) as never);
    const { fixture, element } = open();
    TestBed.inject(QuickCreateService).open.set('project');
    fixture.detectChanges();
    for (const [name, value] of [['title', 'A'], ['summary', 'B'], ['githubRepoUrl', 'https://github.com/a/b']]) {
      const field = element.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
      field.value = value;
      field.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.qc-btn-primary')!.click();
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="quick-create"] [role="alert"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="quick-create"]')).toBeNull();
  }));

  it('turns a title into a clean slug', () => {
    expect(slugify('  Por qué el Dominio no importa!  ')).toBe('por-que-el-dominio-no-importa');
  });
});
