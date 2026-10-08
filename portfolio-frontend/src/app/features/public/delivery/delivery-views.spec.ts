import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';
import { TOPOLOGY, WORKFLOWS } from './delivery-data';
import { DeliveryStatusService, STATUS_REMOTE_URL, STATUS_SNAPSHOT_URL } from './delivery-status.service';
import { PipelineViewComponent } from './pipeline-view.component';
import { ProductionArchitectureComponent } from './production-architecture.component';

/** Estado con todos los jobs de la CI correctos menos los que se indiquen. */
function statusFile(options: { public?: boolean; overrides?: Record<string, string> } = {}) {
  const jobs = WORKFLOWS.ci.jobs.map((job) => ({
    id: job.id,
    status: options.overrides?.[job.id] ?? 'success',
    durationSeconds: 30,
    runs: 1,
    ...(job.id === 'backend-unit' ? { metrics: { tests: 186, coverage: 88.9 } } : {}),
    ...(job.id === 'publish-image' ? { metrics: { digest: 'sha256:abc123', sbomPackages: 196 } } : {}),
  }));
  return {
    schema: 1, repository: 'owner/repo', public: options.public ?? false, updatedAt: '2026-10-08T03:10:00Z',
    workflows: {
      ci: { runId: 77, runNumber: 25, sha: 'd562113aaaaaaa', event: 'push', startedAt: '2026-10-08T03:00:00Z', finishedAt: '2026-10-08T03:10:00Z', durationSeconds: 600, conclusion: 'success', jobs },
      cd: { runId: 78, runNumber: 9, sha: 'd562113aaaaaaa', event: 'workflow_run', startedAt: '2026-10-08T03:10:10Z', finishedAt: '2026-10-08T03:11:00Z', durationSeconds: 50, conclusion: 'success', jobs: [{ id: 'frontend-deploy', status: 'success', durationSeconds: 25, runs: 1, metrics: { deployedSha: 'd562113aaaaaaa' } }, { id: 'deploy', status: 'skipped', durationSeconds: null, runs: 1 }] },
    },
  };
}

function setup<T>(component: Type<T>): { fixture: ComponentFixture<T>; backend: HttpTestingController; element: HTMLElement } {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return { fixture, backend: TestBed.inject(HttpTestingController), element: fixture.nativeElement as HTMLElement };
}

/** El repositorio es privado: la copia remota no se puede leer y vale la incluida en el sitio. */
function serveSnapshot(backend: HttpTestingController, body: object, fixture: ComponentFixture<unknown>): void {
  backend.expectOne(STATUS_REMOTE_URL).flush('Not Found', { status: 404, statusText: 'Not Found' });
  backend.expectOne(STATUS_SNAPSHOT_URL).flush(body);
  fixture.detectChanges();
}

const node = (element: HTMLElement, label: string) =>
  Array.from(element.querySelectorAll<HTMLButtonElement>('button.node')).find((button) => button.textContent!.includes(label))!;

describe('DeliveryStatusService', () => {
  let service: DeliveryStatusService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(DeliveryStatusService);
    backend = TestBed.inject(HttpTestingController);
  });

  it('prefers the copy published by the workflows when it can be read', () => {
    service.load();
    backend.expectOne(STATUS_REMOTE_URL).flush(statusFile({ public: true }));

    expect(service.source()).toBe('remote');
    expect(service.status()!.workflows.ci!.runNumber).toBe(25);
    backend.expectNone(STATUS_SNAPSHOT_URL);
  });

  it('falls back to the copy shipped with the site, also when the remote one is not valid', () => {
    service.load();
    backend.expectOne(STATUS_REMOTE_URL).flush({ something: 'else' });
    backend.expectOne(STATUS_SNAPSHOT_URL).flush(statusFile());

    expect(service.source()).toBe('snapshot');
    expect(service.status()!.repository).toBe('owner/repo');
  });

  it('reports that there is no data instead of inventing it', () => {
    service.load();
    backend.expectOne(STATUS_REMOTE_URL).error(new ProgressEvent('error'));
    backend.expectOne(STATUS_SNAPSHOT_URL).flush('<html>', { status: 200, statusText: 'OK' });

    expect(service.loaded()).toBeTrue();
    expect(service.status()).toBeNull();
    expect(service.source()).toBeNull();
  });

  it('asks only once however many views use it', () => {
    service.load();
    service.load();

    backend.expectOne(STATUS_REMOTE_URL).flush(statusFile());
    backend.verify();
  });
});

