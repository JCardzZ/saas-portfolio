import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PAGE_SECTIONS, PublicNavbarComponent } from './public-navbar.component';

describe('PublicNavbarComponent', () => {
  function create() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PublicNavbarComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  it('lleva el nombre como marca y enlaza a todas las secciones, en el orden de la página', () => {
    const { element } = create();

    expect(element.querySelector('nav > a')!.textContent!.trim()).toBe('Manuel Cardoza');
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('a.nav-link'));
    expect(links.map((link) => link.textContent!.trim())).toEqual(PAGE_SECTIONS.map((section) => section.label));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(PAGE_SECTIONS.map((section) => `/#${section.id}`));
  });

  it('marca la sección activa con aria-current y no solo con color', () => {
    const { element, component, fixture } = create();
    expect(element.querySelector('[aria-current]')).toBeNull();

    component.active.set('cloud');
    fixture.detectChanges();

    const current = element.querySelectorAll('a.nav-link[aria-current="true"]');
    expect(current.length).toBe(1);
    expect(current[0].textContent!.trim()).toBe('Cloud');
    expect(current[0].classList).toContain('nav-link-active');
  });

  it('«Preguntar a la IA» es la única acción primaria de la barra y abre el asistente', () => {
    const { element, component } = create();
    const opened = jasmine.createSpy('openChat');
    component.openChat.subscribe(opened);

    const primary = element.querySelectorAll<HTMLButtonElement>('.ui-btn-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].getAttribute('aria-label')).toBe('Preguntar a la IA');
    primary[0].click();
    expect(opened).toHaveBeenCalled();
  });

  it('el menú «Secciones» lista todas, nombra la activa y se cierra con Escape o al elegir', () => {
    const { element, component, fixture } = create();
    const toggle = element.querySelector<HTMLButtonElement>('button[aria-controls="menu-secciones"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('#menu-secciones')).toBeNull();

    component.active.set('proyectos');
    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Secciones: Proyectos');
    const items = Array.from(element.querySelectorAll<HTMLAnchorElement>('#menu-secciones a'));
    expect(items.map((item) => item.textContent!.trim())).toEqual(PAGE_SECTIONS.map((section) => section.label));
    expect(element.querySelector('#menu-secciones a[aria-current="true"]')!.textContent!.trim()).toBe('Proyectos');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('#menu-secciones')).toBeNull();

    toggle.click();
    fixture.detectChanges();
    element.querySelector<HTMLAnchorElement>('#menu-secciones a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(element.querySelector('#menu-secciones')).toBeNull();
  });
});
