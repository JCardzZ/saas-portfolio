import { ChangeDetectionStrategy, Component, Injectable, inject, input, signal } from '@angular/core';

import { runtimeConfig } from '../../core/config/runtime-config';
import { AutofocusDirective } from './autofocus.directive';
import { FocusTrapDirective } from './focus-trap.directive';

export type CvLanguage = 'es' | 'en';
export type CvType = 'short' | 'full' | 'ats';

export interface CvOption {
  lang: CvLanguage;
  type: CvType;
  label: string;
  hint: string;
}

/** Los cuatro CV maquetados, en el orden en que se muestran como tarjetas. */
export const CV_DESIGNED: CvOption[] = [
  { lang: 'en', type: 'short', label: 'English · One-Pager', hint: 'Executive summary, 1 page' },
  { lang: 'en', type: 'full', label: 'English · Full Dossier', hint: 'Detailed experience & projects' },
  { lang: 'es', type: 'short', label: 'Español · Resumen ejecutivo', hint: '1 página' },
  { lang: 'es', type: 'full', label: 'Español · CV completo', hint: 'Toda la experiencia, detallada' },
];

/** Texto plano a una columna, para sistemas de selección. */
export const CV_ATS: CvOption[] = [
  { lang: 'en', type: 'ats', label: 'ATS Clean PDF', hint: 'English' },
  { lang: 'es', type: 'ats', label: 'PDF limpio para ATS', hint: 'Español' },
];

export const CV_OPTIONS: CvOption[] = [...CV_DESIGNED, ...CV_ATS];

/**
 * Dirección de un CV. Con backend, el PDF se genera al momento desde el documento de
 * trayectoria; en modo demo no hay backend y se sirve la copia exportada a los estáticos
 * (`./gradlew exportCv`).
 */
export function cvUrl(
  lang: CvLanguage, type: CvType, withPhoto = true, env: { mockMode: boolean; apiBaseUrl: string } = runtimeConfig,
): string {
  if (env.mockMode) {
    return `cv/${exportedName(lang, type, withPhoto)}.pdf`;
  }
  return `${env.apiBaseUrl}/public/cv/download?lang=${lang}&type=${type}${withPhoto || type === 'ats' ? '' : '&photo=false'}`;
}

/** Miniatura de la primera página. Siempre es la de la última exportación (`./gradlew exportCv`). */
export function cvPreviewUrl(lang: CvLanguage, type: CvType, withPhoto = true): string {
  return `cv/${exportedName(lang, type, withPhoto)}.png`;
}

/** Nombre de la copia exportada; la variante ATS no tiene versión con foto. */
function exportedName(lang: CvLanguage, type: CvType, withPhoto: boolean): string {
  return `cv-${lang}-${type}${withPhoto || type === 'ats' ? '' : '-nophoto'}`;
}

/** Hitos de la trayectoria en JSON, para quien prefiera leerlos por API; solo existe con backend. */
export function careerJsonUrl(): string | null {
  return runtimeConfig.mockMode ? null : `${runtimeConfig.apiBaseUrl}/public/career-timeline`;
}

/** Estado del selector de CV: lo abren los botones repartidos por la página y lo pinta un único modal. */
@Injectable({ providedIn: 'root' })
export class CvPickerService {
  readonly open = signal(false);
  /** Los CV maquetados se descargan con la foto de perfil o sin ella, según pida el proceso de selección. */
  readonly withPhoto = signal(true);
}

