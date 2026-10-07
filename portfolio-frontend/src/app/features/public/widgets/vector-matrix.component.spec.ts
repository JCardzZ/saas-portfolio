import { TestBed } from '@angular/core/testing';

import { SystemEventsService } from '../data/system-events.service';
import { VectorMatrixComponent } from './vector-matrix.component';

describe('VectorMatrixComponent', () => {
  function create() {
    const fixture = TestBed.createComponent(VectorMatrixComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('starts with a question selected and its five nearest fragments connected', () => {
    const fixture = create();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelectorAll('circle.point').length).toBe(70);
    expect(element.querySelectorAll('line.link').length).toBe(5);
    expect(element.querySelectorAll('ol li').length).toBe(5);
    expect(element.querySelector('button[aria-pressed="true"]')?.textContent).toContain('caché');
  });

  it('orders matches from most to least similar and changes them with the question', () => {
    const fixture = create();
    const component = fixture.componentInstance;
    const before = component.matches().map((match) => match.id);
    const similarities = component.matches().map((match) => match.similarity);
    expect(similarities).toEqual([...similarities].sort((a, b) => b - a));

    component.select(component.suggestions[2]);

    expect(component.matches().map((match) => match.id)).not.toEqual(before);
    expect(component.matches().every((match) => match.source.startsWith('cms/'))).toBeTrue();
  });

  it('logs each search it runs, naming the best match', () => {
    const fixture = create();
    const component = fixture.componentInstance;

    component.select(component.suggestions[1]);

    const events = TestBed.inject(SystemEventsService).events();
    expect(events.map((event) => event.tag)).toEqual([jasmine.stringMatching(/^pgvector CosineDistance: 0\.\d\d$/), 'match']);
    expect(events[1].detail).toBe(component.matches()[0].source);
  });

  it('follows the pointer across the map', () => {
    const fixture = create();
    const svg: SVGSVGElement = fixture.nativeElement.querySelector('svg[role="img"]');
    const bounds = svg.getBoundingClientRect();

    svg.dispatchEvent(new PointerEvent('pointermove', {
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    }));
    fixture.detectChanges();

    expect(fixture.componentInstance.query().x).toBeCloseTo(300, 0);
    expect(fixture.componentInstance.activeSuggestion()).toBeNull();
  });
});