describe('PipelineViewComponent', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('draws the jobs of the workflow with the real result of the last run', () => {
    const { fixture, backend, element } = setup(PipelineViewComponent);
    serveSnapshot(backend, statusFile({ overrides: { codeql: 'skipped', lighthouse: 'failure' } }), fixture);

    expect(element.querySelectorAll('button.node').length).toBe(WORKFLOWS.ci.jobs.length);
    expect(node(element, 'Backend unit').classList).toContain('tone-ok');
    expect(node(element, 'CodeQL').classList).toContain('tone-skipped');
    expect(node(element, 'Lighthouse').classList).toContain('tone-failed');
    expect(node(element, 'Backend unit').getAttribute('aria-label')).toContain('correcto');
    expect(element.textContent).toContain('Datos de la ejecución del');
    expect(element.textContent).toContain('d562113');
  });

  it('explains a job and shows its real metrics when it is picked', () => {
    const { fixture, backend, element } = setup(PipelineViewComponent);
    serveSnapshot(backend, statusFile(), fixture);

    node(element, 'Backend unit').click();
    fixture.detectChanges();

    const detail = element.querySelector('div[aria-live="polite"]')!.textContent!;
    expect(detail).toContain('Por qué existe');
    expect(detail).toContain('186');
    expect(detail).toContain('Cobertura de líneas');
    expect(detail).toContain('Cambios');
  });

  it('shows the structure, clearly labelled, when a workflow has no published run', () => {
    const { fixture, backend, element } = setup(PipelineViewComponent);
    serveSnapshot(backend, statusFile(), fixture);

    Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((tab) => tab.textContent!.includes('Nightly'))!.click();
    fixture.detectChanges();

    expect(element.querySelectorAll('button.node').length).toBe(WORKFLOWS.nightly.jobs.length);
    expect(element.textContent).toContain('sin datos publicados');
    expect(element.querySelector('button.node')!.classList).toContain('tone-idle');
    expect(Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent!.includes('Reproducir'))!.disabled).toBeTrue();
  });

  it('links to GitHub only when the repository is public', () => {
    const closed = setup(PipelineViewComponent);
    serveSnapshot(closed.backend, statusFile({ public: false }), closed.fixture);
    expect(closed.element.querySelector('a[href*="github.com"]')).toBeNull();
    TestBed.resetTestingModule();

    const open = setup(PipelineViewComponent);
    open.backend.expectOne(STATUS_REMOTE_URL).flush(statusFile({ public: true }));
    open.fixture.detectChanges();
    expect(open.element.querySelector('a[href*="github.com"]')!.getAttribute('href')).toBe('https://github.com/owner/repo/actions/runs/77');
  });

  it('replays the last run stage by stage, labelled as a replay, and narrates it in the trace inspector', fakeAsync(() => {
    const { fixture, backend, element } = setup(PipelineViewComponent);
    serveSnapshot(backend, statusFile({ overrides: { preview: 'skipped' } }), fixture);
    const events = TestBed.inject(SystemEventsService);

    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent!.includes('Reproducir'))!.click();
    fixture.detectChanges();

    expect(element.textContent).toContain('Reproducción animada');
    expect(TestBed.inject(TraceInspectorService).selected()).toBe('githubActions');
    expect(node(element, 'Cambios').classList).toContain('tone-running');
    expect(node(element, 'CI gate').classList).toContain('tone-pending');

    tick(20_000);
    fixture.detectChanges();

    expect(element.textContent).toContain('Datos de la ejecución del');
    expect(node(element, 'CI gate').classList).toContain('tone-ok');
    const told = events.events().map((event) => `${event.tag} ${event.detail}`);
    expect(told.some((text) => text.includes('Backend unit → correcto (30 s)'))).toBeTrue();
    expect(told.some((text) => text.includes('Preview URL → omitido'))).toBeTrue();
    expect(events.events().every((event) => event.techs.includes('githubActions'))).toBeTrue();
  }));
});

describe('node icons', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('are 16 px (20 px in the active node) and never larger than 24 px', () => {
    const { fixture, backend, element } = setup(ProductionArchitectureComponent);
    serveSnapshot(backend, statusFile(), fixture);
    document.body.appendChild(element);
    const sizes = () => Array.from(element.querySelectorAll<SVGElement>('.node .icon')).map((icon) => icon.getBoundingClientRect());

    expect(sizes().length).toBeGreaterThan(4);
    for (const rect of sizes()) {
      expect(rect.width).toBe(16);
      expect(rect.height).toBe(16);
    }

    node(element, 'GitHub Actions').click();
    fixture.detectChanges();
    const active = node(element, 'GitHub Actions').querySelector<SVGElement>('.icon')!;
    active.style.transition = 'none';

    expect(active.getBoundingClientRect().width).toBe(20);
    for (const rect of sizes()) {
      expect(Math.max(rect.width, rect.height)).toBeLessThanOrEqual(24);
    }
    // El logo va en línea, con su caja fija: no es el componente que lo hace despegar y flotar.
    expect(element.querySelector('app-tech-icon')).toBeNull();
    expect(active.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(getComputedStyle(active).overflow).toBe('hidden');
    element.remove();
  });
});

describe('ProductionArchitectureComponent', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('draws what the topology file says, telling live from planned', () => {
    const { fixture, backend, element } = setup(ProductionArchitectureComponent);
    serveSnapshot(backend, statusFile(), fixture);

    expect(element.querySelectorAll('button.node').length).toBe(TOPOLOGY.nodes.length);
    for (const item of TOPOLOGY.nodes) {
      const button = node(element, item.label);
      expect(button.classList).withContext(item.id).toContain(item.status === 'live' ? 'tone-ok' : 'tone-planned');
      expect(button.getAttribute('aria-label')).withContext(item.id).toContain(item.status === 'live' ? 'en producción' : 'planificado');
    }
    expect(element.querySelector('[aria-label="Leyenda"]')!.textContent).toContain('En producción');
    expect(element.querySelector('[aria-label="Leyenda"]')!.textContent).toContain('Planificado');
  });

  it('shows the real data of a live piece and none for a planned one', () => {
    const { fixture, backend, element } = setup(ProductionArchitectureComponent);
    serveSnapshot(backend, statusFile(), fixture);
    const detail = () => element.querySelector('[aria-live="polite"]')!.textContent!;

    node(element, 'GHCR').click();
    fixture.detectChanges();
    expect(detail()).toContain('sha256:abc123');
    expect(detail()).toContain('196');
    expect(detail()).toContain('Por qué');

    const planned = TOPOLOGY.nodes.find((item) => item.status === 'planned');
    if (planned) {
      node(element, planned.label).click();
      fixture.detectChanges();
      expect(detail()).toContain('planificado');
      expect(detail()).toContain('todavía no existe en producción');
      expect(detail()).not.toContain('sha256');
    }
  });
});
