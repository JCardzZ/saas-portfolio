import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';

import { FlagService } from '../../core/flags/flag.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ReleaseNoteType, ReleaseService, releaseLinks } from '../../core/release/release';

const NOTE_LABELS: Record<ReleaseNoteType, string> = { feat: 'Nuevo', fix: 'Corrección', perf: 'Rendimiento' };
const NOTE_CLASSES: Record<ReleaseNoteType, string> = {
  feat: 'border-accent-text/40 text-accent-text',
  fix: 'border-status-warn/40 text-status-warn',
  perf: 'border-status-ok/40 text-status-ok',
};

/**
 * La versión desplegada en el pie (`v0.2.0 · a1b2c3d · hace 2 h`) y, al pulsarla, sus novedades:
 * qué cambió, cuándo se desplegó, si la API va en la misma versión y los enlaces a GitHub.
 * Detrás de la flag `site.release-version`; sin `version.json` en producción no se muestra.
 */
@Component({
  selector: 'app-release-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: {
    class: 'relative inline-block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close(true)',
  },
  template: `
    @if (visible()) {
      <button
        #trigger
        type="button"
        class="focus-ring tap inline-flex items-center gap-2 rounded-full border border-line-subtle bg-surface-2/60 px-3 py-1 font-mono text-mono-sm text-ink-3 transition hover:border-line-strong hover:text-ink-1"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        aria-controls="release-notes"
        data-testid="release-badge"
        (click)="toggle()"
      >
        <span class="h-1.5 w-1.5 rounded-full" [class]="release() ? 'bg-status-ok' : 'bg-ink-3'" aria-hidden="true"></span>
        @if (release(); as r) {
          <span class="text-ink-1">{{ r.version }}</span>
          <span aria-hidden="true">·</span><span>{{ r.sha.slice(0, 7) }}</span>
          <span aria-hidden="true" class="max-[399px]:hidden">·</span><span class="max-[399px]:hidden">{{ ago() }}</span>
        } @else {
          <span class="text-ink-1">dev</span><span aria-hidden="true">·</span><span>{{ 'build local' | t }}</span>
        }
      </button>

      @if (open()) {
        <section
          id="release-notes"
          role="dialog"
          aria-labelledby="release-notes-title"
          data-testid="release-notes"
          class="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 animate-scale-up rounded-card border border-line-subtle bg-surface-2/95 p-4 text-left text-ink-1 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-2 sm:w-[24rem]"
        >
          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 id="release-notes-title" class="text-base font-semibold tracking-tight">
                @if (release(); as r) { {{ 'Versión' | t }} <span class="font-mono">{{ r.version }}</span> } @else { {{ 'Build local' | t }} }
              </h2>
              <p class="mt-0.5 text-body-sm text-ink-2">
                @if (release()) { {{ 'Desplegada el' | t }} {{ deployedOn() }} } @else { {{ 'La versión la pone el CD al desplegar.' | t }} }
              </p>
            </div>
            <button type="button" class="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-2 transition hover:bg-surface-3 hover:text-ink-1" [attr.aria-label]="'Cerrar' | t" (click)="close(true)">
              <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </header>

          @if (release(); as r) {
            <h3 class="mt-4 text-xs font-medium uppercase tracking-wider text-ink-3">{{ 'Novedades' | t }}</h3>
            @if (r.notes.length) {
              <ul class="mt-2 space-y-2" data-testid="release-note-list">
                @for (note of r.notes; track $index) {
                  <li class="flex items-start gap-2 text-body-sm">
                    <span class="mt-px shrink-0 rounded-full border px-1.5 text-xs leading-[18px]" [class]="noteClasses[note.type]">{{ noteLabels[note.type] | t }}</span>
                    <span class="text-ink-1">{{ note.text }}@if (note.scope) { <span class="font-mono text-ink-3"> · {{ note.scope }}</span> }</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="mt-2 text-body-sm text-ink-2">{{ 'Mantenimiento: sin cambios visibles en esta versión.' | t }}</p>
            }
          }

          <h3 class="mt-4 text-xs font-medium uppercase tracking-wider text-ink-3">{{ 'En producción' | t }}</h3>
          <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-mono-sm" data-testid="release-skew">
            <dt class="text-ink-3">{{ 'Sitio' | t }}</dt>
            <dd class="text-ink-1">{{ release()?.version ?? 'dev' }}</dd>
            <dt class="text-ink-3">API</dt>
            <dd>
              @switch (api().state) {
                @case ('loading') { <span class="text-ink-3">{{ 'consultando…' | t }}</span> }
                @case ('unknown') { <span class="text-ink-3">{{ 'sin versión publicada' | t }}</span> }
                @case ('unreachable') { <span class="text-status-danger">{{ 'sin respuesta' | t }}</span> }
                @default {
                  <span [class]="apiInSync() ? 'text-status-ok' : 'text-status-warn'">{{ apiVersion() }}</span>
                  <span class="font-sans text-ink-3"> · {{ (apiInSync() ? 'misma versión' : 'se despliega aparte') | t }}</span>
                }
              }
            </dd>
          </dl>

          @if (links(); as l) {
            <div class="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line-subtle pt-3 text-body-sm">
              <a class="focus-ring rounded-control text-accent-text hover:underline" [href]="l.notes" target="_blank" rel="noopener" data-testid="release-link-notes">{{ 'Notas completas' | t }} ↗</a>
              @if (l.compare) {
                <a class="focus-ring rounded-control text-ink-2 hover:text-ink-1 hover:underline" [href]="l.compare" target="_blank" rel="noopener">{{ 'Comparar con' | t }} {{ release()?.previous }}</a>
              }
              <a class="focus-ring rounded-control font-mono text-ink-2 hover:text-ink-1 hover:underline" [href]="l.commit" target="_blank" rel="noopener">{{ release()?.sha?.slice(0, 7) }}</a>
            </div>
          }
        </section>
      }
    }
  `,
})
export class ReleaseBadgeComponent {
  private readonly flags = inject(FlagService);
  private readonly language = inject(LanguageService);
  private readonly service = inject(ReleaseService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  readonly noteLabels = NOTE_LABELS;
  readonly noteClasses = NOTE_CLASSES;
  readonly open = signal(false);
  readonly release = this.service.release;
  readonly api = this.service.api;
  /** Hora de referencia de «hace 2 h»: se renueva al abrir, no en un temporizador. */
  private readonly now = signal(Date.now());

  readonly enabled = computed(() => this.flags.isEnabled('site.release-version'));
  readonly visible = computed(() => this.enabled() && (!!this.release() || this.service.local()));
  readonly links = computed(() => { const release = this.release(); return release ? releaseLinks(release) : null; });
  readonly apiVersion = computed(() => { const api = this.api(); return api.state === 'known' ? api.version : null; });
  readonly apiInSync = computed(() => this.apiVersion() !== null && this.apiVersion() === this.release()?.version);

  readonly ago = computed(() => {
    const release = this.release();
    return release ? relativeTime(release.deployedAt.getTime() - this.now(), this.language.lang()) : '';
  });
  readonly deployedOn = computed(() => {
    const release = this.release();
    return release ? new Intl.DateTimeFormat(this.language.lang(), { dateStyle: 'medium', timeStyle: 'short' }).format(release.deployedAt) : '';
  });

  constructor() {
    effect(() => {
      if (this.enabled()) {
        this.service.load();
      }
    });
  }

  toggle(): void {
    if (this.open()) {
      this.close(false);
      return;
    }
    this.now.set(Date.now());
    this.open.set(true);
    this.service.loadApiVersion();
  }

  close(restoreFocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (restoreFocus) {
      this.trigger()?.nativeElement.focus();
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close(false);
    }
  }
}

/** «hace 2 h», «hace 3 días»… en el idioma del sitio. */
export function relativeTime(diffMs: number, lang: string): string {
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) {
    return format.format(minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return format.format(hours, 'hour');
  }
  const days = Math.round(hours / 24);
  return Math.abs(days) < 30 ? format.format(days, 'day') : format.format(Math.round(days / 30), 'month');
}
