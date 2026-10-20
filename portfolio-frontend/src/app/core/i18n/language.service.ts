import { Injectable, effect, inject, signal, DOCUMENT } from '@angular/core';

export type Lang = 'en' | 'es';

/** Un texto en los dos idiomas del sitio público. */
export interface Localized {
  en: string;
  es: string;
}

const STORAGE_KEY = 'site-lang';

function stored(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'en' || value === 'es' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Idioma del sitio público (inglés por defecto). La elección se recuerda en `localStorage` y se
 * refleja en `<html lang>`. Traduce la landing y sus widgets; la trayectoria se pide a la API en el
 * idioma elegido. Lo que no se traduce son datos reales (mensajes de commit, nombres de jobs de CI).
 * `en-coverage.spec.ts` exige traducción para lo que el Estudio pinta de sus datos.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  /** Idioma sin elección guardada. Los tests lo fijan en español (`src/app/testing`). */
  static defaultLang: Lang = 'en';

  private readonly document = inject(DOCUMENT);
  readonly lang = signal<Lang>(stored() ?? LanguageService.defaultLang);
  /**
   * Traducciones al inglés de los textos de las secciones (`en.ts`). Se piden con `import()` la
   * primera vez que hace falta el inglés: no pesan en el arranque. Mientras llegan, el pipe `t`
   * deja el español.
   */
  readonly dictionary = signal<Readonly<Record<string, string>> | null>(null);

  constructor() {
    effect(() => {
      this.document.documentElement.lang = this.lang();
      if (this.lang() === 'en' && !this.dictionary()) {
        void import('./en').then(({ EN }) => this.dictionary.set(EN));
      }
    });
  }

  set(lang: Lang): void {
    this.lang.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Sin almacenamiento la elección dura lo que la página.
    }
  }

  toggle(): void {
    this.set(this.lang() === 'en' ? 'es' : 'en');
  }

  t(text: Localized): string {
    return text[this.lang()];
  }
}
