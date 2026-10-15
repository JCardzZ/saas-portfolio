import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { TheaterToggleComponent } from './theater-toggle.component';
import { HOVER_INTENT_MS, THEATER_ANIMATIONS, TheaterDirective } from './theater.directive';

@Component({
    imports: [TheaterDirective, TheaterToggleComponent],
    template: `
    <div class="grid" style="display: grid; grid-template-columns: repeat(6, 1fr)">
      <article appTheater id="card" style="grid-column: span 4 / span 4; height: 120px">
        <app-theater-toggle name="Arquitectura" />
        <button id="inner">Dentro</button>
      </article>
      <article id="sibling" style="grid-column: span 2 / span 2">Vecina</article>
    </div>
  `
})
class HostComponent {}

describe('TheaterDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let card: HTMLElement;
  let toggle: HTMLButtonElement;

  beforeEach(() => {
    // Sin animación la vuelta a la celda es síncrona y el test no depende de tiempos.
    TestBed.configureTestingModule({ providers: [{ provide: THEATER_ANIMATIONS, useValue: false }] });
    fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    card = fixture.nativeElement.querySelector('#card');
    toggle = card.querySelector('app-theater-toggle button')!;
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  const press = (key: string, target: EventTarget = document, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  it('expands the same card into a modal dialog and keeps its place in the grid', () => {
    toggle.click();
    fixture.detectChanges();

    expect(card.classList).toContain('theater-expanded');
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    expect(card.getAttribute('aria-label')).toBe('Arquitectura');
    expect(toggle.getAttribute('aria-label')).toBe('Minimizar Arquitectura');
    expect(document.body.style.overflow).toBe('hidden');

    const placeholder = card.previousElementSibling as HTMLElement;
    expect(placeholder.getAttribute('aria-hidden')).toBe('true');
    expect(placeholder.style.height).toBe('120px');
    expect(placeholder.style.gridColumnStart).toBe('span 4');
  });

  it('returns to its cell with Escape, restoring the page', () => {
    toggle.click();
    fixture.detectChanges();

    press('Escape');

    expect(card.classList).not.toContain('theater-expanded');
    expect(card.getAttribute('role')).toBeNull();
    expect(card.previousElementSibling).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(toggle.getAttribute('aria-label')).toBe('Ampliar a pantalla completa Arquitectura');
  });

  it('collapses with the same button, which keeps the focus', () => {
    toggle.focus();
    toggle.click();
    toggle.click();
    fixture.detectChanges();

    expect(card.classList).not.toContain('theater-expanded');
    expect(document.activeElement).toBe(toggle);
  });

  it('keeps Tab inside the card only while it is expanded', () => {
    const inner = card.querySelector<HTMLElement>('#inner')!;

    inner.focus();
    expect(press('Tab', inner).defaultPrevented).toBeFalse();

    toggle.click();
    fixture.detectChanges();
    inner.focus();
    expect(press('Tab', inner).defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(toggle);

    expect(press('Tab', toggle, true).defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(inner);
  });

  it('cleans up if the card is destroyed while expanded', () => {
    toggle.click();
    fixture.destroy();

    expect(document.body.style.overflow).toBe('');
    expect(document.querySelector('[aria-hidden="true"][style*="grid-column"]')).toBeNull();
  });
});

describe('TheaterDirective hover intent and touch', () => {
  let fixture: ComponentFixture<HostComponent>;
  let card: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: THEATER_ANIMATIONS, useValue: true }] });
    fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    card = fixture.nativeElement.querySelector('#card');
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  const pointer = (type: string, pointerType: string, target: Element = card) =>
    target.dispatchEvent(new PointerEvent(type, { pointerType, bubbles: type === 'pointerdown' }));
  const backdropOn = () => document.querySelector('.theater-backdrop')?.classList.contains('theater-backdrop-on') ?? false;

  it('brings the card forward only after the cursor rests on it, and releases it on leave', fakeAsync(() => {
    pointer('pointerenter', 'mouse');
    tick(HOVER_INTENT_MS - 1);
    expect(card.classList).not.toContain('theater-focus');

    tick(1);
    expect(card.classList).toContain('theater-focus');
    expect(backdropOn()).toBeTrue();
    // Es un foco, no el modo teatro: la tarjeta sigue en su celda.
    expect(card.classList).not.toContain('theater-expanded');

    pointer('pointerleave', 'mouse');
    expect(card.classList).not.toContain('theater-focus');
    expect(backdropOn()).toBeFalse();
  }));

  it('ignores a cursor that just passes over the card', fakeAsync(() => {
    pointer('pointerenter', 'mouse');
    tick(HOVER_INTENT_MS - 50);
    pointer('pointerleave', 'mouse');
    tick(500);

    expect(card.classList).not.toContain('theater-focus');
  }));

  it('never applies the hover focus on touch, so nothing stays stuck after a tap', fakeAsync(() => {
    pointer('pointerenter', 'touch');
    tick(HOVER_INTENT_MS * 2);

    expect(card.classList).not.toContain('theater-focus');
    expect(backdropOn()).toBeFalse();
  }));

  it('expands with a single tap on the card but lets its own controls work', () => {
    const inner = card.querySelector<HTMLElement>('#inner')!;
    pointer('pointerdown', 'touch', inner);
    inner.click();
    expect(card.classList).not.toContain('theater-expanded');

    pointer('pointerdown', 'touch');
    card.click();
    expect(card.classList).toContain('theater-expanded');
  });

  it('does not expand on a mouse click outside the button', () => {
    pointer('pointerdown', 'mouse');
    card.click();

    expect(card.classList).not.toContain('theater-expanded');
  });
});
