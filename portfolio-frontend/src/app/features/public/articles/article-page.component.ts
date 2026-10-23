import { DatePipe, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, ViewEncapsulation,
  afterNextRender, computed, inject, signal,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { Article, PublicCatalogShowcasesService } from '../../../core/api';
import { runtimeConfig } from '../../../core/config/runtime-config';
import { describeHttpError } from '../../../core/errors/http-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { LanguageSwitchComponent } from '../../../core/i18n/language-switch.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { MarkdownComponent } from '../../../shared/ui/markdown.component';
import { SocialLinksComponent } from '../../../shared/ui/social-links.component';
import { HERO_ROLE_PLACEHOLDER } from '../landing/hero-content';
import { articleExcerpt } from './articles-hub.component';

/** Etiquetas Open Graph que se rellenan con cada artículo y se retiran al salir. */
const OG_TAGS = ['og:title', 'og:description', 'og:type', 'og:url'] as const;
const AUTHOR = 'Manuel Cardoza';

interface TocEntry {
  id: string;
  text: string;
}

/**
 * Página propia de cada artículo (`/articulos/:slug`), maquetada como una publicación técnica:
 * firma del autor, entradilla, índice de secciones que sigue la lectura, barra de progreso,
 * tarjeta de autor y más artículos al final. Pone el título de la pestaña y las etiquetas Open
 * Graph. Ojo: el sitio es una SPA sin renderizado en servidor, así que Google las ve (ejecuta
 * JavaScript) pero LinkedIn y otras redes, que leen solo el HTML, no.
 */
@Component({
  selector: 'app-article-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Sin encapsulación: los estilos del cuerpo afectan al HTML que pinta el Markdown (todo bajo `.article-page`).
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, DatePipe, TranslatePipe, MarkdownComponent, LanguageSwitchComponent, SocialLinksComponent],
  host: { '(window:scroll)': 'onScroll()' },
  template: `
    <div class="article-page dark safe-x min-h-dvh bg-canvas text-ink-1">
      <div class="progress" aria-hidden="true" [style.transform]="'scaleX(' + progress() + ')'"></div>

      <header class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 max-[399px]:px-4">
        <a routerLink="/" fragment="articulos" class="ui-btn-ghost tap" data-testid="article-back">← {{ 'Volver a los artículos' | t }}</a>
        <app-language-switch />
      </header>

      <main class="mx-auto max-w-6xl px-6 pb-[calc(5rem+var(--pill-space,0px)+env(safe-area-inset-bottom,0px))] max-[399px]:px-4">
        @if (error(); as message) {
          <div class="ui-card max-w-md" role="alert">
            <p class="text-body-sm text-ink-2">{{ message }}</p>
            <button type="button" class="ui-btn-secondary mt-4" (click)="load()">{{ 'Reintentar' | t }}</button>
          </div>
        } @else if (loading()) {
          <div class="mx-auto max-w-[44rem] space-y-4 pt-10" aria-hidden="true">
            <div class="h-4 w-40 animate-pulse rounded-control bg-surface-2"></div>
            <div class="h-14 w-full animate-pulse rounded-control bg-surface-2"></div>
            <div class="h-64 animate-pulse rounded-card bg-surface-2"></div>
          </div>
        } @else if (article(); as current) {
          <article class="layout" data-testid="article">
            <div class="head">
              <p class="kicker">{{ 'Artículo técnico' | t }}</p>
              <h1 class="title">{{ current.title }}</h1>
              <div class="byline">
                <span class="avatar" aria-hidden="true">
                  @if (photoOk()) {
                    <img [src]="photoUrl" alt="" (error)="photoOk.set(false)" />
                  } @else {
                    MC
                  }
                </span>
                <span class="who">
                  <span class="name">{{ author }}</span>
                  <span class="meta">{{ role() }}</span>
                </span>
                <span class="facts">
                  <time [attr.datetime]="current.publishedAt">{{ current.publishedAt | date: 'd MMM y' }}</time>
                  <span aria-hidden="true">·</span>
                  <span>{{ readingMinutes() }} min {{ 'de lectura' | t }}</span>
                </span>
                <span class="actions">
                  <button type="button" class="ui-btn-ghost ui-btn-icon" data-testid="article-copy" [attr.aria-label]="(copied() ? 'Enlace copiado' : 'Copiar enlace') | t" [title]="(copied() ? 'Enlace copiado' : 'Copiar enlace') | t" (click)="copyLink()">
                    @if (copied()) {
                      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    } @else {
                      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg>
                    }
                  </button>
                  <a class="ui-btn-ghost tap text-body-sm" [href]="linkedinShare()" target="_blank" rel="noopener" data-testid="article-share">{{ 'Compartir en LinkedIn' | t }}</a>
                </span>
              </div>
            </div>

            @if (toc().length > 1) {
              <nav class="toc" [attr.aria-label]="'En este artículo' | t" data-testid="article-toc">
                <p class="toc-title">{{ 'En este artículo' | t }}</p>
                <ol>
                  @for (entry of toc(); track entry.id) {
                    <li><a [href]="'#' + entry.id" [class.active]="activeId() === entry.id" (click)="goTo($event, entry.id)">{{ entry.text }}</a></li>
                  }
                </ol>
              </nav>
            }

            <app-markdown class="body prose-article block" [text]="current.contentMarkdown ?? ''" />

            <footer class="end">
              <div class="author-card">
                <span class="avatar avatar-lg" aria-hidden="true">
                  @if (photoOk()) {
                    <img [src]="photoUrl" alt="" (error)="photoOk.set(false)" />
                  } @else {
                    MC
                  }
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-body-sm text-ink-3">{{ 'Escrito por' | t }}</p>
                  <p class="text-title-3 text-ink-1">{{ author }}</p>
                  <p class="text-body-sm text-ink-2">{{ role() }}</p>
                </div>
                <app-social-links />
              </div>

              @if (others().length) {
                <section class="more" [attr.aria-label]="'Más artículos' | t">
                  <h2 class="text-overline uppercase text-ink-3">{{ 'Más artículos' | t }}</h2>
                  <ul>
                    @for (other of others(); track other.id) {
                      <li>
                        <a [routerLink]="['/articulos', other.slug]" class="more-link">
                          <span class="text-body font-medium text-ink-1">{{ other.title }}</span>
                          <span class="text-body-sm text-ink-3">{{ other.publishedAt | date: 'd MMM y' }}</span>
                        </a>
                      </li>
                    }
                  </ul>
                </section>
              }
            </footer>
          </article>
        } @else {
          <div class="ui-card mx-auto mt-10 max-w-md" data-testid="article-missing">
            <p class="text-body text-ink-1">{{ 'Este artículo no existe o ya no está publicado.' | t }}</p>
            <a routerLink="/" fragment="articulos" class="ui-btn-secondary mt-4 tap">{{ 'Ver todos los artículos' | t }}</a>
          </div>
        }
      </main>
    </div>
  `,
  styles: `
    .article-page .progress {
      position: fixed; inset: 0 0 auto 0; z-index: 50; height: 2px; transform-origin: 0 50%;
      background: var(--accent-solid); transition: transform 80ms linear;
    }
    /* Texto a 44rem (≈ 70 caracteres); el índice, a la derecha en pantallas anchas. */
    .article-page .layout { display: grid; grid-template-columns: minmax(0, 44rem); justify-content: center; column-gap: 4rem; padding-top: 2.5rem; }
    .article-page .head { grid-column: 1; padding-bottom: 2rem; border-bottom: 1px solid var(--border-subtle); }
    .article-page .kicker { font: 500 0.75rem/1rem var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent-text); }
    .article-page .title {
      margin-top: 0.75rem; font-family: 'Space Grotesk', var(--font-sans); font-weight: 700; letter-spacing: -0.02em;
      font-size: clamp(2rem, 4.2vw, 3.25rem); line-height: 1.08; color: var(--text-1); text-wrap: balance;
    }
    .article-page .byline { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1rem; margin-top: 1.75rem; }
    .article-page .who { display: flex; flex-direction: column; line-height: 1.25; }
    .article-page .name { font-weight: 600; color: var(--text-1); font-size: 0.9375rem; }
    .article-page .meta, .article-page .facts { font-size: 0.875rem; color: var(--text-3); }
    .article-page .facts { display: flex; gap: 0.5rem; padding-left: 1rem; border-left: 1px solid var(--border-subtle); font-variant-numeric: tabular-nums; }
    .article-page .actions { display: flex; align-items: center; gap: 0.25rem; margin-left: auto; }
    .article-page .avatar {
      display: grid; place-items: center; width: 2.5rem; height: 2.5rem; flex-shrink: 0; overflow: hidden; border-radius: 999px;
      border: 1px solid var(--border-strong); background: var(--bg-surface-3); font: 600 0.8125rem var(--font-sans); color: var(--text-2);
    }
    .article-page .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .article-page .avatar-lg { width: 3.5rem; height: 3.5rem; font-size: 1rem; }

    .article-page .toc { grid-column: 1; margin-top: 2rem; }
    .article-page .toc-title { font: 500 0.75rem/1rem var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
    .article-page .toc ol { margin-top: 0.75rem; border-left: 1px solid var(--border-subtle); }
    .article-page .toc a {
      display: block; margin-left: -1px; padding: 0.375rem 0 0.375rem 0.875rem; border-left: 1px solid transparent;
      font-size: 0.875rem; line-height: 1.35; color: var(--text-3); transition: color var(--duration-fast) var(--ease-standard);
    }
    .article-page .toc a:hover { color: var(--text-1); }
    .article-page .toc a.active { color: var(--text-1); border-left-color: var(--accent-solid); }
    @media (max-width: 1099px) { .article-page .toc { padding: 1rem 1.25rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--bg-surface-1); } }

    /* Cuerpo: tipografía de lectura. */
    .article-page .body { grid-column: 1; margin-top: 2.5rem; font-size: 1.0625rem; line-height: 1.75; color: var(--text-2); }
    .article-page .body .markdown > * + * { margin-top: 1.25em; }
    .article-page .body .markdown > p:first-child { font-size: 1.25rem; line-height: 1.6; color: var(--text-1); }
    .article-page .body h2 {
      margin-top: 2.75em; padding-top: 0.25em; scroll-margin-top: 1.5rem; font-family: 'Space Grotesk', var(--font-sans);
      font-size: 1.5rem; line-height: 1.3; font-weight: 700; letter-spacing: -0.01em; color: var(--text-1);
    }
    .article-page .body h3 { margin-top: 2em; font-size: 1.1875rem; font-weight: 600; color: var(--text-1); }
    .article-page .body strong { color: var(--text-1); font-weight: 600; }
    .article-page .body a { color: var(--accent-text); text-decoration: underline; text-decoration-color: rgb(var(--c-accent-solid) / 0.4); text-underline-offset: 3px; }
    .article-page .body a:hover { text-decoration-color: currentColor; }
    .article-page .body ul, .article-page .body ol { padding-left: 1.25em; }
    .article-page .body li + li { margin-top: 0.5em; }
    .article-page .body li::marker { color: var(--text-3); }
    .article-page .body code { padding: 0.1em 0.35em; border-radius: 0.3rem; background: var(--bg-surface-2); font-size: 0.875em; color: var(--text-1); }
    .article-page .body pre { padding: 1.125rem 1.25rem; overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--bg-surface-1); font-size: 0.875rem; line-height: 1.65; }
    .article-page .body pre code { padding: 0; background: none; }
    .article-page .body blockquote { padding-left: 1.25rem; border-left: 2px solid var(--accent-solid); color: var(--text-1); font-style: normal; }
    .article-page .body img { margin-block: 2em; width: 100%; border: 1px solid var(--border-subtle); border-radius: var(--radius-card); }
    .article-page .body table { width: 100%; border-collapse: collapse; font-size: 0.9375rem; display: block; overflow-x: auto; }
    .article-page .body th, .article-page .body td { padding: 0.625rem 0.75rem; border-bottom: 1px solid var(--border-subtle); text-align: left; vertical-align: top; }
    .article-page .body th { color: var(--text-1); font-weight: 600; }
    .article-page .body hr { border: 0; border-top: 1px solid var(--border-subtle); margin-block: 2.5em; }

    .article-page .end { grid-column: 1; margin-top: 4rem; }
    .article-page .author-card { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; padding: 1.25rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--bg-surface-1); }
    .article-page .more { margin-top: 3rem; }
    .article-page .more ul { margin-top: 0.75rem; border-top: 1px solid var(--border-subtle); }
    .article-page .more-link { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.25rem 1rem; padding: 1rem 0.25rem; border-bottom: 1px solid var(--border-subtle); }
    .article-page .more-link:hover span:first-child { color: var(--accent-text); }
    @media (max-width: 639px) { .article-page .facts { padding-left: 0; border-left: 0; } .article-page .actions { margin-left: 0; } }
    @media (prefers-reduced-motion: reduce) { .article-page .progress { transition: none; } }
    /* Al final: en pantallas anchas el índice pasa a su columna, fijo mientras se lee (gana a las reglas de arriba). */
    @media (min-width: 1100px) {
      .article-page .layout { grid-template-columns: minmax(0, 44rem) 14rem; justify-content: start; margin-left: max(0px, calc((100% - 44rem - 18rem) / 2)); }
      .article-page .toc { grid-column: 2; grid-row: 2 / span 2; position: sticky; top: 2rem; align-self: start; margin-top: 2.5rem; }
    }
  `,
})
export class ArticlePageComponent implements OnInit {
  private readonly api = inject(PublicCatalogShowcasesService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly language = inject(LanguageService);

  /** Slug de la ruta `/articulos/:slug`. */
  readonly slug = signal(inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '');

  readonly author = AUTHOR;
  readonly role = computed(() => this.language.t(HERO_ROLE_PLACEHOLDER));
  readonly photoUrl = `${runtimeConfig.apiBaseUrl}/public/profile/photo`;
  /** Foto de perfil del CV; sin ella (o en modo demo, sin API), iniciales. */
  readonly photoOk = signal(!runtimeConfig.mockMode);

  readonly articles = signal<Article[]>([]);
  readonly article = signal<Article | null>(null);
  readonly others = computed(() => this.articles().filter((other) => other.slug !== this.slug()).slice(0, 3));
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);
  readonly toc = signal<TocEntry[]>([]);
  readonly activeId = signal<string | null>(null);
  readonly progress = signal(0);
  /** A 220 palabras por minuto, redondeado hacia arriba. */
  readonly readingMinutes = computed(() => Math.max(1, Math.ceil((this.article()?.contentMarkdown ?? '').split(/\s+/).filter(Boolean).length / 220)));
  readonly linkedinShare = computed(() => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(this.url())}`);
  private readonly previousTitle = this.title.getTitle();
  /** La descripción del sitio (index.html): se devuelve al salir del artículo. */
  private readonly previousDescription = this.meta.getTag('name="description"')?.content ?? '';

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.title.setTitle(this.previousTitle);
      this.meta.updateTag({ name: 'description', content: this.previousDescription });
      for (const tag of OG_TAGS) this.meta.removeTag(`property="${tag}"`);
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .publicArticlesGet()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (articles) => {
          this.articles.set(articles);
          const found = articles.find((article) => article.slug === this.slug()) ?? null;
          this.article.set(found);
          if (found) {
            this.describe(found);
            // Cuando el Markdown ya está pintado: anclas para las secciones y el índice.
            afterNextRender(() => this.buildToc(), { injector: this.injector });
          }
        },
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }

  onScroll(): void {
    const root = this.document.documentElement;
    const max = root.scrollHeight - root.clientHeight;
    this.progress.set(max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0);
    // Sección activa: la última cuyo título ya pasó del primer tercio de la pantalla.
    let active: string | null = null;
    for (const entry of this.toc()) {
      const heading = this.document.getElementById(entry.id);
      if (heading && heading.getBoundingClientRect().top < innerHeight / 3) active = entry.id;
    }
    if (active !== this.activeId()) this.activeId.set(active);
  }

  goTo(event: Event, id: string): void {
    event.preventDefault();
    this.document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Sin portapapeles (permiso denegado): la URL sigue en la barra del navegador.
    }
  }

  private buildToc(): void {
    const used = new Set<string>();
    const entries: TocEntry[] = [];
    for (const heading of Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.body h2'))) {
      const text = heading.textContent?.trim() ?? '';
      let id = slugify(text) || 'seccion';
      while (used.has(id)) id += '-';
      used.add(id);
      heading.id = id;
      entries.push({ id, text });
    }
    this.toc.set(entries);
    this.onScroll();
  }

  private url(): string {
    return `${this.document.location.origin}/articulos/${this.slug()}`;
  }

  private describe(article: Article): void {
    const description = articleExcerpt(article);
    this.title.setTitle(`${article.title} · ${AUTHOR}`);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: article.title ?? '' });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'article' });
    this.meta.updateTag({ property: 'og:url', content: this.url() });
  }
}

function slugify(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
