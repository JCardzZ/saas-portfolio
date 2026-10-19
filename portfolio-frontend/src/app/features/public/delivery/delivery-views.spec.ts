import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LiveHealth, LiveHealthService, LiveHealthState } from './live-health.service';
import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { TECH_ICONS } from '../../../shared/ui/tech-icons';
import { SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';
import { TOPOLOGY, WORKFLOWS } from './delivery-data';
import { DeployTimelineComponent } from './deploy-timeline.component';
import { DeliveryStatusService, STATUS_REMOTE_URL, STATUS_SNAPSHOT_URL } from './delivery-status.service';
import { PipelineViewComponent } from './pipeline-view.component';
import { ProductionArchitectureComponent } from './production-architecture.component';
import { MergeHistoryComponent, toneOf } from './merge-history.component';
import { parsePipelineStatus } from './delivery-data';

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

/** Salud ya leída de la API: lo que devolvería /telemetry/health en producción. */
function readyHealth(overrides: Partial<LiveHealth>): Pick<LiveHealthService, 'state' | 'load' | 'checks' | 'refresh'> {
  const health: LiveHealth = {
    status: 'UP', database: 'PostgreSQL 16 - Connected', redisCache: 'Redis - Healthy', aiEngine: 'CLOSED',
    checkedAt: new Date(), latencyMs: 42, ...overrides,
  };
  return { state: signal<LiveHealthState>({ kind: 'ready', health }), load: () => undefined, checks: signal(1), refresh: () => undefined };
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

/** La pieza cuyo nombre es exactamente `label`: un nodo del lienzo (SVG) o una fila de las tarjetas. */
const node = (element: HTMLElement, label: string) =>
  Array.from(element.querySelectorAll<SVGElement | HTMLElement>('[data-node]')).find((item) => item.getAttribute('aria-label')!.startsWith(`${label},`))!;
/** Un job del pipeline (gráfico de etapas: botones). */
const stageNode = (element: HTMLElement, label: string) =>
  Array.from(element.querySelectorAll<HTMLButtonElement>('button.node')).find((button) => button.textContent!.includes(label))!;
/** Pulsar una pieza (un <g> de SVG no tiene .click()). */
const tap = (item: Element) => item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const dot = (item: Element) => item.querySelector('[data-state]')!.getAttribute('data-state');

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

  const job = (element: HTMLElement, id: string) => element.querySelector<HTMLButtonElement>(`[data-job="${id}"]`)!;
  const phase = (element: HTMLElement, id: string) => element.querySelector<HTMLButtonElement>(`[data-phase="${id}"]`)!;
  const showGraph = (element: HTMLElement, fixture: ComponentFixture<unknown>) => {
    element.querySelector<HTMLButtonElement>('[data-view="graph"]')!.click();
    fixture.detectChanges();
  };

  it('shows the run by phases, each with how many jobs passed, and opens the tests phase', () => {
    const { fixture, backend, element } = setup(PipelineViewComponent);
    serveSnapshot(backend, statusFile({ overrides: { codeql: 'skipped' } }), fixture);

    expect(Array.from(element.querySelectorAll('[data-phase]')).map((item) => item.getAttribute('data-phase')))
      .toEqual(['detect', 'security', 'contract', 'tests', 'build', 'gate']);
    expect(phase(element, 'contract').getAttribute('data-tone')).toBe('ok');
    expect(phase(element, 'contract').textContent).toContain('3/3');
    // CodeQL omitido: la fase cuenta solo lo que corrió.
    expect(phase(element, 'security').textContent).toContain('1/1');
    expect(phase(element, 'tests').getAttribute('aria-pressed')).toBe('true');
    expect(job(element, 'backend-unit').getAttribute('data-tone')).toBe('ok');
    expect(job(element, 'backend-unit').textContent).toContain('Tests unitarios y de rebanada');
    expect(element.textContent).toContain('CI #25');
    expect(element.textContent).toContain('d562113');
  });

  it('opens the phase that failed first, so a red run is explained at a glance', () => {
    const { fixture, backend, element } = setup(PipelineViewComponent);
    serveSnapshot(backend, statusFile({ overrides: { lighthouse: 'failure' } }), fixture);

    expect(phase(element, 'build').getAttribute('data-tone')).toBe('failed');
    expect(phase(element, 'build').getAttribute('aria-pressed')).toBe('true');
    expect(job(element, 'lighthouse').getAttribute('data-tone')).toBe('failed');
  });

  it('puts the real figures of the run in a scoreboard, each opening the job that published it', () => {
    const { fixture, backend, element } = setup(PipelineViewComponent);
    serveSnapshot(backend, statusFile(), fixture);

    const tests = element.querySelector<HTMLButtonElement>('[data-score="tests"]')!;
    expect(tests.textContent).toContain('186');
    expect(element.querySelector('[data-score="coverage"]')!.textContent).toContain('88.9 %');
    expect(element.querySelector('[data-score="sbom"]')!.textContent).toContain('196');
    // Sin dato publicado, no hay cifra.
    expect(element.querySelector('[data-score="performance"]')).toBeNull();

    element.querySelector<HTMLButtonElement>('[data-score="sbom"]')!.click();
    fixture.detectChanges();
    expect(phase(element, 'build').getAttribute('aria-pressed')).toBe('true');
    expect(element.textContent).toContain('Publicar imagen');
    expect(element.textContent).toContain('sha256:abc123');
  });

  it('explains a job and shows its real metrics when it is picked', () => {
    const { fixture, backend, element } = setup(PipelineViewComponent);
    serveSnapshot(backend, statusFile(), fixture);

    job(element, 'backend-unit').click();
    fixture.detectChanges();

    const detail = element.querySelector('[data-testid="job-detail"]')!.textContent!;
    expect(detail).toContain('Por qué existe');
    expect(detail).toContain('186');
    expect(detail).toContain('Cobertura de líneas');
    expect(detail).toContain('Cambios');
  });

  it('keeps the full dependency graph one click away, with the real result of every job', () => {
    const { fixture, backend, element } = setup(PipelineViewComponent);
    serveSnapshot(backend, statusFile({ overrides: { codeql: 'skipped', lighthouse: 'failure' } }), fixture);
    showGraph(element, fixture);

    expect(element.querySelectorAll('button.node').length).toBe(WORKFLOWS.ci.jobs.length);
    expect(node(element, 'Backend unit').classList).toContain('tone-ok');
    expect(node(element, 'CodeQL').classList).toContain('tone-skipped');
    expect(node(element, 'Lighthouse').classList).toContain('tone-failed');
    expect(node(element, 'Backend unit').getAttribute('aria-label')).toContain('correcto');
  });

  it('shows the structure, clearly labelled, when a workflow has no published run', () => {
    const { fixture, backend, element } = setup(PipelineViewComponent);
    serveSnapshot(backend, statusFile(), fixture);

    Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((tab) => tab.textContent!.includes('Nightly'))!.click();
    fixture.detectChanges();

    expect(element.textContent).toContain('sin datos publicados');
    expect(element.querySelector('[data-score]')).toBeNull();
    expect(Array.from(element.querySelectorAll('[data-phase]')).every((item) => item.getAttribute('data-tone') === 'idle')).toBeTrue();
    expect(element.querySelector<HTMLButtonElement>('button.replay')!.disabled).toBeTrue();
    showGraph(element, fixture);
    expect(element.querySelectorAll('button.node').length).toBe(WORKFLOWS.nightly.jobs.length);
    expect(element.querySelector('button.node')!.classList).toContain('tone-idle');
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

    element.querySelector<HTMLButtonElement>('button.replay')!.click();
    fixture.detectChanges();

    expect(element.textContent).toContain('Reproducción animada');
    expect(TestBed.inject(TraceInspectorService).selected()).toBe('githubActions');
    // Las fases se encienden según llega la reproducción.
    expect(phase(element, 'detect').getAttribute('data-tone')).toBe('running');
    expect(phase(element, 'gate').getAttribute('data-tone')).toBe('pending');
    expect(job(element, 'backend-unit').getAttribute('data-tone')).toBe('pending');

    tick(20_000);
    fixture.detectChanges();

    expect(element.textContent).toContain('Datos de la ejecución del');
    expect(phase(element, 'gate').getAttribute('data-tone')).toBe('ok');
    const told = events.events().map((event) => `${event.tag} ${event.detail}`);
    expect(told.some((text) => text.includes('Backend unit → correcto (30 s)'))).toBeTrue();
    expect(told.some((text) => text.includes('Preview URL → omitido'))).toBeTrue();
    expect(events.events().every((event) => event.techs.includes('githubActions'))).toBeTrue();
  }));
});

