import { ContainerWidthDirective } from '../../../shared/ui/container-width.directive';
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

describe('ResiliencePipelineComponent (narrow container)', () => {
  /** Extremos en x de todo lo que se dibuja, en unidades del viewBox (medidos en pantalla y deshecha la escala). */
  function horizontalExtent(svg: SVGSVGElement): { min: number; max: number } {
    const frame = svg.getBoundingClientRect();
    const scale = frame.width / svg.viewBox.baseVal.width;
    const xs: number[] = [];
    for (const element of Array.from(svg.querySelectorAll('rect, circle, line, text, path'))) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) {
        continue;
      }
      xs.push((box.left - frame.left) / scale, (box.right - frame.left) / scale);
    }
    return { min: Math.min(...xs), max: Math.max(...xs) };
  }

  afterEach(() => document.querySelectorAll('body > [data-test-host]').forEach((host) => host.remove()));

  for (const width of [222, 342, 600]) {
    it(`draws the same diagram top to bottom inside ${width} px`, () => {
      ContainerWidthDirective.fixedWidth = width;
      const fixture = TestBed.createComponent(ResiliencePipelineComponent);
      (fixture.nativeElement as HTMLElement).dataset['testHost'] = '';
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      // Con los fallos simulados aparecen el desvío y los avisos: también tienen que caber.
      for (const toggle of Array.from(element.querySelectorAll<HTMLButtonElement>('[role="switch"]'))) {
        toggle.click();
      }
      fixture.detectChanges();
      const svg = element.querySelector<SVGSVGElement>('svg[data-layout]')!;

      expect(svg.dataset['layout']).toBe('vertical');
      expect(svg.getAttribute('viewBox')).toMatch(new RegExp(`^0 0 ${width} \\d+$`));
      const extent = horizontalExtent(svg);
      expect(extent.min).withContext('nada por la izquierda').toBeGreaterThanOrEqual(-0.5);
      expect(extent.max).withContext('nada por la derecha').toBeLessThanOrEqual(width + 0.5);
      for (const text of Array.from(svg.querySelectorAll('text'))) {
        const size = parseFloat(getComputedStyle(text).fontSize);
        expect(size).withContext(`"${text.textContent?.trim()}"`).toBeGreaterThanOrEqual(12);
      }
    });
  }

  it('keeps the horizontal drawing when it fits', () => {
    ContainerWidthDirective.fixedWidth = 700;
    const fixture = TestBed.createComponent(ResiliencePipelineComponent);
    (fixture.nativeElement as HTMLElement).dataset['testHost'] = '';
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector<SVGSVGElement>('svg[data-layout]')!;

    expect(svg.dataset['layout']).toBe('horizontal');
    expect(svg.getAttribute('viewBox')).toBe('0 0 620 200');
    expect(horizontalExtent(svg).max).toBeLessThanOrEqual(620.5);
  });
});
