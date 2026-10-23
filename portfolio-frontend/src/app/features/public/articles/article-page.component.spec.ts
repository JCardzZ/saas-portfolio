import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { provideApi } from '../../../core/api';
import { ArticlePageComponent } from './article-page.component';

describe('ArticlePageComponent', () => {
  const url = `${environment.apiBaseUrl}/public/articles`;
  const ARTICLES = [
    { id: 'a1', title: 'Cache-aside', slug: 'cache-aside', publishedAt: '2026-10-02T09:00:00Z', contentMarkdown: 'La caché es **best-effort**.' },
  ];

  function open(slug: string, before: () => void = () => {}) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideApi(environment.apiBaseUrl), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ slug }) } } },
      ],
    });
    before();
    const fixture = TestBed.createComponent(ArticlePageComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(url).flush(ARTICLES);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('renders the article of the slug, sets the tab title and the preview tags, and restores them on leave', () => {
    const fixture = open('cache-aside', () => TestBed.inject(Title).setTitle('Portafolio'));
    const meta = TestBed.inject(Meta);
    const title = TestBed.inject(Title);
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('h1')?.textContent).toBe('Cache-aside');
    expect(element.querySelector('app-markdown strong')?.textContent).toBe('best-effort');
    expect(title.getTitle()).toBe('Cache-aside · Manuel Cardoza');
    expect(meta.getTag('property="og:title"')?.content).toBe('Cache-aside');
    expect(meta.getTag('property="og:type"')?.content).toBe('article');
    expect(element.querySelector<HTMLAnchorElement>('[data-testid="article-share"]')!.href).toContain(encodeURIComponent('/articulos/cache-aside'));

    fixture.destroy();
    expect(title.getTitle()).toBe('Portafolio');
    expect(meta.getTag('property="og:title"')).toBeNull();
  });

  it('says so when the slug does not exist', () => {
    const element: HTMLElement = open('no-existe').nativeElement;
    expect(element.querySelector('[data-testid="article-missing"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="article"]')).toBeNull();
  });
});
