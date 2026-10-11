import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Cabecera de sección (docs/DESIGN.md §8.3): título y una frase de entrada. `headingId` es el id
 * del título, al que apunta el `aria-labelledby` de la sección.
 */
@Component({
  selector: 'app-section-header',
  standalone: true,
  host: { class: 'mb-8 block' },
  template: `
    <h2 [id]="headingId()" class="text-title-1-sm text-ink-1 sm:text-title-1">{{ title() }}</h2>
    <p class="mt-3 max-w-[40rem] text-body text-ink-2 sm:text-body-lg">{{ intro() }}</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionHeaderComponent {
  readonly headingId = input.required<string>();
  readonly title = input.required<string>();
  readonly intro = input.required<string>();
}
