import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';

import { FlagService } from '../../core/flags/flag.service';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ReleaseService } from '../../core/release/release';
import { ReleaseDetailsComponent, TONE_DOT, apiStatus, useDeployedTime } from './release-details.component';
import { VersionMarkComponent } from './version-mark.component';

export { relativeTime } from './release-details.component';

/**
 * Línea de estado del pie: `● Operativo · v0.2.1 · desplegada hace 26 min`. El punto sigue a
 * `/telemetry/health`; al pulsarla se abre el detalle de la versión (novedades, versión de la API y
 * enlaces a GitHub). Detrás de la flag `site.release-version`; sin `version.json` en producción no
 * se muestra.
 */
@Component({
  selector: 'app-release-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ReleaseDetailsComponent, VersionMarkComponent],
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
        class="focus-ring tap inline-flex items-center gap-2 rounded-full px-2 py-1 text-mono-sm text-ink-3 transition hover:bg-surface-2/60 hover:text-ink-1"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        aria-controls="release-notes"
        data-testid="release-badge"
        (click)="toggle()"
      >
        <span class="relative flex h-2 w-2" aria-hidden="true">
          @if (status().tone === 'ok') { <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-ok opacity-40 motion-reduce:hidden"></span> }
          <span class="relative inline-flex h-2 w-2 rounded-full" [class]="dot()"></span>
        </span>
        <span class="text-ink-2" data-testid="release-status">{{ status().label | t }}</span>
        <span aria-hidden="true">·</span>
        @if (release(); as r) {
          <span class="font-mono text-ink-1">{{ r.version }}</span>
          <span aria-hidden="true" class="max-[399px]:hidden">·</span><span class="max-[399px]:hidden">{{ 'desplegada' | t }} {{ time.ago() }}</span>
        } @else {
          <span class="font-mono text-ink-1">dev</span><span aria-hidden="true">·</span><span>{{ 'build local' | t }}</span>
        }
      </button>

      @if (open()) {
        <section
          id="release-notes"
          role="dialog"
          aria-labelledby="release-notes-title"
          data-testid="release-notes"
          class="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 animate-scale-up rounded-card border border-line-subtle bg-surface-2/95 p-4 text-left text-ink-1 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:mb-2 sm:w-[24rem]"
        >
          <header class="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="release-notes-title" class="text-base font-semibold tracking-tight">
                @if (release(); as r) { <span class="sr-only">{{ 'Versión' | t }} </span><app-version-mark [version]="r.version" [previous]="r.previous" /> } @else { {{ 'Build local' | t }} }
              </h2>
              <p class="mt-0.5 text-body-sm text-ink-2">
                @if (release()) { {{ 'Desplegada el' | t }} {{ time.on() }} } @else { {{ 'La versión la pone el CD al desplegar.' | t }} }
              </p>
            </div>
            <button type="button" class="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-2 transition hover:bg-surface-3 hover:text-ink-1" [attr.aria-label]="'Cerrar' | t" (click)="close(true)">
              <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </header>
          <app-release-details />
        </section>
      }
    }
  `,
})
export class ReleaseBadgeComponent {
  private readonly flags = inject(FlagService);
  private readonly service = inject(ReleaseService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  readonly open = signal(false);
  readonly release = this.service.release;
  /** Hora de referencia de «hace 26 min»: se renueva al abrir, no en un temporizador. */
  private readonly now = signal(Date.now());
  readonly time = useDeployedTime(inject(LanguageService), this.now, () => this.release()?.deployedAt);

  readonly enabled = computed(() => this.flags.isEnabled('site.release-version'));
  readonly visible = computed(() => this.enabled() && (!!this.release() || this.service.local()));
  readonly status = computed(() => apiStatus(this.service.api()));
  readonly dot = computed(() => TONE_DOT[this.status().tone]);

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
