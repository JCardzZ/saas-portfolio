import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageService } from './language.service';

/**
 * `{{ 'Texto en español' | t }}`: en inglés devuelve su traducción de `EN` (cargada bajo
 * demanda por `LanguageService`); si no la hay o aún no ha llegado, el mismo texto. Es impuro para seguir al idioma (la consulta es una búsqueda en un objeto).
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(es: string): string {
    const dictionary = this.language.dictionary();
    return this.language.lang() === 'en' && dictionary ? (dictionary[es] ?? es) : es;
  }
}
