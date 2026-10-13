import { TestBed } from '@angular/core/testing';

import { LanguageSwitchComponent } from './language-switch.component';
import { LanguageService } from './language.service';

describe('LanguageService', () => {
  it('cambia de idioma, lo refleja en <html lang> y lo recuerda', () => {
    const fixture = TestBed.createComponent(LanguageSwitchComponent);
    fixture.detectChanges();
    const service = TestBed.inject(LanguageService);
    expect(service.lang()).toBe('es');

    (fixture.nativeElement.querySelector('[data-testid="language-switch"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    TestBed.flushEffects();

    expect(service.lang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('site-lang')).toBe('en');
    expect(service.t({ en: 'Projects', es: 'Proyectos' })).toBe('Projects');
  });

  it('arranca en inglés si no hay elección guardada', () => {
    LanguageService.defaultLang = 'en';
    expect(TestBed.inject(LanguageService).lang()).toBe('en');
  });
});
