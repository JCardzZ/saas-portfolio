import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { provideApi } from '../../../core/api';
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

  it('renders the milestones from the API in order, with optional fields only when present', () => {
    backend.expectOne(url).flush([
      { period: '2023 - 2025', title: 'Plataforma de pagos', role: 'Staff Engineer', organization: 'Acme', technologies: ['Java 21', 'Kotlin'], summary: 'Rediseño del núcleo.' },
      { period: '2020', title: 'Primer hito', summary: 'Solo lo obligatorio.' },
    ]);
    fixture.detectChanges();

    const cards = Array.from(element.querySelectorAll('article'));
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual(['Plataforma de pagos', 'Primer hito']);
    expect(cards[0].textContent).toContain('2023 - 2025');
    expect(cards[0].textContent).toContain('Staff Engineer · Acme');
    // Java lleva su logo; Kotlin no está en el registro y se muestra solo con texto.
    expect(cards[0].querySelectorAll('li').length).toBe(2);
    expect(cards[0].querySelectorAll('app-tech-icon').length).toBe(1);
    expect(cards[1].querySelector('ul')).toBeNull();
    expect(cards[1].textContent).not.toContain('·');
  });

  it('shows a neutral message while no milestone has been published', () => {
    backend.expectOne(url).flush([]);
    fixture.detectChanges();

    expect(element.querySelector('article')).toBeNull();
    expect(element.textContent).toContain('se publicará aquí próximamente');
  });

  it('offers a retry when the API fails', () => {
    backend.expectOne(url).flush({ detail: 'Servicio no disponible' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Servicio no disponible');

    element.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    backend.expectOne(url).flush([{ period: '2024', title: 'Recuperado', summary: 'ok' }]);
    fixture.detectChanges();

    expect(element.querySelector('h3')?.textContent).toBe('Recuperado');
  });
});
