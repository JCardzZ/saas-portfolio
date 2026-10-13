import { Injectable, computed, signal } from '@angular/core';

/** `system` sigue al sistema; `light` y `dark` lo fijan. */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'site-theme';
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

/**
 * Tema de la vista pública. Los colores son variables CSS (design-tokens.js): elegir tema solo
 * pone `data-theme` en <html>, o lo quita para seguir al sistema. La elección se recuerda en este
 * navegador; si no se puede guardar, dura lo que la página.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>(readChoice());
  /** El tema que se ve ahora, contando con el del sistema. */
  readonly effective = computed<'light' | 'dark'>(() => {
    const choice = this.choice();
    if (choice !== 'system') {
      return choice;
    }
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  constructor() {
    apply(this.choice());
  }

  set(choice: ThemeChoice): void {
    this.choice.set(choice);
    apply(choice);
    try {
      if (choice === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, choice);
      }
    } catch {
      // Sin almacenamiento la elección dura lo que la página.
    }
  }

  /** Sistema → claro → oscuro → sistema. */
  next(): void {
    this.set(ORDER[(ORDER.indexOf(this.choice()) + 1) % ORDER.length]);
  }
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }
}
