import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { LanguageService } from './language.service';

/**
 * Interruptor EN / ES: una pista con un indicador que se desliza bajo el idioma activo. Es un
 * solo botón (`role="switch"`): pulsarlo, o Intro y Espacio, cambia de idioma.
 */
@Component({
  selector: 'app-language-switch',
  standalone: true,
  template: `
    <button
      type="button"
      role="switch"
      class="lang-switch ui-focus"
      data-testid="language-switch"
      [attr.aria-checked]="language.lang() === 'es'"
      [attr.aria-label]="language.lang() === 'en' ? 'Language: English. Cambiar a español' : 'Idioma: español. Switch to English'"
      (click)="language.toggle()"
    >
      <span class="lang-thumb" [class.lang-thumb-es]="language.lang() === 'es'" aria-hidden="true"></span>
      <span class="lang-option" [class.lang-option-on]="language.lang() === 'en'" aria-hidden="true">EN</span>
      <span class="lang-option" [class.lang-option-on]="language.lang() === 'es'" aria-hidden="true">ES</span>
    </button>
  `,
  styles: `
    .lang-switch {
      position: relative;
      display: inline-grid;
      grid-template-columns: 1fr 1fr;
      align-items: center;
      height: 2rem;
      padding: 0.1875rem;
      border: 1px solid var(--border-subtle);
      border-radius: 999px;
      background: var(--bg-surface-1);
      font-family: var(--font-mono);
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      transition: border-color var(--duration-fast) var(--ease-standard);
    }
    .lang-switch:hover { border-color: var(--border-strong); }
    .lang-option {
      position: relative;
      z-index: 1;
      min-width: 2rem;
      padding: 0 0.5rem;
      text-align: center;
      color: var(--text-3);
      transition: color var(--duration-base) var(--ease-standard);
    }
    .lang-option-on { color: rgb(var(--c-accent-on)); font-weight: 600; }
    .lang-thumb {
      position: absolute;
      inset: 0.1875rem auto 0.1875rem 0.1875rem;
      width: calc(50% - 0.1875rem);
      border-radius: 999px;
      background: rgb(var(--c-accent-solid));
      box-shadow: 0 0 12px rgb(var(--c-accent-solid) / 0.35);
      transition: transform var(--duration-base) var(--ease-emphasized);
    }
    .lang-thumb-es { transform: translateX(100%); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSwitchComponent {
  readonly language = inject(LanguageService);
}
