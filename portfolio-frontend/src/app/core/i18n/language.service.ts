import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

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
 * refleja en `<html lang>`. Hoy traduce la estructura de la landing (barra, hero, cabeceras de
 * sección y pie); los widgets interiores siguen en español.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  /** Idioma sin elección guardada. Los tests lo fijan en español (`src/app/testing`). */
  static defaultLang: Lang = 'en';

  private readonly document = inject(DOCUMENT);
  readonly lang = signal<Lang>(stored() ?? LanguageService.defaultLang);

  constructor() {
    effect(() => {
      this.document.documentElement.lang = this.lang();
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
