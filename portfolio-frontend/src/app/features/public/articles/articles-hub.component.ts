import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { finalize } from 'rxjs';

import { Article, PublicCatalogShowcasesService } from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { FocusTrapDirective } from '../../../shared/ui/focus-trap.directive';
import { MarkdownComponent } from '../../../shared/ui/markdown.component';

const EXCERPT_LENGTH = 170;

/** Hub de artículos: tarjetas con las publicaciones de `GET /public/articles` y un lector en modal. */
@Component({
    selector: 'app-articles-hub',
    imports: [TranslatePipe, DatePipe, MarkdownComponent, FocusTrapDirective, AutofocusDirective],
    templateUrl: './articles-hub.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticlesHubComponent implements OnInit {
  private readonly api = inject(PublicCatalogShowcasesService);

  readonly articles = signal<Article[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Artículo abierto en el lector. */
  readonly reading = signal<Article | null>(null);
  readonly skeletons = [0, 1, 2];

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
        next: (articles) => this.articles.set(articles),
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }

  /** Primeras líneas del artículo en texto plano, sin la sintaxis de Markdown. */
  excerpt(article: Article): string {
    const text = (article.contentMarkdown ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
      .replace(/[*_`]/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > EXCERPT_LENGTH ? text.slice(0, EXCERPT_LENGTH).trimEnd() + '…' : text;
  }
}
