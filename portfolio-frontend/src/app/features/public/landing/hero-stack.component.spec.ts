import { TestBed } from '@angular/core/testing';

import { HERO_LAYERS, HeroStackComponent } from './hero-stack.component';

describe('HeroStackComponent', () => {
  it('draws the real layers of the platform, top to bottom, and says the same in text', () => {
    const fixture = TestBed.createComponent(HeroStackComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    expect(Array.from(element.querySelectorAll('.tag')).map((tag) => tag.textContent)).toEqual(['Cliente', 'API', 'Datos']);
    expect(HERO_LAYERS.flatMap((layer) => layer.pieces)).toEqual(['Angular', 'Spring Boot', 'PostgreSQL', 'Redis']);
    // El dibujo es decorativo: lo lee un lector de pantalla en el pie, en texto.
    expect(element.querySelector('.stage')!.getAttribute('aria-hidden')).toBe('true');
    expect(element.querySelector('figcaption')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Angular → Spring Boot → PostgreSQL · Redis');
  });
});

describe('HeroSceneComponent', () => {
  it('falls back to the CSS stack when 3D is off', async () => {
    const { HeroSceneComponent } = await import('./hero3d/hero-scene.component');
    const fixture = TestBed.createComponent(HeroSceneComponent);
    fixture.componentRef.setInput('enabled', false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-hero-stack')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });
});
