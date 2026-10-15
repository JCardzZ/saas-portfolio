import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LanguageService } from '../../../core/i18n/language.service';
import { LEGAL_SECTIONS, LegalPageComponent } from './legal-page.component';

describe('LegalPageComponent', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [LegalPageComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(LegalPageComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('says who processes the AI questions, what is simulated and that templates are fictional', () => {
    const { element } = render();
    const text = element.textContent!;

    expect(element.querySelector('h1')!.textContent).toContain('Aviso legal y privacidad');
    expect(text).toContain('Google Gemini');
    expect(text).toContain('No escribas datos personales');
    expect(text).toContain('escenarios ficticios');
    expect(text).toContain('no implican afiliación');
    expect(text).toContain('Sin cookies de terceros');
    expect(element.querySelectorAll('section').length).toBe(LEGAL_SECTIONS.length);
  });

  it('has every section in both languages and an index that links to it', () => {
    for (const section of LEGAL_SECTIONS) {
      expect(section.title.en).withContext(section.id).toBeTruthy();
      for (const paragraph of section.paragraphs) {
        expect(paragraph.en.length).withContext(section.id).toBeGreaterThan(0);
        expect(paragraph.es.length).withContext(section.id).toBeGreaterThan(0);
      }
    }
    const { element, fixture } = render();
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('nav a')).map((link) => link.getAttribute('href'));
    expect(links).toEqual(LEGAL_SECTIONS.map((section) => `#${section.id}`));

    TestBed.inject(LanguageService).set('en');
    fixture.detectChanges();
    expect(element.querySelector('h1')!.textContent).toContain('Legal notice and privacy');
    TestBed.inject(LanguageService).set('es');
  });
});
