import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ApiHealth, ReleaseNoteType, ReleaseService, releaseLinks } from '../../core/release/release';

const NOTE_LABELS: Record<ReleaseNoteType, string> = { feat: 'Nuevo', fix: 'Corrección', perf: 'Rendimiento' };
const NOTE_CLASSES: Record<ReleaseNoteType, string> = {
  feat: 'border-accent-text/40 text-accent-text',
  fix: 'border-status-warn/40 text-status-warn',
  perf: 'border-status-ok/40 text-status-ok',
};

export type StatusTone = 'ok' | 'warn' | 'danger' | 'muted';

/** Cómo se cuenta el estado de la API: texto y color del punto. */
export function apiStatus(api: ApiHealth): { label: string; tone: StatusTone } {
  switch (api.state) {
    case 'up': return { label: 'Operativo', tone: 'ok' };
    case 'degraded': return { label: 'Degradado', tone: 'warn' };
    case 'unreachable': return { label: 'Sin conexión con la API', tone: 'danger' };
    case 'demo': return { label: 'Modo demo', tone: 'muted' };
    default: return { label: 'Comprobando…', tone: 'muted' };
  }
}

export const TONE_DOT: Record<StatusTone, string> = {
  ok: 'bg-status-ok', warn: 'bg-status-warn', danger: 'bg-status-danger', muted: 'bg-ink-3',
};

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

/**
 * El detalle de la versión desplegada: novedades, versión del sitio frente a la de la API y
 * enlaces a GitHub. Lo comparten el popover del pie y la tarjeta de la sección Delivery.
 */
@Component({
  selector: 'app-release-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: { class: 'block' },
  template: `
    @if (release(); as r) {
      <h3 class="text-xs font-medium uppercase tracking-wider text-ink-3">{{ 'Novedades' | t }}</h3>
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
          @case ('demo') { <span class="text-ink-3">{{ 'modo demo, sin API' | t }}</span> }
          @case ('unreachable') { <span class="text-status-danger">{{ 'sin respuesta' | t }}</span> }
          @default {
            @if (apiVersion(); as version) {
              <span [class]="apiInSync() ? 'text-status-ok' : 'text-status-warn'">{{ version }}</span>
              <span class="font-sans text-ink-3"> · {{ (apiInSync() ? 'misma versión' : 'se despliega aparte') | t }}</span>
            } @else {
              <span class="text-ink-3">{{ 'sin versión publicada' | t }}</span>
            }
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
  `,
})
export class ReleaseDetailsComponent {
  private readonly service = inject(ReleaseService);

  readonly noteLabels = NOTE_LABELS;
  readonly noteClasses = NOTE_CLASSES;
  readonly release = this.service.release;
  readonly api = this.service.api;
  readonly links = computed(() => { const release = this.release(); return release ? releaseLinks(release) : null; });
  readonly apiVersion = computed(() => { const api = this.api(); return 'version' in api ? api.version : null; });
  readonly apiInSync = computed(() => this.apiVersion() !== null && this.apiVersion() === this.release()?.version);
}

/** Fecha del despliegue y «hace…», en el idioma del sitio. */
export function useDeployedTime(language: LanguageService, now: () => number, deployedAt: () => Date | undefined) {
  return {
    ago: computed(() => { const at = deployedAt(); return at ? relativeTime(at.getTime() - now(), language.lang()) : ''; }),
    on: computed(() => {
      const at = deployedAt();
      return at ? new Intl.DateTimeFormat(language.lang(), { dateStyle: 'medium', timeStyle: 'short' }).format(at) : '';
    }),
  };
}
