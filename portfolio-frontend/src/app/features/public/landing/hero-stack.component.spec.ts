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
