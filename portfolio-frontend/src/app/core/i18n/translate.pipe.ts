import { Pipe, PipeTransform, inject } from '@angular/core';

import { EN } from './en';
import { LanguageService } from './language.service';

/**
 * `{{ 'Texto en español' | t }}`: en inglés devuelve su traducción de `EN`; si no la hay, el
 * mismo texto. Es impuro para seguir al idioma (la consulta es una búsqueda en un objeto).
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(es: string): string {
    return this.language.lang() === 'en' ? (EN[es] ?? es) : es;
  }
}
