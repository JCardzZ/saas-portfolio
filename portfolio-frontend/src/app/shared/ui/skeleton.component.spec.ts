import { TestBed } from '@angular/core/testing';

import { SkeletonComponent, SkeletonShape } from './skeleton.component';

describe('SkeletonComponent', () => {
  function render(shape: SkeletonShape, label = 'Cargando el estudio…'): HTMLElement {
    const fixture = TestBed.createComponent(SkeletonComponent);
    fixture.componentRef.setInput('shape', shape);
    fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('is a polite status that announces what is loading, and hides the silhouette from screen readers', () => {
    const element = render('studio');
    const status = element.querySelector('[role="status"]')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.querySelector('.sr-only')!.textContent).toBe('Cargando el estudio…');
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('draws the shape of what is coming', () => {
    // El estudio: barra, lienzo con una zona y piezas.
    const studio = render('studio');
    expect(studio.querySelector('.canvas .zone')).not.toBeNull();
    expect(studio.querySelectorAll('.node').length).toBeGreaterThanOrEqual(6);
    // Pestañas con un diagrama, tarjetas, listas, línea de tiempo y código.
    expect(render('tabs').querySelectorAll('.tab').length).toBe(4);
    expect(render('card').querySelectorAll('.chip').length).toBe(3);
    expect(render('list-card').querySelectorAll('.dot').length).toBe(3);
    expect(render('timeline').querySelectorAll('.stop').length).toBe(3);
    expect(render('code').querySelectorAll('.code .line').length).toBeGreaterThan(4);
  });
});
