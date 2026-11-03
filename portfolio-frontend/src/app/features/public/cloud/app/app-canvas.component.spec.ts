import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SystemDesign, defaultSystemDesign } from '../system/system-design';
import { AppCanvasComponent } from './app-canvas.component';

@Component({
  imports: [AppCanvasComponent],
  template: `<app-app-canvas [design]="design()" />`,
})
class HostComponent {
  readonly design = signal<SystemDesign>(defaultSystemDesign());
}

describe('AppCanvasComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const $ = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  const all = (selector: string) => Array.from(fixture.nativeElement.querySelectorAll(selector)) as HTMLElement[];
  const svg = () => $('svg.appc-svg') as unknown as SVGSVGElement;

  /** Coordenadas del lienzo a coordenadas de ventana, con el encuadre que tenga la vista. */
  function pointer(target: Element, type: string, x: number, y: number): void {
    const point = new DOMPoint(x, y).matrixTransform(svg().getScreenCTM()!);
    target.dispatchEvent(new PointerEvent(type, { clientX: point.x, clientY: point.y, bubbles: true }));
    fixture.detectChanges();
  }
  const center = (id: string) => {
    const transform = $(`[data-node="${id}"]`)!.getAttribute('transform')!;
    const [x, y] = transform.match(/-?[\d.]+/g)!.map(Number);
    return { x: x + 64, y: y + 36 };
  };

  beforeEach(() => {
    localStorage.removeItem('studio-app-canvas');
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.removeItem('studio-app-canvas'));

  it('starts from the design decisions and offers the pieces grouped by layer', () => {
    expect(all('[data-node]').map((node) => node.dataset['node'])).toEqual(['client', 'entry', 'backend', 'database']);
    expect(all('[data-link]').length).toBe(3);
    expect(all('.appc-layer').map((layer) => layer.textContent!.trim())).toContain('Mensajería');
    expect($('[data-link="backend>database"] text')!.textContent).toBe('SQL');
  });

  it('adds a piece from the catalog, selects it and remembers the canvas', () => {
    (fixture.nativeElement.querySelector('[data-piece="cache"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect($('[data-node="cache-1"]')).not.toBeNull();
    expect(($('[data-testid="appc-inspector"] input') as HTMLInputElement).placeholder).toBe('Caché');
    expect(JSON.parse(localStorage.getItem('studio-app-canvas')!).nodes.length).toBe(5);
  });

  it('filters the catalog as you type', () => {
    const search = $('#appc-search') as HTMLInputElement;
    search.value = 'kafka';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(all('[data-piece]').map((piece) => piece.dataset['piece'])).toEqual(['stream']);
  });

  it('connects two pieces by dragging from the edge, and refuses a connection with the reason', () => {
    (fixture.nativeElement.querySelector('[data-piece="cache"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const cache = center('cache-1');
    const backend = center('backend');

    pointer($('[data-node="backend"] .appc-handle')!, 'pointerdown', backend.x + 64, backend.y);
    pointer(svg(), 'pointermove', cache.x, cache.y);
    expect($('[data-node="cache-1"]')!.classList).toContain('appc-target-ok');
    expect($('[data-node="client"]')!.classList).toContain('appc-target-no');
    pointer(svg(), 'pointerup', cache.x, cache.y);
    expect($('[data-link="backend>cache-1"] text')!.textContent).toBe('RESP');

    const client = center('client');
    const database = center('database');
    pointer($('[data-node="client"] .appc-handle')!, 'pointerdown', client.x + 64, client.y);
    pointer(svg(), 'pointermove', database.x, database.y);
    pointer(svg(), 'pointerup', database.x, database.y);
    expect($('[data-link="client>database"]')).toBeNull();
    expect($('[data-testid="appc-notice"]')!.textContent).toContain('Pon una API o un BFF en medio.');
  });

  it('changes the protocol of a link from the inspector, deletes with the keyboard and undoes', () => {
    $('[data-link="entry>backend"] .appc-wire-label')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    const grpc = all('[data-testid="appc-inspector"] [role="radio"]').find((option) => option.textContent!.trim() === 'gRPC')!;
    grpc.click();
    fixture.detectChanges();
    expect($('[data-link="entry>backend"] text')!.textContent).toBe('gRPC');

    svg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    fixture.detectChanges();
    expect($('[data-link="entry>backend"]')).toBeNull();

    (all('button').find((button) => button.textContent!.trim() === 'Deshacer') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect($('[data-link="entry>backend"] text')!.textContent).toBe('gRPC');
  });

  it('reviews the design while drawing and applies a fix in one click', () => {
    const findings = () => all('[data-finding]').map((item) => item.dataset['finding']);
    expect(findings()).toContain('no-identity');
    expect($('[data-testid="appc-verdict"]')!.textContent).toContain('punto débil');

    ($('[data-finding="no-identity"] .appc-fix') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(findings()).not.toContain('no-identity');
    expect(all('[data-node]').some((node) => node.dataset['node']!.startsWith('idp'))).toBeTrue();
    expect($('[data-testid="appc-notice"]')!.textContent).toContain('Hecho.');
  });

  it('explains why a connection applies when it is created', () => {
    (fixture.nativeElement.querySelector('[data-piece="cache"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const cache = center('cache-1');
    const backend = center('backend');
    pointer($('[data-node="backend"] .appc-handle')!, 'pointerdown', backend.x + 64, backend.y);
    pointer(svg(), 'pointermove', cache.x, cache.y);
    pointer(svg(), 'pointerup', cache.x, cache.y);

    expect($('[data-testid="appc-notice"]')!.textContent).toContain('Aplica: RESP.');
    expect($('[data-testid="appc-notice"]')!.getAttribute('role')).toBe('status');
  });

  it('arranges every piece without overlaps, and shows the journey and the lesson', () => {
    for (const piece of ['microservice', 'microservice', 'queue', 'cache']) {
      (fixture.nativeElement.querySelector(`[data-piece="${piece}"]`) as HTMLButtonElement).click();
      fixture.detectChanges();
    }
    ($('[data-testid="appc-arrange"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const positions = all('[data-node]').map((node) => node.getAttribute('transform')!.match(/-?[\d.]+/g)!.map(Number));
    const overlapping = positions.some(([ax, ay], i) => positions.slice(i + 1).some(([bx, by]) => Math.abs(ax - bx) < 128 && Math.abs(ay - by) < 72));
    expect(overlapping).toBeFalse();

    all('[role="tab"]').find((tab) => tab.textContent!.includes('Recorrido'))!.click();
    fixture.detectChanges();
    expect(all('li.appc-hop[data-hop]').map((hop) => hop.dataset['hop'])).toEqual(['client', 'entry', 'backend', 'database']);

    $('[data-node="database"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    svg().dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    all('[role="tab"]').find((tab) => tab.textContent!.includes('Aprende'))!.click();
    fixture.detectChanges();
    expect($('.appc-lesson')!.textContent).toContain('transacciones ACID');
  });

  it('adds a box from the menu', () => {
    (all('button').find((button) => button.textContent!.includes('Añadir caja')) as HTMLButtonElement).click();
    fixture.detectChanges();
    (all('#appc-box-menu button').find((button) => button.textContent!.includes('Dominio')) as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(all('[data-box]').map((box) => box.getAttribute('data-kind'))).toEqual(['vpc', 'domain']);
  });
});
