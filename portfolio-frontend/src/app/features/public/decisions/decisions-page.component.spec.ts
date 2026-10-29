import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { LanguageService } from '../../../core/i18n/language.service';
import { ADRS, matchesQuery, relatedAdrs, statusTone } from './decisions';
import { DecisionsPageComponent } from './decisions-page.component';

describe('decisions data', () => {
  it('has every ADR in both languages with its five sections and evidence', () => {
    expect(ADRS.length).toBeGreaterThanOrEqual(9);
    for (const adr of ADRS) {
      for (const lang of ['es', 'en'] as const) {
        expect(adr[lang].title).withContext(`${adr.number} ${lang}`).toBeTruthy();
        expect(adr[lang].costs).withContext(`${adr.number} ${lang}: sin coste no está terminada`).toBeTruthy();
        const { context, options, decision, revisit } = adr[lang].sections;
        expect([context, options, decision, revisit, adr[lang].gainsDetail, adr[lang].costsDetail].every(Boolean)).withContext(`${adr.number} ${lang}`).toBeTrue();
      }
      expect(adr.evidence.length).withContext(adr.number).toBeGreaterThan(0);
    }
  });

  it('searches without accents and links the ADRs cited in the text', () => {
    const cloudRun = ADRS.find((adr) => adr.slug === 'cloud-run-escala-a-cero')!;
    expect(matchesQuery(cloudRun, cloudRun.es, 'Infraestructura', 'facturacion')).toBeTrue();
    expect(matchesQuery(cloudRun, cloudRun.es, 'Infraestructura', 'kafka')).toBeFalse();
    expect(relatedAdrs(cloudRun, cloudRun.es).map((adr) => adr.number)).toContain('0004');
    expect(statusTone('Aceptada')).toBe('ok');
    expect(statusTone('Accepted')).toBe('ok');
  });
});

describe('DecisionsPageComponent', () => {
  const params = new BehaviorSubject(convertToParamMap({}));

  function render(slug?: string) {
    params.next(convertToParamMap(slug ? { slug } : {}));
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { paramMap: params } }] });
    TestBed.inject(LanguageService).set('es');
    const fixture = TestBed.createComponent(DecisionsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  const $$ = (root: HTMLElement, selector: string) => Array.from(root.querySelectorAll<HTMLElement>(selector));

  it('lists every decision and filters by area and by search', () => {
    const fixture = render();
    const element: HTMLElement = fixture.nativeElement;
    expect($$(element, '[data-testid="adr-list"] li').length).toBe(ADRS.length);

    const infra = $$(element, '[data-testid="adr-filters"] button').find((button) => button.textContent!.includes('Infraestructura'))!;
    infra.click();
    fixture.detectChanges();
    expect($$(element, '[data-testid="adr-list"] li').length).toBe(ADRS.filter((adr) => adr.area === 'infrastructure').length);
    expect(infra.getAttribute('aria-pressed')).toBe('true');

    infra.click();
    const search = element.querySelector<HTMLInputElement>('[data-testid="adr-search"]')!;
    search.value = 'pgvector';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect($$(element, '[data-testid="adr-list"] li').map((item) => item.textContent).join(' ')).toContain('pgvector');
  });

  it('shows one decision with its options, trade-offs, revisit trigger, evidence and neighbours', () => {
    const fixture = render('pgvector-en-postgresql');
    const element: HTMLElement = fixture.nativeElement;
    const detail = element.querySelector('[data-testid="adr-detail"]')!;
    expect(detail.textContent).toContain('ADR-0005');
    expect(detail.querySelector('.adr-options table')).not.toBeNull();
    expect(detail.textContent).toContain('Gana');
    expect(detail.textContent).toContain('Cuesta');
    expect(detail.textContent).toContain('Cuándo revisarla');
    expect(detail.querySelector<HTMLAnchorElement>('a[href*="PgVectorRepositoryAdapter.java"]')).not.toBeNull();
    expect(detail.textContent).toContain('Anterior');
    expect(detail.textContent).toContain('Siguiente');
  });

  it('says so for an unknown decision, and follows the site language', () => {
    expect((render('no-existe').nativeElement as HTMLElement).textContent).toContain('Esa decisión no existe.');
    TestBed.resetTestingModule();
    const fixture = render('arquitectura-hexagonal');
    TestBed.inject(LanguageService).set('en');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Hexagonal architecture with its rules enforced by ArchUnit');
  });
});
