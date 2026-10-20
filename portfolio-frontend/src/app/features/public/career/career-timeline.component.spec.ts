import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { provideApi } from '../../../core/api';
import { LanguageService } from '../../../core/i18n/language.service';
import { CareerTimelineComponent } from './career-timeline.component';

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
});
