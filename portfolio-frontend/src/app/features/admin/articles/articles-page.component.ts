import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { AdminTechnicalBlogCMSService, Article, PublicCatalogShowcasesService } from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';
import { AlertComponent } from '../../../shared/ui/alert.component';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Publicación de artículos. El contrato solo define crear (admin) y listar (público):
 * todavía no hay edición ni borrado.
 */
@Component({
    selector: 'app-articles-page',
    imports: [ReactiveFormsModule, DatePipe, AlertComponent],
    templateUrl: './articles-page.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticlesPageComponent implements OnInit {
  private readonly admin = inject(AdminTechnicalBlogCMSService);
  private readonly catalog = inject(PublicCatalogShowcasesService);

  readonly form = inject(NonNullableFormBuilder).group({
    title: ['', Validators.required],
    slug: ['', [Validators.required, Validators.pattern(SLUG_PATTERN)]],
    contentMarkdown: ['', Validators.required],
  });
  readonly articles = signal<Article[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  /** Propone un slug a partir del título mientras el campo siga sin tocar. */
  suggestSlug(): void {
    if (this.form.controls.slug.dirty) {
      return;
    }
    const slug = this.form.controls.title.value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    this.form.controls.slug.setValue(slug);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.admin
      .adminArticlesPost(this.form.getRawValue())
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.form.reset();
          this.load();
        },
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }

  private load(): void {
    this.loading.set(true);
    this.catalog
      .publicArticlesGet()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (articles) => this.articles.set(articles),
        error: (error: unknown) => this.error.set(describeHttpError(error)),
      });
  }
}