describe('brand marks in the graphs', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows names as text: no logo without the brand\'s permission, and nothing larger than 24 px', () => {
    const { fixture, backend, element } = setup(ProductionArchitectureComponent);
    serveSnapshot(backend, statusFile(), fixture);
    document.body.appendChild(element);

    // Solo marcas cuya guía lo permite (docs/brand-usage.md): los iconos oficiales de Google Cloud,
    // el logo de GitHub (para indicar que se usa) y el de Redis con su frase de atribución.
    // GitHub Actions, PostgreSQL, Cloudflare y Gemini llevan un símbolo propio.
    const allowed = new Set(['github', 'gcpCloudRun', 'gcpArtifactRegistry', 'redis']);
    for (const item of TOPOLOGY.nodes) {
      expect(item.icon === null || allowed.has(item.icon)).withContext(item.id).toBeTrue();
    }
    expect(element.querySelector('[data-testid="trademark-attribution"]')!.textContent).toContain('Redis is a registered trademark of Redis Ltd.');
    for (const label of ['Cloudflare Pages', 'Gemini', 'GHCR', 'GitHub Actions', 'PostgreSQL']) {
      expect(node(element, label).querySelector('image')).withContext(label).toBeNull();
      expect(node(element, label).querySelector('g path')!.getAttribute('fill')).withContext(label).toBe('var(--text-2)');
    }
    // Las marcas van a 24 unidades, siempre con su nombre al lado.
    for (const image of Array.from(element.querySelectorAll('[data-node] image'))) {
      expect(image.getAttribute('width')).toBe('24');
    }
    expect(node(element, 'Cloud Run').textContent).toContain('Cloud Run');
    // No es el componente que hace despegar y flotar el logo.
    expect(element.querySelector('app-tech-icon')).toBeNull();
    element.remove();
  });
});

