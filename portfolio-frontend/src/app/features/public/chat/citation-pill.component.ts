import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { AIQueryResponseCitationsInner } from '../../../core/api';

const CMS_LABELS: Record<string, string> = {
  projects: 'CMS · Proyecto',
  technologies: 'CMS · Tecnología',
  articles: 'Blog · Artículo',
};

/** Fuente de una respuesta: una píldora que se despliega para mostrar el fragmento citado. */
@Component({
  selector: 'app-citation-pill',
  standalone: true,
  host: { class: 'block max-w-full', '[class.w-full]': 'expanded()' },
  template: `
    <button
      type="button"
      class="focus-ring inline-flex max-w-full items-center gap-1.5 rounded-control border border-line-strong bg-surface-3 px-3 py-1 text-xs font-medium text-ink-1 backdrop-blur-md transition duration-300 ease-spring hover:bg-surface-3"
      [attr.aria-expanded]="expanded()"
      (click)="expanded.set(!expanded())"
    >
      <span class="h-1.5 w-1.5 shrink-0 rounded-full" [class]="isCms() ? 'bg-status-ok' : 'bg-accent-solid'"></span>
      <span class="truncate">{{ label() }}</span>
      @if (citation().lineNumberRange) {
        <span class="shrink-0 text-ink-2">L{{ citation().lineNumberRange }}</span>
      }
    </button>

    <!-- La transición de 0fr a 1fr anima la altura sin conocerla de antemano. -->
    <div
      class="grid transition-[grid-template-rows,opacity] duration-500 ease-spring"
      [class]="expanded() ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
      [attr.inert]="expanded() ? null : ''"
    >
      <div class="overflow-hidden">
        <div class="mt-2 overflow-hidden rounded-panel border border-line-subtle bg-surface-2">
          <p class="border-b border-line-subtle px-3 py-2 font-mono text-xs text-ink-2">
            {{ citation().filePath }}
            @if (citation().lineNumberRange) {
              <span> · líneas {{ citation().lineNumberRange }}</span>
            }
          </p>
          <pre class="max-h-56 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-ink-1">{{
            citation().codeSnippet
          }}</pre>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CitationPillComponent {
  readonly citation = input.required<AIQueryResponseCitationsInner>();
  readonly expanded = signal(false);

  readonly isCms = computed(() => (this.citation().filePath ?? '').startsWith('cms/'));

  /** Nombre corto: el archivo sin su ruta, o el tipo de contenido si viene del CMS. */
  readonly label = computed(() => {
    const segments = (this.citation().filePath ?? '').split('/');
    if (this.isCms()) {
      return CMS_LABELS[segments[1]] ?? 'CMS';
    }
    return segments[segments.length - 1] || 'Fuente';
  });
}
