import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import { FlagService } from '../../../core/flags/flag.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ReleaseService } from '../../../core/release/release';
import { ReleaseDetailsComponent, TONE_DOT, apiStatus, useDeployedTime } from '../../../shared/ui/release-details.component';
import { VersionMarkComponent } from '../../../shared/ui/version-mark.component';

/**
 * La release que está en producción, al principio de la vista «Despliegues»: versión semántica,
 * cuándo se desplegó, el estado de la API y qué cambió. Los mismos datos que la línea de estado
 * del pie (version.json y /telemetry/health). Detrás de la flag `site.release-version`.
 */
@Component({
  selector: 'app-release-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ReleaseDetailsComponent, VersionMarkComponent],
  host: { class: 'block' },
  template: `
    @if (visible()) {
      <section class="bento-card mb-6" aria-labelledby="release-card-title" data-testid="release-card">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id="release-card-title" class="text-xl font-semibold tracking-tight text-ink-1">{{ 'Release en producción' | t }}</h3>
          <p class="text-xs text-ink-3">{{ 'Versionado semántico con Conventional Commits' | t }}</p>
        </div>

        <div class="mt-5 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] [&>*]:min-w-0">
          <div>
            <p data-testid="release-card-version">
              @if (release(); as r) { <app-version-mark size="lg" [version]="r.version" [previous]="r.previous" /> }
              @else { <span class="font-mono text-4xl font-semibold tracking-tight text-ink-1">dev</span> }
            </p>
            <p class="mt-3 inline-flex items-center gap-2 rounded-full border border-line-subtle px-2.5 py-1 text-xs text-ink-2">
              <span class="h-2 w-2 rounded-full" [class]="dot()" aria-hidden="true"></span>{{ status().label | t }}
            </p>
            <p class="mt-3 text-body-sm text-ink-2">
              @if (release()) {
                {{ 'Desplegada el' | t }} {{ time.on() }} <span class="text-ink-3">({{ time.ago() }})</span>
              } @else {
                {{ 'La versión la pone el CD al desplegar.' | t }}
              }
            </p>
            <p class="mt-2 text-body-sm text-ink-3">{{ 'Cada despliegue lleva su versión: el CD la calcula con los commits, el sitio la sirve en version.json y la API la devuelve en /telemetry/health.' | t }}</p>
          </div>
          <app-release-details />
        </div>
      </section>
    }
  `,
})
export class ReleaseCardComponent {
  private readonly flags = inject(FlagService);
  private readonly service = inject(ReleaseService);

  readonly release = this.service.release;
  readonly time = useDeployedTime(inject(LanguageService), signal(Date.now()), () => this.release()?.deployedAt);
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
}
