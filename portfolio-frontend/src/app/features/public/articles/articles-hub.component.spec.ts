import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { provideApi } from '../../../core/api';
import { ArticlesHubComponent } from './articles-hub.component';

describe('ArticlesHubComponent', () => {
  const url = `${environment.apiBaseUrl}/public/articles`;
  const ARTICLES = [
    { id: 'a1', title: 'Cache-aside', slug: 'cache-aside', publishedAt: '2026-10-02T09:00:00Z',
      contentMarkdown: '## Regla\n\nLa caché es **best-effort**.\n\n```java\nint x;\n```\n\n- [Docs](https://example.com)' },
    { id: 'a2', title: 'Dominio puro', slug: 'dominio-puro', publishedAt: '2026-09-24T09:00:00Z', contentMarkdown: 'Texto.' },
  ];
  let fixture: ComponentFixture<ArticlesHubComponent>;
  let element: HTMLElement;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi(environment.apiBaseUrl)],
    });
    fixture = TestBed.createComponent(ArticlesHubComponent);
    element = fixture.nativeElement;
    document.body.appendChild(element);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    backend.verify();
    element.remove();
  });

  const cards = () => Array.from(element.querySelectorAll<HTMLButtonElement>('button.bento-card'));

  it('lists the articles from the API with a plain-text excerpt', () => {
    backend.expectOne(url).flush(ARTICLES);
    fixture.detectChanges();

    expect(cards().map((card) => card.querySelector('.font-semibold')?.textContent)).toEqual(['Cache-aside', 'Dominio puro']);
    // El extracto no arrastra la sintaxis de Markdown ni los bloques de código.
    expect(cards()[0].textContent).toContain('Regla La caché es best-effort. Docs');
    expect(cards()[0].textContent).not.toContain('**');
    expect(cards()[0].textContent).not.toContain('int x');
  });

  it('opens the article rendered as Markdown and closes it with Escape', () => {
    backend.expectOne(url).flush(ARTICLES);
    fixture.detectChanges();

    cards()[0].click();
    fixture.detectChanges();

    const reader = element.querySelector('[role="dialog"]')!;
    expect(reader.getAttribute('aria-label')).toBe('Cache-aside');
    expect(reader.querySelector('app-markdown strong')?.textContent).toBe('best-effort');
    expect(reader.querySelector('app-markdown pre code')?.textContent).toContain('int x;');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Cerrar el artículo');

    reader.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows a neutral message when nothing is published and a retry when the API fails', () => {
    backend.expectOne(url).flush([]);
    fixture.detectChanges();
    expect(element.textContent).toContain('Aún no hay artículos publicados');

    fixture.componentInstance.load();
    backend.expectOne(url).flush({ detail: 'Servicio no disponible' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Servicio no disponible');
  });
});