/** Botón que abre el selector de CV. */
@Component({
  selector: 'app-cv-download',
  standalone: true,
  host: { class: 'inline-block' },
  template: `
    <button type="button" [class]="classes[variant()]" aria-haspopup="dialog" (click)="picker.open.set(true)">
      <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
      {{ variant() === 'nav' ? 'CV' : 'Descargar CV' }}
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvDownloadComponent {
  readonly picker = inject(CvPickerService);
  /** `nav`: compacto, para la barra. `primary`: la acción principal del hero. `button`: secundario (pie). */
  readonly variant = input<'nav' | 'primary' | 'button'>('button');
  readonly classes = { nav: 'ui-btn-ghost', primary: 'ui-btn-primary ui-btn-lg', button: 'ui-btn-secondary ui-btn-lg' };
}

/**
 * Selector de CV: un modal con una tarjeta por formato, cada una con la miniatura real de su
 * primera página, para ver qué se descarga antes de bajarlo. Se monta una sola vez, en la raíz
 * de la página (dentro de la barra de navegación quedaría atrapado por su desenfoque).
 */
@Component({
  selector: 'app-cv-picker',
  standalone: true,
  imports: [FocusTrapDirective, AutofocusDirective],
  template: `
    @if (picker.open()) {
      <div class="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-canvas/70 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(6dvh,env(safe-area-inset-bottom))] pt-[max(6dvh,env(safe-area-inset-top))] backdrop-blur-sm" (click)="close()" (keydown.escape)="close()">
        <section
          appFocusTrap
          role="dialog"
          aria-modal="true"
          aria-labelledby="cv-picker-title"
          class="w-full max-w-4xl animate-scale-up rounded-card border border-line-subtle bg-surface-2/95 p-5 text-ink-1 shadow-2xl shadow-black/70 backdrop-blur-2xl sm:p-6"
          (click)="$event.stopPropagation()"
        >
          <header class="flex items-start justify-between gap-4">
            <div>
              <h2 id="cv-picker-title" class="text-xl font-semibold tracking-tight text-ink-1">Descargar CV</h2>
              <p class="mt-1 text-sm text-ink-2">Elige formato e idioma. Todos salen de la misma trayectoria que ves en esta página.</p>
            </div>
            <button type="button" appAutofocus class="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-2 transition hover:bg-surface-3 hover:text-ink-1" aria-label="Cerrar" (click)="close()">
              <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </header>

          <label class="mt-4 inline-flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-ink-1">
            <input type="checkbox" role="switch" class="peer sr-only" [checked]="picker.withPhoto()" (change)="picker.withPhoto.set($any($event.target).checked)" />
            <span class="relative h-6 w-10 rounded-full bg-surface-3 transition peer-checked:bg-accent-solid peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" aria-hidden="true"></span>
            Incluir foto de perfil
            <span class="text-xs text-ink-3">{{ picker.withPhoto() ? 'algunos procesos piden el CV sin foto' : 'CV sin foto' }}</span>
          </label>

          <ul class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            @for (option of designed; track option.lang + option.type) {
              <li>
                <a
                  class="focus-ring group block rounded-panel border border-line-subtle bg-surface-2 p-2.5 transition duration-300 ease-spring hover:-translate-y-1 hover:border-line-strong hover:bg-surface-2"
                  [href]="urlOf(option)"
                  [attr.download]="'cv-' + option.lang + '-' + option.type + '.pdf'"
                  [attr.hreflang]="option.lang"
                  [attr.aria-label]="'Descargar ' + option.label + ' en PDF' + (picker.withPhoto() ? '' : ', sin foto')"
                >
                  <span class="block overflow-hidden rounded-panel bg-white">
                    <img class="block aspect-[210/297] w-full object-cover object-top" [src]="previewOf(option)" alt="" loading="lazy" width="496" height="702" />
                  </span>
                  <span class="mt-2.5 block text-sm font-medium text-ink-1">{{ option.label }}</span>
                  <span class="block text-xs text-ink-2">{{ option.hint }}</span>
                  <span class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-solid px-3 py-1 text-xs font-medium text-accent-on transition group-hover:bg-accent-solid-hover">
                    <svg viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
                    PDF
                  </span>
                </a>
              </li>
            }
          </ul>

          <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-line-subtle pt-4">
            <p class="mr-1 text-xs text-ink-2">Para sistemas de selección (ATS), texto plano:</p>
            @for (option of ats; track option.lang) {
              <a class="focus-ring tap inline-flex items-center rounded-control border border-line-strong px-3 py-1 text-xs text-ink-1 transition hover:bg-surface-3" [href]="urlOf(option)" [attr.download]="'cv-' + option.lang + '-ats.pdf'" [attr.hreflang]="option.lang">
                {{ option.label }} <span class="text-ink-3">· {{ option.hint }}</span>
              </a>
            }
            @if (jsonUrl) {
              <a class="focus-ring tap inline-flex items-center rounded-control border border-line-strong px-3 py-1 font-mono text-xs text-ink-1 transition hover:bg-surface-3" [href]="jsonUrl" target="_blank" rel="noopener">JSON API</a>
            }
          </div>
          <p class="mt-3 text-xs leading-snug text-ink-3">
            {{ demo ? 'Modo demo: se descargan las copias exportadas del CV.' : 'El PDF se genera al momento desde la trayectoria publicada; la miniatura es de la última exportación.' }}
          </p>
        </section>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvPickerComponent {
  readonly picker = inject(CvPickerService);
  readonly designed = CV_DESIGNED;
  readonly ats = CV_ATS;
  readonly jsonUrl = careerJsonUrl();
  readonly demo = runtimeConfig.mockMode;

  urlOf(option: CvOption): string {
    return cvUrl(option.lang, option.type, this.picker.withPhoto());
  }

  previewOf(option: CvOption): string {
    return cvPreviewUrl(option.lang, option.type, this.picker.withPhoto());
  }

  close(): void {
    this.picker.open.set(false);
  }
}
