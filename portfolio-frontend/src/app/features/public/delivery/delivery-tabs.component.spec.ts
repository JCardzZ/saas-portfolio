import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeliveryTabsComponent } from './delivery-tabs.component';
import { DeliveryTabsService, tabFromHash } from './delivery-tabs.service';
import { STATUS_REMOTE_URL, STATUS_SNAPSHOT_URL } from './delivery-status.service';
import { LiveHealthService, LiveHealthState } from './live-health.service';

const sha = (char: string) => char.repeat(40);
const STATUS = {
  schema: 1, repository: 'owner/repo', public: false, updatedAt: '2026-10-18T03:10:00Z',
  workflows: {
    ci: { runId: 77, runNumber: 25, sha: sha('a'), event: 'push', startedAt: '2026-10-18T03:00:00Z', finishedAt: '2026-10-18T03:10:00Z', durationSeconds: 600, conclusion: 'success', jobs: [] },
  },
  deployments: { frontend: [{ kind: 'deploy', sha: sha('a'), at: '2026-10-18T03:12:00Z', by: 'JCardzZ', runNumber: 14, runId: 90, healthy: true }], backend: [] },
  commits: [
    { sha: sha('2'), parents: [sha('1')], subject: 'fix: y', author: 'JCardzZ', date: '2026-10-18T08:00:00Z' },
    { sha: sha('1'), parents: [], subject: 'init', author: 'JCardzZ', date: '2026-10-18T07:00:00Z' },
  ],
};

describe('DeliveryTabsComponent', () => {
  let fixture: ComponentFixture<DeliveryTabsComponent>;
  let element: HTMLElement;
  const tabs = () => Array.from(element.querySelectorAll<HTMLButtonElement>('[data-testid="delivery-tabs"] > [role="tab"]'));
  const panel = (id: string) => element.querySelector<HTMLElement>(`#panel-${id}`)!;

  beforeEach(() => {
    history.replaceState(null, '', location.pathname);
    const health: Pick<LiveHealthService, 'state' | 'load' | 'checks' | 'refresh'> = {
      state: signal<LiveHealthState>({ kind: 'ready', health: { status: 'UP', database: 'ok', redisCache: 'ok', aiEngine: 'CLOSED', checkedAt: new Date(), latencyMs: 42 } }),
      load: () => undefined, checks: signal(1), refresh: () => undefined,
    };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: LiveHealthService, useValue: health }],
    });
    fixture = TestBed.createComponent(DeliveryTabsComponent);
    fixture.detectChanges();
    const backend = TestBed.inject(HttpTestingController);
    backend.expectOne(STATUS_REMOTE_URL).flush('Not Found', { status: 404, statusText: 'Not Found' });
    backend.expectOne(STATUS_SNAPSHOT_URL).flush(STATUS);
    fixture.detectChanges();
    element = fixture.nativeElement;
  });

  afterEach(() => history.replaceState(null, '', location.pathname));

  it('shows four tabs, each with a real figure from its view, and opens the architecture first', () => {
    expect(tabs().map((tab) => tab.getAttribute('data-delivery-tab'))).toEqual(['arquitectura', 'historial', 'pipeline', 'despliegues']);
    const text = tabs().map((tab) => tab.textContent!.replace(/\s+/g, ' '));
    expect(text[0]).toContain('API UP · 42 ms');
    expect(text[1]).toContain('2 commits · 0 PR');
    expect(text[2]).toContain('CI correcta · #25');
    expect(text[3]).toContain('v14 en producción');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(panel('arquitectura').hidden).toBeFalse();
    expect(panel('pipeline').hidden).toBeTrue();
  });

  it('keeps every view mounted, so nothing is lost when switching and the text stays on the page', () => {
    expect(element.querySelector('app-production-architecture')).not.toBeNull();
    expect(element.querySelector('app-merge-history')).not.toBeNull();
    expect(element.querySelector('app-pipeline-view')).not.toBeNull();
    expect(element.querySelector('app-deploy-timeline')).not.toBeNull();
  });

  it('switches with a click, gives the view its own link and marks what has been seen', () => {
    tabs()[2].click();
    fixture.detectChanges();

    expect(panel('pipeline').hidden).toBeFalse();
    expect(panel('arquitectura').hidden).toBeTrue();
    expect(location.hash).toBe('#entrega-pipeline');
    expect(TestBed.inject(DeliveryTabsService).visited().has('pipeline')).toBeTrue();
    expect(element.textContent).toContain('2/4');
  });

  it('moves between tabs with the arrows, Home and End, as the ARIA tabs pattern says', () => {
    const bar = element.querySelector<HTMLElement>('[role="tablist"]')!;
    const press = (key: string) => {
      bar.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      fixture.detectChanges();
    };

    press('ArrowLeft');
    expect(tabs()[3].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[3]);
    press('Home');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    press('ArrowRight');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    press('End');
    expect(tabs()[3].getAttribute('aria-selected')).toBe('true');
    // Solo la pestaña abierta entra en el orden de tabulación.
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, -1, -1, 0]);
  });

  it('ends each view with the next one, and the last one goes back to the start', () => {
    panel('arquitectura').querySelector<HTMLButtonElement>('[data-next]')!.click();
    fixture.detectChanges();
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');

    TestBed.inject(DeliveryTabsService).select('despliegues');
    fixture.detectChanges();
    expect(panel('despliegues').querySelector('[data-next]')!.getAttribute('data-next')).toBe('arquitectura');
  });

  it('opens the view a link points to', () => {
    location.hash = 'entrega-historial';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    fixture.detectChanges();
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(tabFromHash('#entrega-otra')).toBeNull();
  });
});
