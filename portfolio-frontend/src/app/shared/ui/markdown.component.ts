import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Marked } from 'marked';

const markdown = new Marked({
  gfm: true,
  breaks: true,
  hooks: {
    // Los enlaces de una respuesta generada se abren fuera de la aplicación.
    postprocess: (html) => html.replaceAll('<a ', '<a target="_blank" rel="noopener noreferrer" '),
  },
});

/**
 * Renderiza Markdown. El HTML resultante pasa por el saneador de Angular ([innerHTML]),
 * que elimina scripts, manejadores de eventos y URLs peligrosas: nunca usar bypassSecurityTrust aquí.
 * Los estilos están en styles.css (.markdown), porque el contenido inyectado no recibe estilos del componente.
 */
@Component({
  selector: 'app-markdown',
  standalone: true,
  template: '<div class="markdown" [innerHTML]="html()"></div>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownComponent {
  readonly text = input.required<string>();

  readonly html = computed(() => markdown.parse(this.text(), { async: false }));
}