describe('brand marks elsewhere on the site', () => {
  it('uses a neutral symbol, not the logo, for Cloudflare and AI providers', () => {
    for (const key of ['cloudflare', 'cloudflarePages', 'gemini'] as const) {
      expect(TECH_ICONS[key].official).withContext(key).toBeFalse();
    }
    expect(TECH_ICONS.cloudflare.path).toBe(TECH_ICONS.gemini.path);
  });
});

describe('ProductionArchitectureComponent', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('draws what the topology file says, telling live from planned', () => {
    const { fixture, backend, element } = setup(ProductionArchitectureComponent);
    serveSnapshot(backend, statusFile(), fixture);

    expect(element.querySelectorAll('[data-node]').length).toBe(TOPOLOGY.nodes.length);
    for (const item of TOPOLOGY.nodes) {
      const piece = node(element, item.label);
      expect(piece.classList.contains('planned')).withContext(item.id).toBe(item.status === 'planned');
      expect(dot(piece)).withContext(item.id).toBe(item.status === 'live' ? 'ok' : 'planned');
      expect(piece.getAttribute('aria-label')).withContext(item.id).toContain(item.status === 'live' ? 'en producción' : 'planificado');
    }
    // Cada zona con sus piezas, y los dos recorridos dibujados.
    expect(element.querySelectorAll('[data-zone]').length).toBe(TOPOLOGY.zones.length);
    expect(element.querySelectorAll('.edge.request').length).toBe(TOPOLOGY.links.filter((link) => link.flow === 'request').length);
    expect(element.querySelector('[aria-label="Leyenda"]')!.textContent).toContain('En producción');
    expect(element.querySelector('[aria-label="Leyenda"]')!.textContent).toContain('Planificado');
  });

  it('colours each live piece with what /telemetry/health says right now', () => {
    TestBed.configureTestingModule({ providers: [{ provide: LiveHealthService, useValue: readyHealth({ status: 'DEGRADED', redisCache: 'Redis - Unavailable' }) }] });
    const { fixture, backend, element } = setup(ProductionArchitectureComponent);
    serveSnapshot(backend, statusFile(), fixture);

    expect(dot(node(element, 'Redis'))).toBe('down');
    expect(node(element, 'Redis').getAttribute('aria-label')).toContain('con fallos');
    expect(dot(node(element, 'PostgreSQL'))).toBe('ok');
    expect(node(element, 'PostgreSQL').getAttribute('aria-label')).toContain('sano');
    expect(element.querySelector('[aria-label="Leyenda"]')!.textContent).toContain('Con fallos ahora');

    tap(node(element, 'Redis'));
    fixture.detectChanges();
    const state = element.querySelector('[data-testid="live-node-state"]')!;
    expect(state.textContent).toContain('Caído ahora');
    expect(state.textContent).toContain('Redis - Unavailable');
    // Cada pieza con su dato real: la latencia de la API y el estado de la base de datos y la caché.
    expect(node(element, 'Cloud Run').textContent).toContain('DEGRADED · 42 ms');
    expect(node(element, 'PostgreSQL').textContent).toContain('PostgreSQL 16 ✓');
    expect(node(element, 'Redis').textContent).toContain('no responde');
    expect(element.querySelector('[data-testid="check-now"]')).not.toBeNull();
  });

  it('«Check now» asks the API again and writes its real answer, line by line, to the trace inspector', () => {
    const checks = signal(1);
    const state = signal<LiveHealthState>({ kind: 'ready', health: { status: 'UP', database: 'PostgreSQL 16 - Connected', redisCache: 'Redis - Healthy', aiEngine: 'CLOSED', checkedAt: new Date(), latencyMs: 44 } });
    let refreshed = 0;
    TestBed.configureTestingModule({ providers: [{ provide: LiveHealthService, useValue: { state, checks, load: () => undefined, refresh: () => refreshed++ } }] });
    const { fixture, backend, element } = setup(ProductionArchitectureComponent);
    serveSnapshot(backend, statusFile(), fixture);
    const inspector = TestBed.inject(TraceInspectorService);
    const events = TestBed.inject(SystemEventsService);

    element.querySelector<HTMLButtonElement>('[data-testid="check-now"]')!.click();
    fixture.detectChanges();
    expect(refreshed).toBe(1);
    expect(inspector.label()).toContain('/telemetry/health');

    // La API responde: la comprobación termina.
    checks.set(2);
    fixture.detectChanges();
    const lines = events.events().filter((event) => event.component === 'health-check');
    expect(lines.map((event) => event.tag)).toEqual(['Navegador', 'Cloud Run', 'PostgreSQL', 'Redis', 'Gemini']);
    expect(lines.every((event) => event.origin === 'live')).withContext('son datos reales, no una simulación').toBeTrue();
    expect(lines[1].detail).toBe('200 · UP · 44 ms');
    expect(lines[4].detail).toContain('no llama a Gemini');
  });

  it('opens with a live piece already selected, so the detail panel is never empty', () => {
    const { fixture, backend, element } = setup(ProductionArchitectureComponent);
    serveSnapshot(backend, statusFile(), fixture);
    const detail = element.querySelector('div[aria-live="polite"]')!.textContent!;
    expect(detail).toContain('Por qué');
    expect(detail).not.toContain('Toca una pieza');
  });

  it('shows the real data of a live piece and none for a planned one', () => {
    const { fixture, backend, element } = setup(ProductionArchitectureComponent);
    serveSnapshot(backend, statusFile(), fixture);
    const detail = () => element.querySelector('div[aria-live="polite"]')!.textContent!;

    tap(node(element, 'GHCR'));
    fixture.detectChanges();
    expect(detail()).toContain('sha256:abc123');
    expect(detail()).toContain('196');
    expect(detail()).toContain('Por qué');
    // Con qué se conecta, y en qué sentido.
    expect(element.querySelector('[data-testid="node-connections"]')!.textContent).toContain('→ Artifact Registry');

    const planned = TOPOLOGY.nodes.find((item) => item.status === 'planned');
    if (planned) {
      tap(node(element, planned.label));
      fixture.detectChanges();
      expect(detail()).toContain('planificado');
      expect(detail()).toContain('todavía no existe en producción');
      expect(detail()).not.toContain('sha256');
    }
  });
});

