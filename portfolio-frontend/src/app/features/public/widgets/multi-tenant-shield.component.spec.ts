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
