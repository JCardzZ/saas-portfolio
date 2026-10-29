import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { VersionBump, versionBump } from '../../core/release/release';

const BUMP_LABEL: Record<VersionBump, string> = { major: 'MAJOR', minor: 'MINOR', patch: 'PATCH' };
const BUMP_INDEX: Record<VersionBump, number> = { major: 0, minor: 1, patch: 2 };

/**
 * Una versión SemVer con la parte que subió resaltada (`v1.`**`4`**`.0` · MINOR), para leer de un
 * vistazo qué tipo de cambio fue. `size="lg"` en la tarjeta de Delivery; `sm` en el popover.
 */
@Component({
  selector: 'app-version-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-baseline gap-2', '[attr.aria-label]': 'label()' },
  template: `
    <span class="font-mono font-semibold tracking-tight" [class]="size() === 'lg' ? 'text-4xl' : 'text-base'" aria-hidden="true">
      <span class="text-ink-3">v</span>@for (segment of parts().segments; track $index; let last = $last) {<span
        [class]="$index === changed() ? 'text-accent-text' : 'text-ink-1'" [attr.data-bumped]="$index === changed() ? '' : null">{{ segment }}</span>@if (!last) {<span class="text-ink-3">.</span>}}
    </span>
    @if (parts().bump; as bump) {
      <span class="rounded-full border border-accent-text/40 px-1.5 font-mono text-xs leading-[18px] text-accent-text" aria-hidden="true" data-testid="version-bump">{{ bumpLabel[bump] }}</span>
    }
  `,
})
export class VersionMarkComponent {
  readonly version = input.required<string>();
  readonly previous = input<string | null>(null);
  readonly size = input<'sm' | 'lg'>('sm');

  readonly bumpLabel = BUMP_LABEL;
  readonly parts = computed(() => versionBump(this.version(), this.previous()));
  readonly changed = computed(() => { const bump = this.parts().bump; return bump ? BUMP_INDEX[bump] : -1; });
  /** Para el lector de pantalla: «v1.4.0, MINOR». */
  readonly label = computed(() => { const bump = this.parts().bump; return bump ? `${this.version()}, ${BUMP_LABEL[bump]}` : this.version(); });
}
