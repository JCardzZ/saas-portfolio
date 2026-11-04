import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

import { TheaterDirective } from './theater.directive';

/**
 * Botón flotante que amplía o minimiza la tarjeta de diagrama que lo contiene (la que
 * lleva TheaterDirective). Es siempre el mismo botón, así que conserva el foco al alternar.
 */
@Component({
    selector: 'app-theater-toggle',
    imports: [TranslatePipe],
    host: { class: 'absolute right-3 top-3 z-10 flex items-center gap-2' },
    template: `
    @if (theater.expanded()) {
      <!-- Pista breve con ratón y teclado: aparece al ampliar y se va sola. -->
      <span class="theater-hint pointer-events-none hidden items-center gap-1.5 rounded-full border border-line-subtle bg-surface-2 px-2.5 py-1 text-xs text-ink-2 shadow-floating [@media(hover:hover)]:inline-flex" aria-hidden="true">
        <kbd class="rounded border border-line-strong bg-surface-3 px-1.5 font-mono text-[0.6875rem] text-ink-1">Esc</kbd>{{ 'para salir' | t }}
      </span>
    }
    <!-- El botón viaja por su cuenta en la transición: de la esquina de la tarjeta a la de la pantalla. -->
    <button
      type="button"
      data-theater-part
      class="focus-ring flex items-center justify-center rounded-control border border-line-subtle bg-surface-3 text-ink-2 backdrop-blur-md transition duration-300 ease-spring hover:bg-surface-3 hover:text-ink-1 active:scale-90"
      [class]="theater.expanded() ? 'h-11 w-11' : 'h-8 w-8'"
      [attr.aria-label]="(theater.expanded() ? ('Minimizar ' | t) : ('Ampliar a pantalla completa ' | t)) + name()"
      [attr.aria-expanded]="theater.expanded()"
      (click)="pressed.set(true); theater.toggle()"
    >
      <!-- Una vuelta corta al cambiar de icono: el botón responde al gesto. -->
      <svg viewBox="0 0 20 20" class="theater-icon h-4 w-4" [class.theater-icon-in]="pressed() && theater.expanded()" [class.theater-icon-out]="pressed() && !theater.expanded()" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        @if (theater.expanded()) {
          <path d="M8 3v5H3M12 17v-5h5M8 8 3.5 3.5M12 12l4.5 4.5" />
        } @else {
          <path d="M12 3h5v5M8 17H3v-5M17 3l-5.5 5.5M3 17l5.5-5.5" />
        }
      </svg>
    </button>
  `,
    styles: `
    .theater-hint { animation: theater-hint 3.2s cubic-bezier(0.32, 0.72, 0, 1) 0.35s both; }
    @keyframes theater-hint {
      0% { opacity: 0; transform: translateY(-4px) scale(0.96); }
      8%, 82% { opacity: 1; transform: none; }
      100% { opacity: 0; transform: translateY(-2px); }
    }
    .theater-icon-in { animation: theater-icon-in 320ms cubic-bezier(0.32, 0.72, 0, 1); }
    .theater-icon-out { animation: theater-icon-out 320ms cubic-bezier(0.32, 0.72, 0, 1); }
    @keyframes theater-icon-in { from { transform: rotate(-90deg) scale(0.6); opacity: 0.4; } }
    @keyframes theater-icon-out { from { transform: rotate(90deg) scale(0.6); opacity: 0.4; } }
    @media (prefers-reduced-motion: reduce) {
      .theater-hint, .theater-icon-in, .theater-icon-out { animation: none; }
      .theater-hint { opacity: 0; }
    }
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TheaterToggleComponent implements OnInit {
  readonly theater = inject(TheaterDirective);
  readonly name = input.required<string>();
  /** El icono solo gira tras pulsar el botón, no al cargar la página. */
  readonly pressed = signal(false);

  ngOnInit(): void {
    this.theater.label.set(this.name());
  }
}
