import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlatformTabsComponent } from './platform-tabs.component';

describe('PlatformTabsComponent', () => {
  let fixture: ComponentFixture<PlatformTabsComponent>;
  let element: HTMLElement;
  const tabs = () => Array.from(element.querySelectorAll<HTMLButtonElement>('[data-testid="platform-tabs"] > [role="tab"]'));
  const panel = (id: string) => element.querySelector<HTMLElement>(`#ppanel-${id}`)!;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    fixture = TestBed.createComponent(PlatformTabsComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('puts the five views in one card with tabs, the C4 diagram first, and keeps the telemetry beside them', () => {
    expect(tabs().map((tab) => tab.getAttribute('data-platform-tab'))).toEqual(['c4', 'vectores', 'ingesta', 'resiliencia', 'tenants']);
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(panel('c4').hidden).toBeFalse();
    expect(panel('resiliencia').hidden).toBeTrue();
    // Todas montadas (el estado se conserva al cambiar); la telemetría, fuera de las pestañas.
    for (const host of ['app-architecture-canvas', 'app-vector-matrix', 'app-ingestion-sandbox', 'app-resilience-pipeline', 'app-multi-tenant-shield']) {
      expect(element.querySelector(`.panels ${host}`)).withContext(host).not.toBeNull();
    }
    expect(element.querySelector('.panels app-telemetry-monitor')).toBeNull();
    expect(element.querySelector('app-telemetry-monitor')).not.toBeNull();
  });

  it('switches with a click and with the arrows, Home and End', () => {
    tabs()[3].click();
    fixture.detectChanges();
    expect(panel('resiliencia').hidden).toBeFalse();
    expect(panel('c4').hidden).toBeTrue();

    const bar = element.querySelector<HTMLElement>('[role="tablist"]')!;
    const press = (key: string) => {
      bar.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      fixture.detectChanges();
    };
    press('ArrowRight');
    expect(tabs()[4].getAttribute('aria-selected')).toBe('true');
    press('ArrowRight');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    press('End');
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, -1, -1, -1, 0]);
  });
});
