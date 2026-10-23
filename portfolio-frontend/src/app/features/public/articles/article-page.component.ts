import { DatePipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { Article, PublicCatalogShowcasesService } from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';
import { LanguageSwitchComponent } from '../../../core/i18n/language-switch.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { MarkdownComponent } from '../../../shared/ui/markdown.component';
import { articleExcerpt } from './articles-hub.component';

/** Etiquetas Open Graph que se rellenan con cada artículo y se retiran al salir. */
const OG_TAGS = ['og:title', 'og:description', 'og:type', 'og:url'] as const;

/**
 * Página propia de cada artículo (`/articulos/:slug`): se puede enlazar, compartir y abrir en otra
 * pestaña. Pone el título de la pestaña y las etiquetas de vista previa (Open Graph). Ojo: el sitio
 * es una SPA sin renderizado en servidor, así que Google las ve (ejecuta JavaScript) pero LinkedIn y
 * otras redes, que leen solo el HTML, no.
 */
@Component({
  selector: 'app-article-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, TranslatePipe, MarkdownComponent, LanguageSwitchComponent],
  template: `
    <div class="dark safe-x min-h-dvh bg-surface-1 text-ink-1">
      <header class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-6 max-[399px]:px-4">
        <a routerLink="/" fragment="articulos" class="ui-btn-ghost tap" data-testid="article-back">← {{ 'Volver a los artículos' | t }}</a>
        <app-language-switch />
      </header>

      <main class="mx-auto max-w-3xl px-6 pb-[calc(4rem+var(--pill-space,0px)+env(safe-area-inset-bottom,0px))] max-[399px]:px-4">
        @if (error(); as message) {
          <div class="ui-card max-w-md" role="alert">
            <p class="text-body-sm text-ink-2">{{ message }}</p>
            <button type="button" class="ui-btn-secondary mt-4" (click)="load()">{{ 'Reintentar' | t }}</button>
          </div>
        } @else if (loading()) {
          <div class="space-y-4" aria-hidden="true">
            <div class="h-10 w-3/4 animate-pulse rounded-card bg-surface-2"></div>
            <div class="h-64 animate-pulse rounded-card bg-surface-2"></div>
          </div>
        } @else if (article(); as current) {
          <article data-testid="article">
            <p class="font-mono text-mono-sm text-accent-text">{{ current.publishedAt | date: 'd MMM y' }} · {{ readingMinutes() }} min {{ 'de lectura' | t }}</p>
            <h1 class="mt-2 text-title-1-sm sm:text-title-1 text-ink-1 [text-wrap:balance]">{{ current.title }}</h1>
            <div class="mt-4 flex flex-wrap gap-2">
              <button type="button" class="ui-btn-secondary" data-testid="article-copy" (click)="copyLink()">{{ (copied() ? 'Enlace copiado' : 'Copiar enlace') | t }}</button>
              <a class="ui-btn-ghost tap" [href]="linkedinShare()" target="_blank" rel="noopener" data-testid="article-share">{{ 'Compartir en LinkedIn' | t }}</a>
            </div>
            <app-markdown class="article-body mt-8 block text-body text-ink-1" [text]="current.contentMarkdown ?? ''" />
          </article>
        } @else {
          <div class="ui-card max-w-md" data-testid="article-missing">
            <p class="text-body text-ink-1">{{ 'Este artículo no existe o ya no está publicado.' | t }}</p>
            <a routerLink="/" fragment="articulos" class="ui-btn-secondary mt-4 tap">{{ 'Ver todos los artículos' | t }}</a>
          </div>
        }
      </main>
    </div>
  `,
  styles: `
    .article-body { line-height: 1.75; }
    .article-body :is(h2, h3) { margin-top: 2rem; }
  `,
})
export class ArticlePageComponent implements OnInit {
  private readonly api = inject(PublicCatalogShowcasesService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  /** Slug de la ruta `/articulos/:slug`. */
  readonly slug = signal(inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '');

  readonly article = signal<Article | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);
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
          const found = articles.find((article) => article.slug === this.slug()) ?? null;
          this.article.set(found);
          if (found) this.describe(found);
        },
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
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

  private url(): string {
    return `${this.document.location.origin}/articulos/${this.slug()}`;
  }

  private describe(article: Article): void {
    const description = articleExcerpt(article);
    this.title.setTitle(`${article.title} · Manuel Cardoza`);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: article.title ?? '' });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'article' });
    this.meta.updateTag({ property: 'og:url', content: this.url() });
  }
}
