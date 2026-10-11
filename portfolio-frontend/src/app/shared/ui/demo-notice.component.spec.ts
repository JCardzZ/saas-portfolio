import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from '../../app.component';
import { runtimeConfig } from '../../core/config/runtime-config';
import { TraceInspectorService } from '../../features/public/data/trace-inspector.service';
import { TraceInspectorComponent } from '../../features/public/widgets/trace-inspector.component';
import { DemoNoticeHost } from './demo-notice.component';

describe('aviso de modo demo', () => {
  const config = runtimeConfig as { mockMode: boolean; demoReason: string | null };
  const original = { ...config };
  const root = document.documentElement.style;
  const clearStorage = () => localStorage.removeItem('trace-inspector-mode');

  beforeEach(() => {
    clearStorage();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(() => {
    Object.assign(config, original);
    clearStorage();
  });

  function inspector() {
    const fixture = TestBed.createComponent(TraceInspectorComponent);
    const service = TestBed.inject(TraceInspectorService);
    service.viewportWidth.set(1280);
    service.viewportHeight.set(900);
    fixture.detectChanges();
    return { fixture, service, element: fixture.nativeElement as HTMLElement };
  }

  it('con el inspector cerrado es una píldora en su esquina, no interactiva, y el pie le deja sitio', () => {
    config.mockMode = true;
    config.demoReason = 'backend-unavailable';
    const { element } = inspector();

    const pill = element.querySelector<HTMLElement>('[data-demo-pill]')!;
    expect(pill.textContent!.replace(/\s+/g, ' ').trim()).toBe('Modo demo · el servidor no responde · datos simulados');
    expect(pill.classList).toContain('pointer-events-none');
    expect(root.getPropertyValue('--pill-space')).toBe('3.5rem');
  });

  it('con el inspector abierto es un segmento de su cabecera, y de la píldora al minimizarlo', () => {
    config.mockMode = true;
    const { element, service, fixture } = inspector();

    service.select('redis');
    fixture.detectChanges();
    expect(element.querySelector('[data-demo-pill]')).toBeNull();
    expect(element.querySelector('section header [data-testid="demo-notice"]')!.textContent).toContain('Modo demo');
    expect(root.getPropertyValue('--pill-space')).toBe('0px');

    service.setMode('pill');
    fixture.detectChanges();
    expect(element.querySelector('[data-pill] [data-testid="demo-notice"]')!.textContent).toContain('Modo demo');
    expect(root.getPropertyValue('--pill-space')).toBe('3.5rem');
  });

  it('sin modo demo no aparece en ningún sitio', () => {
    config.mockMode = false;
    const { element, service, fixture } = inspector();
    expect(element.querySelector('[data-testid="demo-notice"]')).toBeNull();
    expect(root.getPropertyValue('--pill-space')).toBe('0px');

    service.select('redis');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="demo-notice"]')).toBeNull();
  });

  it('donde no hay inspector (administración, login) lo pinta la aplicación, y deja de hacerlo si lo hay', () => {
    config.mockMode = true;
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="demo-notice-fallback"]')!.textContent).toContain('datos simulados');

    TestBed.inject(DemoNoticeHost).hosted.set(true);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="demo-notice-fallback"]')).toBeNull();
  });
});
