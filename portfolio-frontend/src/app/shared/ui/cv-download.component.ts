import { ChangeDetectionStrategy, Component, Injectable, inject, input, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
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
  lang: CvLanguage, type: CvType, withPhoto = true, env: { mockMode: boolean; apiBaseUrl: string } = environment,
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
export const CAREER_JSON_URL = environment.mockMode ? null : `${environment.apiBaseUrl}/public/career-timeline`;

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
    <button
      type="button"
      class="focus-ring inline-flex items-center gap-2 rounded-full font-medium transition duration-300 ease-spring"
      [class]="variant() === 'nav' ? 'px-3 py-1.5 text-sm text-zinc-300 hover:text-white' : 'glass px-6 py-2.5 text-[15px] text-white hover:bg-white/10'"
      aria-haspopup="dialog"
      (click)="picker.open.set(true)"
    >
      <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
      {{ variant() === 'nav' ? 'CV' : 'Descargar CV' }}
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CvDownloadComponent {
  readonly picker = inject(CvPickerService);
  /** `nav`: enlace compacto para la barra. `button`: botón de vidrio para el hero y el pie. */
  readonly variant = input<'nav' | 'button'>('button');
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
      <div class="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-black/70 px-4 py-[6vh] backdrop-blur-sm" (click)="close()" (keydown.escape)="close()">
        <section
          appFocusTrap
          role="dialog"
          aria-modal="true"
          aria-labelledby="cv-picker-title"
          class="w-full max-w-4xl animate-scale-up rounded-3xl border border-white/10 bg-zinc-900/90 p-5 text-zinc-100 shadow-2xl shadow-black/70 backdrop-blur-2xl sm:p-6"
          (click)="$event.stopPropagation()"
        >
          <header class="flex items-start justify-between gap-4">
            <div>
              <h2 id="cv-picker-title" class="text-xl font-semibold tracking-tight text-white">Descargar CV</h2>
              <p class="mt-1 text-sm text-zinc-400">Elige formato e idioma. Todos salen de la misma trayectoria que ves en esta página.</p>
            </div>
            <button type="button" appAutofocus class="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar" (click)="close()">
              <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </header>

          <label class="mt-4 inline-flex cursor-pointer items-center gap-3 text-sm text-zinc-200">
            <input type="checkbox" role="switch" class="peer sr-only" [checked]="picker.withPhoto()" (change)="picker.withPhoto.set($any($event.target).checked)" />
            <span class="relative h-6 w-10 rounded-full bg-white/15 transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-white after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" aria-hidden="true"></span>
            Incluir foto de perfil
            <span class="text-xs text-zinc-500">{{ picker.withPhoto() ? 'algunos procesos piden el CV sin foto' : 'CV sin foto' }}</span>
          </label>

          <ul class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            @for (option of designed; track option.lang + option.type) {
              <li>
                <a
                  class="focus-ring group block rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 transition duration-300 ease-spring hover:-translate-y-1 hover:border-white/30 hover:bg-white/[0.07]"
                  [href]="urlOf(option)"
                  [attr.download]="'cv-' + option.lang + '-' + option.type + '.pdf'"
                  [attr.hreflang]="option.lang"
                  [attr.aria-label]="'Descargar ' + option.label + ' en PDF' + (picker.withPhoto() ? '' : ', sin foto')"
                >
                  <span class="block overflow-hidden rounded-xl bg-white">
                    <img class="block aspect-[210/297] w-full object-cover object-top" [src]="previewOf(option)" alt="" loading="lazy" width="496" height="702" />
                  </span>
                  <span class="mt-2.5 block text-sm font-medium text-white">{{ option.label }}</span>
                  <span class="block text-[11px] text-zinc-400">{{ option.hint }}</span>
                  <span class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white transition group-hover:bg-accent-hover">
                    <svg viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
                    PDF
                  </span>
                </a>
              </li>
            }
          </ul>

          <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            <p class="mr-1 text-xs text-zinc-400">Para sistemas de selección (ATS), texto plano:</p>
            @for (option of ats; track option.lang) {
              <a class="focus-ring rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-100 transition hover:bg-white/10" [href]="urlOf(option)" [attr.download]="'cv-' + option.lang + '-ats.pdf'" [attr.hreflang]="option.lang">
                {{ option.label }} <span class="text-zinc-500">· {{ option.hint }}</span>
              </a>
            }
            @if (jsonUrl) {
              <a class="focus-ring rounded-full border border-white/15 px-3 py-1 font-mono text-xs text-zinc-100 transition hover:bg-white/10" [href]="jsonUrl" target="_blank" rel="noopener">JSON API</a>
            }
          </div>
          <p class="mt-3 text-[11px] leading-snug text-zinc-500">
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
  readonly jsonUrl = CAREER_JSON_URL;
  readonly demo = environment.mockMode;

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
