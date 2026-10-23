import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { provideApi } from '../../../core/api';
import { LanguageService } from '../../../core/i18n/language.service';
import { CareerTimelineComponent, periodLength } from './career-timeline.component';

describe('CareerTimelineComponent', () => {
  const url = `${environment.apiBaseUrl}/public/career-timeline`;
  let fixture: ComponentFixture<CareerTimelineComponent>;
  let element: HTMLElement;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApi(environment.apiBaseUrl)],
    });
    fixture = TestBed.createComponent(CareerTimelineComponent);
    element = fixture.nativeElement;
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => backend.verify());
  /** La petición de la trayectoria en un idioma (la URL lleva `?lang=`). */
  const timeline = (lang = 'es') => backend.expectOne((request) => request.url === url && request.params.get('lang') === lang);

  it('marks the current role and the education on the timeline, and previews closed rows', () => {
    timeline().flush([
      { period: '2024 - actualidad', title: 'Puesto actual', role: 'Backend Developer', organization: 'Acme', summary: 'Lo que hago hoy.' },
      { period: '2023', title: 'Ingeniería', organization: 'Universidad', summary: 'Título universitario.' },
    ]);
    fixture.detectChanges();

    const rows = Array.from(element.querySelectorAll<HTMLElement>('li.row'));
    expect(rows[0].classList).toContain('current');
    expect(rows[0].querySelector('.now')?.textContent?.trim()).toBe('Actual');
    expect(rows[1].classList).toContain('education');
    expect(rows[1].classList).not.toContain('current');
    expect(rows[1].querySelector('.node svg')).not.toBeNull();
    // El actual viene abierto (sin vista previa); el cerrado enseña una línea de su resumen.
    expect(rows[0].querySelector('.preview')).toBeNull();
    expect(rows[1].querySelector('.preview')?.textContent).toBe('Título universitario.');
  });

  it('renders one compact row per milestone, in order, with optional fields only when present', () => {
    timeline().flush([
      { period: '2023 - 2025', title: 'Plataforma de pagos', role: 'Staff Engineer', organization: 'Acme', technologies: ['Java 21', 'Kotlin'], summary: 'Rediseño del núcleo.' },
      { period: '2020', title: 'Primer hito', summary: 'Solo lo obligatorio.' },
    ]);
    fixture.detectChanges();

    const rows = Array.from(element.querySelectorAll<HTMLElement>('li.row'));
    expect(rows.map((row) => row.querySelector('.title')?.textContent)).toEqual(['Plataforma de pagos', 'Primer hito']);
    expect(rows[0].querySelector('.period')!.textContent).toBe('2023 - 2025');
    expect(rows[0].querySelector('.meta')!.textContent).toContain('Staff Engineer · Acme');
    // Java lleva su logo; Kotlin no está en el registro y se muestra solo con texto.
    expect(rows[0].querySelectorAll('.chip').length).toBe(2);
    expect(rows[0].querySelectorAll('.chips app-tech-icon').length).toBe(1);
    expect(rows[0].querySelectorAll('.stack app-tech-icon').length).toBe(1);
    expect(rows[1].querySelector('.chips')).toBeNull();
    expect(rows[1].querySelector('.meta')).toBeNull();
  });

  it('opens the current position and lets each row expand and collapse, as an accessible accordion', () => {
    timeline().flush([
      { period: '2024 - actualidad', title: 'Actual', summary: 'Lo de ahora.' },
      { period: '2020', title: 'Anterior', summary: 'Lo de antes.' },
    ]);
    fixture.detectChanges();
    const heads = Array.from(element.querySelectorAll<HTMLButtonElement>('h3 > button'));
    const detail = (index: number) => element.querySelector<HTMLElement>(`#career-detail-${index}`)!;

    expect(heads.map((head) => head.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
    expect(detail(0).hidden).toBeFalse();
    // El detalle cerrado sigue en la página (para buscadores y lectores), solo oculto.
    expect(detail(1).hidden).toBeTrue();
    expect(detail(1).textContent).toContain('Lo de antes.');
    expect(heads[1].getAttribute('aria-controls')).toBe('career-detail-1');

    heads[1].click();
    heads[0].click();
    fixture.detectChanges();
    expect(heads.map((head) => head.getAttribute('aria-expanded'))).toEqual(['false', 'true']);
    expect(detail(1).hidden).toBeFalse();
  });

  it('shows a neutral message while no milestone has been published', () => {
    timeline().flush([]);
    fixture.detectChanges();

    expect(element.querySelector('li.row')).toBeNull();
    expect(element.textContent).toContain('se publicará aquí próximamente');
  });

  it('offers a retry when the API fails', () => {
    timeline().flush({ detail: 'Servicio no disponible' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Servicio no disponible');

    element.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    timeline().flush([{ period: '2024', title: 'Recuperado', summary: 'ok' }]);
    fixture.detectChanges();

    expect(element.querySelector('.title')?.textContent).toBe('Recuperado');
  });

  it('asks for the timeline in the language of the page and again when it changes', () => {
    timeline('es').flush([{ period: '2024 - actualidad', title: 'Modernización', summary: 'Resumen.' }]);
    fixture.detectChanges();

    TestBed.inject(LanguageService).lang.set('en');
    fixture.detectChanges();
    timeline('en').flush([{ period: '2024 - present', title: 'Modernisation', summary: 'Summary.' }]);
    fixture.detectChanges();

    expect(element.querySelector('.title')?.textContent).toBe('Modernisation');
    TestBed.inject(LanguageService).lang.set('es');
    fixture.detectChanges();
    timeline('es').flush([]);
  });

  it('splits the summary into points and shows how long each role lasted', () => {
    timeline().flush([
      { period: 'may 2022 - ene 2024', title: 'Integración', role: 'Desarrollador', organization: 'Banco', summary: 'Primera frase con p. ej. una abreviatura. Segunda frase. Tercera frase.' },
      { period: '2018 - 2022', title: 'Título', organization: 'Universidad', summary: 'Una sola frase.' },
    ]);
    fixture.detectChanges();
    const rows = Array.from(element.querySelectorAll<HTMLElement>('li.row'));

    expect(Array.from(rows[0].querySelectorAll('.highlights li')).map((li) => li.textContent?.trim()))
      .toEqual(['Primera frase con p. ej. una abreviatura.', 'Segunda frase.', 'Tercera frase.']);
    expect(rows[0].querySelector('.duration')?.textContent?.trim()).toBe('1 año 9 meses');
    // Una sola frase va como párrafo; solo años: sin duración inventada.
    expect(rows[1].querySelector('.highlights')).toBeNull();
    expect(periodLength('2018 - 2022', false)).toBeNull();
    expect(periodLength('ene 2024 - actualidad', false, new Date(2026, 9, 23))).toBe('2 años 10 meses');
    expect(periodLength('Jun 2019 - Dec 2019', true)).toBe('7 mos');
  });
});
