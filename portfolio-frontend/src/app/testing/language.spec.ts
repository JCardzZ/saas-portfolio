import { LanguageService } from '../core/i18n/language.service';

/**
 * El sitio arranca en inglés, pero los tests se escribieron contra los textos en español: parten
 * de español y sin elección guardada. El test del interruptor prueba el inglés de forma explícita.
 */
LanguageService.defaultLang = 'es';
beforeEach(() => {
  LanguageService.defaultLang = 'es';
  try {
    localStorage.removeItem('site-lang');
  } catch {
    // Sin almacenamiento no hay nada que limpiar.
  }
});
