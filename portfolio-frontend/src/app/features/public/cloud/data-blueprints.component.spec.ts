import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { ArchitectureStudioService } from './architecture-studio.service';
import { BlueprintLoad } from './data-blueprints';
import { DataBlueprintsComponent } from './data-blueprints.component';

describe('DataBlueprintsComponent', () => {
  function create() {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const studio = TestBed.inject(ArchitectureStudioService);
    const requested: BlueprintLoad[] = [];
    studio.blueprintRequests.subscribe((load) => requested.push(load));
    const fixture = TestBed.createComponent(DataBlueprintsComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const card = (id: string) => element.querySelector<HTMLElement>(`[data-blueprint="${id}"]`)!;
    const button = (id: string, text: string) =>
      Array.from(card(id).querySelectorAll('button')).find((candidate) => candidate.textContent!.trim() === text)!;
    return { fixture, element, studio, requested, card, button };
  }

  it('shows one card per blueprint with its thumbnail, problem, trade-off and load button', () => {
    const { element, card } = create();
    expect(Array.from(element.querySelectorAll('li h4')).map((title) => title.textContent)).toEqual([
      'CDC en tiempo real', 'Analítica por eventos', 'Recuperación multirregión',
    ]);
    const cdc = card('cdc-realtime');
    expect(cdc.querySelector('svg')!.getAttribute('aria-label')).toBe('Diagrama en miniatura: OLTP → CDC → almacén de datos');
    expect(cdc.querySelectorAll('svg rect[rx="12"]').length).toBe(8);
    expect(cdc.querySelectorAll('svg line[stroke-dasharray]').length).toBe(2);
    expect(Array.from(cdc.querySelectorAll('dt')).map((term) => term.textContent)).toEqual(['Problema', 'Trade-off', 'En AWS']);
    expect(cdc.textContent).toContain('v1');
    expect(cdc.querySelector('button')!.textContent!.trim()).toBe('Cargar en el lienzo');
  });

  it('names the data pieces of each pattern in the cloud of the canvas', () => {
    const { fixture, studio, card } = create();
    const services = (id: string) => card(id).querySelector('dl div:last-child dd')!.textContent;
    expect(services('cdc-realtime')).toBe('RDS PostgreSQL → Database Migration Service → Redshift');
    studio.activeProvider.set('azure');
    fixture.detectChanges();
    expect(card('cdc-realtime').querySelector('dl div:last-child dt')!.textContent).toBe('En Azure');
    expect(services('cdc-realtime')).toBe('PostgreSQL Flexible → Data Factory (CDC) → Synapse Analytics');
    expect(services('multi-region-recovery')).toBe('Azure SQL Database (failover groups) → Azure SQL Database (failover groups)');
  });

  it('asks whether to replace or add when the canvas already has content', () => {
    const { fixture, requested, card, button } = create();
    button('event-analytics', 'Cargar en el lienzo').click();
    fixture.detectChanges();
    expect(requested).toEqual([]);
    expect(card('event-analytics').textContent).toContain('El lienzo ya tiene contenido');
    // Solo pregunta la tarjeta pulsada.
    expect(card('cdc-realtime').textContent).not.toContain('El lienzo ya tiene contenido');

    button('event-analytics', 'Cancelar').click();
    fixture.detectChanges();
    expect(requested).toEqual([]);

    button('event-analytics', 'Cargar en el lienzo').click();
    fixture.detectChanges();
    button('event-analytics', 'Agregar al lienzo').click();
    fixture.detectChanges();
    expect(requested.map((load) => [load.blueprint.id, load.mode])).toEqual([['event-analytics', 'add']]);

    button('event-analytics', 'Cargar en el lienzo').click();
    fixture.detectChanges();
    button('event-analytics', 'Reemplazar').click();
    expect(requested.map((load) => load.mode)).toEqual(['add', 'replace']);
  });

  it('loads straight away on an empty canvas', () => {
    const { fixture, studio, requested, card, button } = create();
    studio.canvasHasContent.set(false);
    fixture.detectChanges();
    button('multi-region-recovery', 'Cargar en el lienzo').click();
    fixture.detectChanges();
    expect(requested.map((load) => [load.blueprint.id, load.mode])).toEqual([['multi-region-recovery', 'replace']]);
    expect(card('multi-region-recovery').textContent).not.toContain('El lienzo ya tiene contenido');
  });
});
