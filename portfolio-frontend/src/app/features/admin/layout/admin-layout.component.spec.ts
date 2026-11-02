import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OpenFeature } from '@openfeature/web-sdk';

import { PlatformFlagsProvider } from '../../../core/flags/feature-flags';
import { AdminHomeComponent } from '../home/admin-home.component';
import { AdminLayoutComponent } from './admin-layout.component';

describe('AdminLayoutComponent with admin.redesign on', () => {
  beforeEach(async () => {
    await OpenFeature.setProviderAndWait(new PlatformFlagsProvider(() => Promise.resolve({ 'admin.redesign': true })));
    sessionStorage.setItem('portfolio.session', JSON.stringify({
      accessToken: 'jwt', expiresAt: Date.now() + 600_000,
      profile: { subject: 'u-1', email: 'ana@example.com', displayName: 'Ana Ruiz', role: 'EDITOR', permissions: ['cms:read', 'flags:read'] },
    }));
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  });

  afterEach(async () => {
    sessionStorage.clear();
    await OpenFeature.clearProviders();
  });

  it('shows a rail of icons and the sections grouped, with whoever signed in at the bottom', () => {
    const fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.admin-shell')).not.toBeNull();
    expect(Array.from(element.querySelectorAll('.admin-rail a')).map((link) => link.getAttribute('aria-label')))
      .toEqual(['Inicio del panel', 'Tecnologías', 'Proyectos', 'Artículos', 'Flags', 'Ver sitio público']);
    expect(Array.from(element.querySelectorAll('.admin-group')).map((group) => group.textContent!.trim())).toEqual(['Contenido', 'Plataforma']);
    const me = element.querySelector('[data-testid="session-who"]')!;
    expect(me.textContent).toContain('Ana Ruiz');
    expect(me.textContent).toContain('EDITOR');
    expect(element.querySelector('.admin-avatar')!.textContent).toContain('AR');
  });

  it('opens the sections as a drawer on narrow screens and closes it from the backdrop', () => {
    const fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const menu = element.querySelector<HTMLButtonElement>('[aria-controls="admin-side"]')!;

    menu.click();
    fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.admin-shell')!.classList).toContain('admin-drawer-open');

    element.querySelector<HTMLButtonElement>('.admin-scrim')!.click();
    fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });

  it('labels each rail icon with a floating tip on hover', () => {
    const fixture = TestBed.createComponent(AdminLayoutComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const flags = element.querySelector('.admin-rail a[aria-label="Flags"]')!;

    flags.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(element.querySelector('[role="tooltip"]')!.textContent).toContain('Flags');

    flags.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(element.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('shows each section on the home page as a tile that says what it is for', () => {
    const fixture = TestBed.createComponent(AdminHomeComponent);
    fixture.detectChanges();
    const tiles = Array.from(fixture.nativeElement.querySelectorAll('.admin-tile')) as HTMLElement[];

    expect(tiles.length).toBe(4);
    expect(tiles[3].textContent).toContain('Encender y apagar funcionalidades sin desplegar');
  });
});