describe('DeployTimelineComponent', () => {
  const deployment = (runNumber: number, sha: string, healthy: boolean | null, kind = 'deploy') => ({
    kind, sha, at: `2026-10-0${runNumber}T03:00:00Z`, by: 'JCardzZ', runNumber, runId: 100 + runNumber, healthy,
  });
  const withHistory = (frontend: object[]) => ({ ...statusFile(), deployments: { frontend, backend: [] } });
  const entries = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLElement>('[aria-label="Despliegues de Frontend"] .entry'));
  const button = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((item) => /rollback|simulación/i.test(item.textContent!))!;

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists the frontend deployments, newest first, with version, commit, date, author and health', () => {
    const { fixture, backend, element } = setup(DeployTimelineComponent);
    serveSnapshot(backend, withHistory([deployment(3, 'cccccccdddd', true), deployment(2, 'bbbbbbbcccc', false), deployment(1, 'aaaaaaabbbb', null)]), fixture);

    const [current, failed, unchecked] = entries(element);
    expect(entries(element).length).toBe(3);
    expect(current.textContent).toContain('#3');
    expect(current.textContent).toContain('ccccccc');
    expect(current.textContent).toContain('JCardzZ');
    expect(current.textContent).toContain('en producción');
    expect(current.textContent).toContain('Salud comprobada');
    expect(current.classList).toContain('current');
    expect(failed.textContent).toContain('No pasó la comprobación de salud');
    expect(failed.textContent).not.toContain('en producción');
    expect(unchecked.textContent).toContain('Salud sin comprobar');
  });

  it('shows the backend in production with no invented deployments: the history starts with the CD', () => {
    const { fixture, backend, element } = setup(DeployTimelineComponent);
    serveSnapshot(backend, withHistory([deployment(1, 'aaaaaaabbbb', true)]), fixture);
    const lane = element.querySelector('[aria-label="Despliegues de Backend"]')!;

    expect(lane.textContent).toContain('Cloud Run');
    expect(lane.textContent).not.toContain('planificado');
    expect(lane.textContent).toContain('El historial empieza con el primer despliegue hecho por el CD');
    // En modo demo (el de los tests) no hay API real: no se inventa un estado.
    expect(lane.textContent).toContain('Modo demo: sin estado en vivo');
    expect(lane.querySelectorAll('.entry').length).toBe(0);
  });

  it('shows the live state the API reports when there is no CD history yet', () => {
    TestBed.configureTestingModule({ providers: [{ provide: LiveHealthService, useValue: readyHealth({ status: 'UP' }) }] });
    const { fixture, backend, element } = setup(DeployTimelineComponent);
    serveSnapshot(backend, withHistory([deployment(1, 'aaaaaaabbbb', true)]), fixture);
    const live = element.querySelector('[data-testid="backend-live"]')!;

    expect(live.textContent).toContain('En producción');
    expect(live.textContent).toContain('UP · 42 ms');
  });

  it('simulates a rollback on screen, labelled as a simulation, without calling anything', fakeAsync(() => {
    const { fixture, backend, element } = setup(DeployTimelineComponent);
    serveSnapshot(backend, withHistory([deployment(2, 'bbbbbbbcccc', true), deployment(1, 'aaaaaaabbbb', true)]), fixture);

    button(element).click();
    fixture.detectChanges();

    const [newest, previous] = entries(element);
    expect(previous.classList).toContain('current');
    expect(previous.textContent).toContain('en producción · simulación');
    expect(newest.classList).not.toContain('current');
    expect(element.textContent).toContain('Simulación');
    expect(element.textContent).toContain('Producción no ha cambiado');
    // Ninguna petición: un visitante no puede revertir nada.
    backend.expectNone(() => true);

    tick(1000);
    fixture.detectChanges();
    button(element).click();
    fixture.detectChanges();
    expect(entries(element)[0].classList).toContain('current');
    expect(element.textContent).not.toContain('Producción no ha cambiado');
    tick(1000);
  }));

  it('cannot simulate a rollback when there is nothing to go back to', () => {
    const { fixture, backend, element } = setup(DeployTimelineComponent);
    serveSnapshot(backend, withHistory([deployment(1, 'aaaaaaabbbb', true)]), fixture);

    expect(button(element).disabled).toBeTrue();
  });

  it('keeps the card short: three rows, a health strip and a toggle for the full history', () => {
    const { fixture, backend, element } = setup(DeployTimelineComponent);
    serveSnapshot(backend, withHistory([5, 4, 3, 2, 1].map((n) => deployment(n, `${n}`.repeat(11), n !== 4, n === 5 ? 'rollback' : 'deploy'))), fixture);
    const shown = () => entries(element).filter((entry) => !entry.hidden).length;

    expect(shown()).toBe(3);
    expect(element.querySelectorAll('.tick').length).toBe(5);
    expect(element.textContent).toContain('5 despliegues · 4 sanos · 1 rollback');

    const toggle = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent!.includes('Ver historial completo'))!;
    expect(toggle.textContent).toContain('(5)');
    toggle.click();
    fixture.detectChanges();
    expect(shown()).toBe(5);

    toggle.click();
    fixture.detectChanges();
    expect(shown()).toBe(3);
  });

  it('marks a real rollback in the timeline', () => {
    const { fixture, backend, element } = setup(DeployTimelineComponent);
    serveSnapshot(backend, withHistory([deployment(3, 'aaaaaaabbbb', true, 'rollback'), deployment(2, 'bbbbbbbcccc', false), deployment(1, 'aaaaaaabbbb', true)]), fixture);

    expect(entries(element)[0].textContent).toContain('rollback');
    expect(entries(element)[0].textContent).toContain('en producción');
  });
});

