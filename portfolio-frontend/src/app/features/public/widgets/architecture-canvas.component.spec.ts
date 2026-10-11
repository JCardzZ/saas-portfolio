import { TestBed } from '@angular/core/testing';

import { SystemEventsService } from '../data/system-events.service';
import { ArchitectureCanvasComponent } from './architecture-canvas.component';

describe('ArchitectureCanvasComponent', () => {
  function create() {
    const fixture = TestBed.createComponent(ArchitectureCanvasComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const labels = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('.node-label')).map((label) => label.textContent);
  const tab = (element: HTMLElement, name: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) => button.textContent?.includes(name))!;

  it('opens on the container level with the API selected', () => {
    const { element } = create();

    expect(tab(element, 'Contenedores').getAttribute('aria-selected')).toBe('true');
    expect(labels(element)).toEqual(['Angular 18', 'Spring Boot 3', 'Redis', 'PostgreSQL', 'Gemini']);
    expect(element.querySelectorAll('path.edge').length).toBe(4);
    expect(element.querySelector('.node-active .node-label')?.textContent).toBe('Spring Boot 3');
  });

  it('switches the diagram to each C4 level and logs the change', () => {
    const { fixture, element } = create();

    tab(element, 'Contexto').click();
    fixture.detectChanges();
    expect(labels(element)).toEqual(['Visitante', 'Administrador', 'SaaS Portfolio', 'Neon', 'Upstash', 'Gemini API']);
    expect(element.querySelector('.node-active .node-label')?.textContent).toBe('SaaS Portfolio');

    tab(element, 'Componentes').click();
    fixture.detectChanges();
    expect(labels(element)).toEqual(['Controllers', 'Casos de uso', 'Puertos', 'Persistencia', 'Caché y límites', 'IA']);
    expect(element.querySelectorAll('path.edge').length).toBe(5);

    const logged = TestBed.inject(SystemEventsService).events().map((event) => event.detail);
    expect(logged).toEqual(['Nivel 1 · Contexto del sistema', 'Nivel 3 · Componentes (hexagonal)']);
  });

  it('shows the facts of the hovered node and highlights its connections', () => {
    const { fixture, element } = create();
    const redis = Array.from(element.querySelectorAll<SVGGElement>('g.node'))
      .find((node) => node.textContent?.includes('Redis'))!;

    redis.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(element.querySelector('[aria-live] p')?.textContent).toBe('Redis');
    expect(element.textContent).toContain('Cache-aside · TTL 10 min');
    expect(element.querySelectorAll('path.edge-active').length).toBe(1);
  });

  it('maps the backend packages at the code level, each with its architecture rule', () => {
    const { fixture, element } = create();

    tab(element, 'Código').click();
    fixture.detectChanges();

    expect(labels(element)).toEqual([
      'infrastructure.adapter', 'infrastructure.config', 'application.port', 'application.service', 'domain',
    ]);
    // Todas las cadenas de imports terminan en domain y ninguna sale de él.
    const edges = fixture.componentInstance.edges();
    expect(edges.some((edge) => edge.from === 'domain')).toBeFalse();
    expect(edges.filter((edge) => edge.to === 'domain').length).toBe(2);

    expect(element.querySelector('.node-active.node-pure .node-label')?.textContent).toBe('domain');
    const rule = element.querySelector('[aria-live] span')!;
    expect(rule.textContent).toBe('0 importaciones de Spring/JPA/Frameworks');
    // La regla se lee en una insignia neutra: el color no distingue capas.
    expect(rule.className).toContain('ui-badge');

    Array.from(element.querySelectorAll<SVGGElement>('g.node'))
      .find((node) => node.textContent?.includes('infrastructure.adapter'))!
      .dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const frameworkRule = element.querySelector('[aria-live] span')!;
    expect(frameworkRule.textContent).toBe('Adapters & Frameworks');
    expect(frameworkRule.className).toContain('ui-badge');
  });

  it('draws each technology logo inside its node and glows in its brand colour', () => {
    const { fixture, element } = create();
    const nodes = Array.from(element.querySelectorAll<SVGGElement>('g.node'));

    expect(element.querySelectorAll('svg.node-icon path').length).toBe(5);
    const redis = nodes.find((node) => node.textContent?.includes('Redis'))!;
    expect(redis.style.getPropertyValue('--brand')).toBe('#FF4438');
    expect(redis.querySelector('svg.node-icon path')?.getAttribute('fill')).toBe('#FF4438');

    // En el nivel de contexto, las personas y la plataforma no tienen logo de marca.
    tab(element, 'Contexto').click();
    fixture.detectChanges();
    expect(element.querySelectorAll('svg.node-icon').length).toBe(3);
  });

  it('moves between levels with the arrow keys', () => {
    const { fixture, element } = create();

    element.querySelector('[role="tablist"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(tab(element, 'Componentes').getAttribute('aria-selected')).toBe('true');
  });
});
