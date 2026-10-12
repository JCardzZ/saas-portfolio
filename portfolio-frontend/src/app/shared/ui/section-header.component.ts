import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Cabecera de sección (docs/DESIGN.md §8.3): título y una frase de entrada, con un sobretítulo opcional. `headingId` es el id
 * del título, al que apunta el `aria-labelledby` de la sección.
 */
@Component({
  selector: 'app-section-header',
  standalone: true,
  host: { class: 'mb-8 block' },
  template: `
    @if (overline(); as text) {
      <p class="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3" data-testid="section-overline">{{ text }}</p>
    }
    <h2 [id]="headingId()" class="text-title-1-sm text-ink-1 sm:text-title-1">{{ title() }}</h2>
    <p class="mt-3 max-w-[40rem] text-body text-ink-2 sm:text-body-lg">{{ intro() }}</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionHeaderComponent {
  readonly headingId = input.required<string>();
  readonly title = input.required<string>();
  readonly intro = input.required<string>();
  /** Línea corta encima del título, cuando la sección pertenece a algo con nombre propio. */
  readonly overline = input<string>();
}
