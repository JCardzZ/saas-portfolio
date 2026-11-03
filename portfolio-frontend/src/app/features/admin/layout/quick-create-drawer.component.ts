import { ChangeDetectionStrategy, Component, ElementRef, HostListener, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { Observable, finalize } from 'rxjs';

import {
  AdminProjectsCMSService, AdminTechnicalBlogCMSService, AdminTechnologiesCMSService, AdminUsersService, UserRole,
} from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';
import { FocusTrapDirective } from '../../../shared/ui/focus-trap.directive';
import { SECTION_META } from './admin-sections';
import { CreateKind, QuickCreateService, createKind, slugify } from './quick-create';

/**
 * Panel lateral para crear un recurso desde la paleta (`admin.redesign`). Envía lo mismo que los
 * formularios de cada sección, a los mismos endpoints: la API valida y guarda.
 */
@Component({
  selector: 'app-quick-create-drawer',
  imports: [FocusTrapDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qc-scrim" (click)="close()" aria-hidden="true"></div>
    <aside class="qc-drawer" role="dialog" aria-modal="true" [attr.aria-labelledby]="'qc-title'" appFocusTrap [style.--sec]="color()" data-testid="quick-create">
      <header class="qc-head">
        <span class="admin-link-chip admin-link-chip-lg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="icon()" /></svg></span>
        <div class="min-w-0 flex-1">
          <h2 id="qc-title" class="qc-title">{{ info().title }}</h2>
          <p class="qc-sub">Se guarda en la API al crear.</p>
        </div>
        <button type="button" class="admin-icon-btn" aria-label="Cerrar" (click)="close()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </header>

      <form class="qc-form" (submit)="$event.preventDefault(); submit()" novalidate>
        <div class="qc-body">
        @for (field of info().fields; track field.name; let first = $first) {
          <label class="qc-field">
            <span class="qc-label">{{ field.label }}@if (field.required) { <span class="qc-req" aria-hidden="true">*</span> }</span>
            @switch (field.type) {
              @case ('textarea') {
                <textarea class="qc-input" rows="5" [attr.name]="field.name" [attr.data-first]="first || null" [required]="field.required" [placeholder]="field.placeholder ?? ''" [value]="values()[field.name] ?? ''" (input)="set(field.name, $any($event.target).value)"></textarea>
              }
              @case ('select') {
                <select class="qc-input" [attr.name]="field.name" [attr.data-first]="first || null" [required]="field.required" (change)="set(field.name, $any($event.target).value)">
                  <option value="" [selected]="!values()[field.name]">Elige…</option>
                  @for (option of field.options; track option) {
                    <option [value]="option" [selected]="values()[field.name] === option">{{ option }}</option>
                  }
                </select>
              }
              @default {
                <input class="qc-input" [type]="field.type" [attr.name]="field.name" [attr.data-first]="first || null" [required]="field.required" [attr.minlength]="field.minLength ?? null" [attr.maxlength]="field.maxLength ?? null" [placeholder]="field.placeholder ?? ''" [value]="values()[field.name] ?? ''" (input)="set(field.name, $any($event.target).value)" />
              }
            }
            @if (field.help) { <span class="qc-help">{{ field.help }}</span> }
          </label>
        }

        @if (error(); as message) {
          <p class="qc-error" role="alert">{{ message }}</p>
        }
        </div>

        <footer class="qc-foot">
          <button type="button" class="qc-btn qc-btn-ghost" (click)="close()">Cancelar</button>
          <button type="submit" class="qc-btn qc-btn-primary" [disabled]="saving() || !valid()">{{ saving() ? 'Creando…' : 'Crear' }}</button>
        </footer>
      </form>
    </aside>
  `,
})
export class QuickCreateDrawerComponent {
  readonly kind = input.required<CreateKind>();
  private readonly service = inject(QuickCreateService);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly projects = inject(AdminProjectsCMSService);
  private readonly articles = inject(AdminTechnicalBlogCMSService);
  private readonly technologies = inject(AdminTechnologiesCMSService);
  private readonly users = inject(AdminUsersService);

  readonly info = computed(() => createKind(this.kind()));
  readonly color = computed(() => SECTION_META[this.info().path]?.color ?? null);
  readonly icon = computed(() => SECTION_META[this.info().path]?.icon ?? '');
  readonly values = signal<Record<string, string>>({});
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  /** El slug sigue al título mientras nadie lo toque a mano. */
  private slugEdited = false;

  readonly valid = computed(() => this.info().fields.every((field) => {
    const value = (this.values()[field.name] ?? '').trim();
    if (field.required && !value) {
      return false;
    }
    return !value || ((field.minLength === undefined || value.length >= field.minLength) && (field.maxLength === undefined || value.length <= field.maxLength));
  }));

  constructor() {
    afterNextRender(() => this.host.querySelector<HTMLElement>('[data-first]')?.focus());
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.service.open.set(null);
  }

  set(name: string, value: string): void {
    const next = { ...this.values(), [name]: value };
    if (this.kind() === 'article') {
      if (name === 'slug') {
        this.slugEdited = true;
      } else if (name === 'title' && !this.slugEdited) {
        next['slug'] = slugify(value);
      }
    }
    this.values.set(next);
  }

  submit(): void {
    if (!this.valid() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.request().pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => this.service.done(this.kind()),
      error: (failure: unknown) => this.error.set(describeHttpError(failure)),
    });
  }

  private request(): Observable<unknown> {
    const value = (name: string) => (this.values()[name] ?? '').trim();
    switch (this.kind()) {
      case 'project':
        return this.projects.adminProjectsPost({
          title: value('title'), summary: value('summary'), githubRepoUrl: value('githubRepoUrl'),
          technologiesUsed: value('technologiesUsed').split(',').map((item) => item.trim()).filter(Boolean),
          ...(value('metricsImpact') ? { metricsImpact: value('metricsImpact') } : {}),
        });
      case 'article':
        return this.articles.adminArticlesPost({ title: value('title'), slug: value('slug'), contentMarkdown: value('contentMarkdown') });
      case 'technology':
        return this.technologies.adminTechnologiesPost({
          name: value('name'), category: value('category'), proficiencyLevel: value('proficiencyLevel'), iconUrl: value('iconUrl'),
        });
      case 'user':
        return this.users.createUser({
          email: value('email'), displayName: value('displayName'), password: value('password'), role: value('role') as UserRole,
        });
    }
  }
}