describe('MergeHistoryComponent', () => {
  const sha = (char: string) => char.repeat(40);
  const merge = (number: number, conclusion: string, char: string) => ({
    number, title: `feat: cambio ${number}`, branch: `feat/cambio-${number}`, author: 'JCardzZ', mergedAt: `2026-10-1${number % 10}T10:00:00Z`,
    sha: sha(char), additions: 94, deletions: 2, changedFiles: 6,
    ci: { runId: 900 + number, runNumber: 130 + number, conclusion, durationSeconds: 1311, jobs: [{ name: '🧪 Backend unit', status: 'success' }, { name: '📦 Imagen + Trivy', status: conclusion }] },
  });
  const withMerges = (isPublic: boolean) => ({
    ...statusFile({ public: isPublic }),
    deployments: { frontend: [{ kind: 'deploy', sha: sha('a'), at: '2026-10-17T03:00:00Z', by: 'JCardzZ', runNumber: 48, runId: 1, healthy: true }], backend: [] },
    merges: [merge(5, 'success', 'a'), merge(4, 'failure', 'b')],
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('draws every merged branch with its CI result and the deployment it produced', () => {
    const { fixture, backend, element } = setup(MergeHistoryComponent);
    serveSnapshot(backend, withMerges(true), fixture);
    const rows = Array.from(element.querySelectorAll('[data-merge]'));

    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('#5');
    expect(rows[0].textContent).toContain('feat/cambio-5');
    expect(rows[0].textContent).toContain('CI correcta');
    expect(rows[0].textContent).toContain('Frontend #48');
    expect(rows[1].textContent).toContain('CI fallida');
  });

  it('opens what happened in a merge: size, CI job by job and links to GitHub only when the repository is public', () => {
    const { fixture, backend, element } = setup(MergeHistoryComponent);
    serveSnapshot(backend, withMerges(true), fixture);

    element.querySelector<HTMLButtonElement>('[data-merge="4"]')!.click();
    fixture.detectChanges();
    const detail = element.querySelector('div[aria-live="polite"]')!;
    expect(detail.textContent).toContain('+94');
    expect(detail.textContent).toContain('6 archivos');
    expect(detail.textContent).toContain('📦 Imagen + Trivy');
    expect(detail.querySelector('.job.tone-bad')!.textContent).toContain('Imagen + Trivy');
    const links = Array.from(detail.querySelectorAll('a')).map((link) => link.getAttribute('href'));
    expect(links).toContain('https://github.com/owner/repo/pull/4');
    expect(links).toContain('https://github.com/owner/repo/actions/runs/904');
  });

  it('shows no GitHub links for a private repository', () => {
    const { fixture, backend, element } = setup(MergeHistoryComponent);
    serveSnapshot(backend, withMerges(false), fixture);
    element.querySelector<HTMLButtonElement>('[data-merge="5"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('div[aria-live="polite"] a')).toBeNull();
  });

  it('discards merges that do not look like the CI wrote them', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const parsed = parsePipelineStatus({ ...withMerges(true), merges: [merge(5, 'success', 'a'), { number: 'x' }, { ...merge(3, 'success', 'c'), sha: 'not-a-sha' }] })!;
    expect(parsed.merges.map((item) => item.number)).toEqual([5]);
    expect(toneOf('cancelled')).toBe('warn');
    expect(toneOf(undefined)).toBe('idle');
  });
});

describe('MergeHistoryComponent as a commit graph', () => {
  const sha = (char: string) => char.repeat(40);
  const commits = [
    { sha: sha('3'), parents: [sha('2'), sha('b')], subject: 'Merge pull request #9 from JCardzZ/feat/x', author: 'JCardzZ', date: '2026-10-18T10:00:00Z' },
    { sha: sha('b'), parents: [sha('1')], subject: 'feat: x', author: 'JCardzZ', date: '2026-10-18T09:00:00Z' },
    { sha: sha('2'), parents: [sha('1')], subject: 'fix: y', author: 'JCardzZ', date: '2026-10-18T08:00:00Z' },
    { sha: sha('1'), parents: [], subject: 'init', author: 'JCardzZ', date: '2026-10-18T07:00:00Z' },
  ];
  const merge = { number: 9, title: 'feat: x', branch: 'feat/x', author: 'JCardzZ', mergedAt: '2026-10-18T10:00:00Z', sha: sha('3'), additions: 5, deletions: 1, changedFiles: 2,
    ci: { runId: 77, runNumber: 7, conclusion: 'success', durationSeconds: 60, jobs: [{ name: 'Build', status: 'success' }] } };

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('draws one row per commit with its lanes, the branch label of each PR merge and its CI', () => {
    const { fixture, backend, element } = setup(MergeHistoryComponent);
    serveSnapshot(backend, { ...statusFile({ public: true }), merges: [merge], commits }, fixture);
    const rows = Array.from(element.querySelectorAll('[data-testid="commit-graph"] li'));

    expect(rows.length).toBe(4);
    expect(rows[0].textContent).toContain('feat/x');
    expect(rows[0].textContent).toContain('CI correcta');
    expect(rows[0].querySelectorAll('svg.lanes path').length).toBeGreaterThan(1);
    // La rama corre en paralelo a main: dos carriles con trazo en la fila de «fix: y».
    expect(new Set(Array.from(rows[2].querySelectorAll('svg.lanes path')).map((path) => path.getAttribute('d')!.split(' ')[0])).size).toBe(2);
  });

  it('opens the PR detail for a merge and the commit detail for any other commit', () => {
    const { fixture, backend, element } = setup(MergeHistoryComponent);
    serveSnapshot(backend, { ...statusFile({ public: true }), merges: [merge], commits }, fixture);

    element.querySelector<HTMLButtonElement>(`[data-commit="${sha('3')}"]`)!.click();
    fixture.detectChanges();
    expect(element.querySelector('div[aria-live="polite"]')!.textContent).toContain('CI del merge');

    element.querySelector<HTMLButtonElement>(`[data-commit="${sha('2')}"]`)!.click();
    fixture.detectChanges();
    const detail = element.querySelector('[data-testid="commit-detail"]')!;
    expect(detail.textContent).toContain('fix: y');
    expect(detail.querySelector('a')!.getAttribute('href')).toBe(`https://github.com/owner/repo/commit/${sha('2')}`);
  });

  it('lights up the branch of the commit under the cursor, from where it forks to where it merges, and dims the rest', () => {
    const { fixture, backend, element } = setup(MergeHistoryComponent);
    serveSnapshot(backend, { ...statusFile({ public: true }), merges: [merge], commits }, fixture);
    const rows = () => Array.from(element.querySelectorAll<HTMLElement>('[data-testid="commit-graph"] li'));

    rows()[1].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    // La rama feat/x: sale del merge (fila 0), pasa por su commit y por la fila de main, y vuelve a init.
    expect(rows().map((row) => row.querySelectorAll('.seg.hl').length > 0)).toEqual([true, true, true, true]);
    expect(rows()[1].querySelector('.dot.hl')).not.toBeNull();
    expect(rows()[2].querySelector('.dot.hl')).toBeNull();
    expect(element.querySelector('.commit-log.has-path')).not.toBeNull();

    rows()[1].dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    // Sin cursor, vuelve a la rama del commit seleccionado (HEAD, en main).
    expect(rows()[1].querySelector('.dot.hl')).toBeNull();
    expect(rows()[2].querySelector('.dot.hl')).not.toBeNull();
  });
});
