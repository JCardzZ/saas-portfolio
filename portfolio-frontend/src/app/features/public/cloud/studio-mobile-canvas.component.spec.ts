import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContainerWidthDirective } from '../../../shared/ui/container-width.directive';
import { MobileRow, StudioMobileCanvasComponent, fitText } from './studio-mobile-canvas.component';

const row = (id: string, label: string, extra: Partial<MobileRow> = {}): MobileRow =>
  ({ id, label, role: 'Papel', icon: null, meta: 'Subred pública · $22/mes', live: false, state: null, ...extra });

const ROWS = [
  row('secrets', 'Secrets Manager'),
  row('users', 'Visitantes', { meta: '' }),
  row('lb', 'Application Load Balancer con un nombre que no cabe en un móvil'),
  row('api', 'ECS Fargate', { live: true, state: { label: 'CB OPEN', level: 'down' } }),
  row('db', 'RDS PostgreSQL'),
];
const LINKS: [string, string][] = [['users', 'lb'], ['lb', 'api'], ['api', 'db']];

describe('StudioMobileCanvasComponent', () => {
  let fixture: ComponentFixture<StudioMobileCanvasComponent>;
  let element: HTMLElement;

  function create(width = 342): void {
    ContainerWidthDirective.fixedWidth = width;
    fixture = TestBed.createComponent(StudioMobileCanvasComponent);
    fixture.componentRef.setInput('rows', ROWS);
    fixture.componentRef.setInput('links', LINKS);
    fixture.componentRef.setInput('activeId', 'api');
    element = fixture.nativeElement;
    document.body.appendChild(element);
    fixture.detectChanges();
  }

  afterEach(() => element.remove());

  const viewport = (): HTMLElement => element.querySelector<HTMLElement>('.viewport')!;
  const svg = (): SVGSVGElement => element.querySelector<SVGSVGElement>('svg[data-layout]')!;
  const zoomLabel = (): string => element.querySelector('[data-testid="mobile-zoom"]')!.textContent!.trim();
  const button = (name: string): HTMLButtonElement =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => (candidate.getAttribute('aria-label') ?? candidate.textContent)!.includes(name))!;
  const pointer = (type: string, id: number, x: number, y: number): void => {
    viewport().dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };

  for (const width of [222, 342, 560]) {
    it(`stacks the pieces in the order of the request, full width, inside ${width} px`, () => {
      create(width);

      const ids = Array.from(element.querySelectorAll('[data-node-id]')).map((node) => node.getAttribute('data-node-id'));
      // Lo que no se conecta con nada va al final.
      expect(ids).toEqual(['users', 'lb', 'api', 'db', 'secrets']);
      expect(svg().getAttribute('viewBox')).toMatch(new RegExp(`^0 0 ${width} \\d+$`));
      const frame = svg().getBoundingClientRect();
      for (const mark of Array.from(svg().querySelectorAll('rect, text, path'))) {
        const box = mark.getBoundingClientRect();
        expect(box.left).withContext(mark.textContent ?? mark.tagName).toBeGreaterThanOrEqual(frame.left - 0.5);
        expect(box.right).withContext(mark.textContent ?? mark.tagName).toBeLessThanOrEqual(frame.right + 0.5);
      }
      for (const text of Array.from(svg().querySelectorAll('text'))) {
        expect(parseFloat(getComputedStyle(text).fontSize)).toBeGreaterThanOrEqual(12);
      }
    });
  }

  it('shortens a name that does not fit and keeps the whole of it for screen readers', () => {
    create(260);
    const node = element.querySelector('[data-node-id="lb"]')!;

    expect(node.querySelector('.node-service')!.textContent).toMatch(/…$/);
    expect(node.getAttribute('aria-label')).toContain('Application Load Balancer con un nombre que no cabe en un móvil');
    expect(fitText('Redis', 200, 7)).toBe('Redis');
    expect(fitText('Un nombre larguísimo', 70, 7)).toBe('Un nombre…');
  });

  it('marks the active piece, a real price and the state of a simulated failure', () => {
    create();
    const api = element.querySelector('[data-node-id="api"]')!;

    expect(api.getAttribute('aria-pressed')).toBe('true');
    expect(api.getAttribute('data-level')).toBe('down');
    expect(api.querySelector('.node-service')!.textContent).toContain('CB OPEN');
    expect(api.querySelector('.node-meta')!.classList).toContain('node-meta-live');
    expect(element.querySelectorAll('path.wire-active').length).toBe(2);
  });

  it('reports the piece that was tapped', () => {
    create();
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((pick) => picked.push(pick.id));

    element.querySelector<SVGGElement>('[data-node-id="db"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(picked).toEqual(['db']);
  });

  it('zooms with the buttons and fits back to the screen', () => {
    create();
    expect(zoomLabel()).toBe('100 %');
    expect(button('Alejar').disabled).toBeTrue();
    expect(button('Ajustar a pantalla').disabled).toBeTrue();
    expect(viewport().style.touchAction).toBe('pan-y');

    button('Acercar').click();
    fixture.detectChanges();
    expect(zoomLabel()).toBe('150 %');
    expect(svg().style.transform).toContain('scale(1.5)');
    // Ampliado, el dedo mueve el diagrama en vez de la página.
    expect(viewport().style.touchAction).toBe('none');

    for (let i = 0; i < 6; i++) {
      button('Acercar').click();
    }
    fixture.detectChanges();
    expect(zoomLabel()).toBe('300 %');
    expect(button('Acercar').disabled).toBeTrue();

    button('Ajustar a pantalla').click();
    fixture.detectChanges();
    expect(zoomLabel()).toBe('100 %');
    expect(svg().style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('zooms with a pinch and then pans with one finger, never past its edges', () => {
    create();

    pointer('pointerdown', 1, 100, 100);
    pointer('pointerdown', 2, 200, 100);
    pointer('pointermove', 2, 300, 100);
    expect(zoomLabel()).toBe('200 %');
    pointer('pointerup', 2, 300, 100);
    pointer('pointerup', 1, 100, 100);

    pointer('pointerdown', 3, 150, 150);
    pointer('pointermove', 3, 100, 120);
    const moved = fixture.componentInstance.offset();
    expect(moved.x).toBeLessThan(0);
    // Por mucho que se arrastre, el borde del diagrama no entra en el visor.
    pointer('pointermove', 3, 5000, 5000);
    expect(fixture.componentInstance.offset()).toEqual({ x: 0, y: 0 });
    pointer('pointermove', 3, -5000, -5000);
    const scene = fixture.componentInstance.scene();
    expect(fixture.componentInstance.offset()).toEqual({ x: -scene.width, y: -scene.height });
    pointer('pointerup', 3, 0, 0);
  });

  it('does not select the piece under the finger when the gesture was a drag', () => {
    create();
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((pick) => picked.push(pick.id));
    element.querySelector<HTMLButtonElement>('button[aria-label="Acercar"]')!.click();
    fixture.detectChanges();
    const node = element.querySelector<SVGGElement>('[data-node-id="db"]')!;

    pointer('pointerdown', 1, 150, 150);
    pointer('pointermove', 1, 100, 100);
    pointer('pointerup', 1, 100, 100);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(picked).toEqual([]);

    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(picked).toEqual(['db']);
  });
});
