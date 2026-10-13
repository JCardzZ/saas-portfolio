import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

import { TheaterDirective } from './theater.directive';

/**
 * Botón flotante que amplía o minimiza la tarjeta de diagrama que lo contiene (la que
 * lleva TheaterDirective). Es siempre el mismo botón, así que conserva el foco al alternar.
 */
@Component({
  selector: 'app-theater-toggle',
  standalone: true,
  imports: [TranslatePipe],
  host: { class: 'absolute right-3 top-3 z-10' },
  template: `
    <button
      type="button"
      class="focus-ring flex items-center justify-center rounded-control border border-line-subtle bg-surface-3 text-ink-2 backdrop-blur-md transition duration-300 ease-spring hover:bg-surface-3 hover:text-ink-1 active:scale-90"
      [class]="theater.expanded() ? 'h-11 w-11' : 'h-8 w-8'"
      [attr.aria-label]="(theater.expanded() ? ('Minimizar ' | t) : ('Ampliar a pantalla completa ' | t)) + name()"
      [attr.aria-expanded]="theater.expanded()"
      (click)="theater.toggle()"
    >
      <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        @if (theater.expanded()) {
          <path d="M8 3v5H3M12 17v-5h5M8 8 3.5 3.5M12 12l4.5 4.5" />
        } @else {
          <path d="M12 3h5v5M8 17H3v-5M17 3l-5.5 5.5M3 17l5.5-5.5" />
        }
      </svg>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TheaterToggleComponent implements OnInit {
  readonly theater = inject(TheaterDirective);
  readonly name = input.required<string>();

  ngOnInit(): void {
    this.theater.label.set(this.name());
  }
}
