import { TestBed } from '@angular/core/testing';

import { SystemEventsService } from '../data/system-events.service';
import { ResiliencePipelineComponent } from './resilience-pipeline.component';

describe('ResiliencePipelineComponent', () => {
  function create() {
    const fixture = TestBed.createComponent(ResiliencePipelineComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const toggle = (element: HTMLElement, name: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('[role="switch"]')).find((button) => button.textContent?.includes(name))!;

  it('starts healthy, with the bypass off and the circuit closed', () => {
    const { element } = create();

    expect(element.textContent).toContain('UP');
    expect(element.querySelector('.pipe-bypass-on')).toBeNull();
    expect(element.querySelector('.lever-open')).toBeNull();
    expect(element.textContent).toContain('200 OK · caché');
    expect(element.textContent).toContain('200 OK · respuesta con citas');
  });

  it('reroutes to PostgreSQL and keeps answering 200 when Redis goes down', () => {
    const { fixture, element } = create();

    toggle(element, 'Redis').click();
    fixture.detectChanges();

    expect(toggle(element, 'Redis').getAttribute('aria-checked')).toBe('true');
    expect(element.querySelector('.pipe-bypass-on')).not.toBeNull();
    expect(element.querySelectorAll('.stage-down').length).toBe(1);
    expect(element.textContent).toContain('200 OK · Fail-open');
    expect(element.textContent).toContain('DEGRADED');
    // El fallo de Redis no afecta a la IA.
    expect(element.textContent).toContain('200 OK · respuesta con citas');
  });

  it('opens the circuit and shows the RFC 7807 body when Gemini runs out of quota', () => {
    const { fixture, element } = create();

    toggle(element, 'Gemini').click();
    fixture.detectChanges();

    expect(element.querySelector('.lever-open')).not.toBeNull();
    expect(element.textContent).toContain('OPEN');
    expect(element.textContent).toContain('503 Service Unavailable · RFC 7807');
    const body = JSON.parse(element.querySelector('pre')!.textContent!);
    expect(body.status).toBe(503);
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
    expect(Object.keys(body)).toEqual(['type', 'title', 'status', 'detail', 'instance', 'code', 'timestamp', 'traceId']);

    const tags = TestBed.inject(SystemEventsService).events().map((event) => event.tag);
    expect(tags).toEqual(['Gemini 429', 'CircuitBreaker aiEngine', '503 SERVICE_UNAVAILABLE']);
  });

  it('recovers when the failure is switched off', () => {
    const { fixture, element } = create();
    toggle(element, 'Redis').click();
    toggle(element, 'Redis').click();
    fixture.detectChanges();

    expect(element.querySelector('.pipe-bypass-on')).toBeNull();
    expect(element.textContent).toContain('UP');
  });
});
