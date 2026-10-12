import { ContainerWidthDirective } from '../../../shared/ui/container-width.directive';
import { TestBed } from '@angular/core/testing';

import { MultiTenantShieldComponent } from './multi-tenant-shield.component';

describe('MultiTenantShieldComponent', () => {
  function create() {
    const fixture = TestBed.createComponent(MultiTenantShieldComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  it('stores both tenants in the same table but never returns another tenants vectors', () => {
    const { element, component } = create();

    expect(new Set(component.vectors.map((vector) => vector.tenant))).toEqual(new Set(['A', 'B']));
    for (const search of component.searches()) {
      expect(search.hits.length).toBe(3);
      expect(search.hits.every((hit) => hit.tenant === search.tenant.id)).toBeTrue();
    }
    expect(component.leaks()).toBe(0);
    expect(element.querySelector('line.leak')).toBeNull();
    expect(element.textContent).toContain('0 resultados de otro tenant');
    expect(element.textContent).toContain("WHERE tenant_id = 'empresa-a'");
  });

  it('shows cross-tenant results in red only in the hypothetical unfiltered mode', () => {
    const { fixture, element, component } = create();

    element.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
    fixture.detectChanges();

    expect(component.leaks()).toBeGreaterThan(0);
    expect(element.querySelectorAll('line.leak').length).toBe(component.leaks());
    expect(element.textContent).toContain('sin filtro');
    expect(element.textContent).toContain('resultados son de otro tenant');
  });

  it('dims the other tenant and names the focused one in the query', () => {
    const { fixture, element } = create();
    const tenantB = element.querySelectorAll<SVGGElement>('g.tenant')[1];

    tenantB.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(element.textContent).toContain("WHERE tenant_id = 'empresa-b'");
    expect(element.querySelectorAll('circle.vector.dimmed').length).toBe(24);
  });
});

describe('MultiTenantShieldComponent (narrow container)', () => {
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
      const fixture = TestBed.createComponent(MultiTenantShieldComponent);
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
    const fixture = TestBed.createComponent(MultiTenantShieldComponent);
    (fixture.nativeElement as HTMLElement).dataset['testHost'] = '';
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector<SVGSVGElement>('svg[data-layout]')!;

    expect(svg.dataset['layout']).toBe('horizontal');
    expect(svg.getAttribute('viewBox')).toBe('0 0 620 248');
    expect(horizontalExtent(svg).max).toBeLessThanOrEqual(620.5);
  });
});
