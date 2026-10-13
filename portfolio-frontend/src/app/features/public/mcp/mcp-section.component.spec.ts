import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { MCPService, McpStatus } from '../../../core/api';
import { resetRuntimeConfig, runtimeConfig } from '../../../core/config/runtime-config';
import { SystemEventsService } from '../data/system-events.service';
import { activityOf, clientGuides, parseActivity, parseEval, parseRecording, toolsOf } from './mcp-data';
import { McpSectionComponent } from './mcp-section.component';

const RECORDING = {
  protocolVersion: '2025-11-25',
  note: 'Sesión de prueba',
  steps: [
    { direction: 'request', label: 'Conectar', message: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } },
    { direction: 'response', label: 'Conectar', ms: 12, message: { jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'portfolio-platform' } } } },
    { direction: 'request', label: 'Ver las herramientas', message: { jsonrpc: '2.0', id: 2, method: 'tools/list' } },
    {
      direction: 'response', label: 'Ver las herramientas', ms: 4,
      message: {
        jsonrpc: '2.0', id: 2,
        result: {
          tools: [
            { name: 'validar_arquitectura', title: 'Validar una arquitectura', description: 'Comprueba un diagrama.', _meta: { kind: 'read', version: '1.0.0' } },
            { name: 'generar_terraform', title: 'Generar el esqueleto de Terraform', description: 'Genera main.tf.', _meta: { kind: 'generate', version: '1.2.0' } },
          ],
        },
      },
    },
    { direction: 'request', label: 'Validar una arquitectura', message: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'validar_arquitectura', arguments: {} } } },
    { direction: 'response', label: 'Validar una arquitectura', ms: 31, message: { jsonrpc: '2.0', id: 3, result: { isError: false, content: [{ type: 'text', text: 'ok' }] } } },
  ],
};
const EVAL = {
  generatedAt: '2026-10-12T13:59:21Z', model: 'simulado (determinista)', simulated: true, total: 3, passed: 3, toolCalls: 4,
  tasks: [
    { id: 'T01', area: 'plantillas', passed: true, calls: 1, latencyMs: 5, failures: [] },
    { id: 'T04', area: 'validación', passed: true, calls: 1, latencyMs: 5, failures: [] },
    { id: 'T05', area: 'validación', passed: true, calls: 2, latencyMs: 9, failures: [] },
  ],
};
const STATUS: McpStatus = {
  online: true, endpoint: '/mcp', protocolVersion: '2025-11-25', server: { name: 'portfolio-platform', version: '1.0.0' },
  tools: [
    { name: 'listar_plantillas', title: 'Listar plantillas de arquitectura', description: 'Devuelve las plantillas.', kind: 'read', version: '1.0.0' },
    { name: 'disenar_sistema', title: 'Diseñar un sistema completo', description: 'Propone un sistema.', kind: 'generate', version: '1.0.0' },
  ],
  limits: { perClient: 30, windowSeconds: 60, dailyTotal: 2000 },
  latency: { calls: 128, p50Ms: 14.2, p95Ms: 240.5 },
};

describe('MCP section data', () => {
  it('builds the way to connect each client documents, with a one-click link only where there is one', () => {
    const guides = clientGuides('https://api.test/v1/mcp');

    expect(guides.map((guide) => guide.name)).toEqual(['Claude Code', 'Claude Desktop', 'Cursor', 'VS Code']);
    expect(guides[0].copy).toBe('claude mcp add --transport http portfolio https://api.test/v1/mcp');
    expect(guides[1].copy).toBe('https://api.test/v1/mcp');
    expect(JSON.parse(guides[2].copy)).toEqual({ mcpServers: { portfolio: { url: 'https://api.test/v1/mcp' } } });
    expect(JSON.parse(guides[3].copy)).toEqual({ servers: { portfolio: { type: 'http', url: 'https://api.test/v1/mcp' } } });
    expect(guides.filter((guide) => guide.link).map((guide) => guide.id)).toEqual(['cursor']);
    const link = new URL(guides[2].link!.href);
    expect(link.protocol).toBe('cursor:');
    expect(link.searchParams.get('name')).toBe('portfolio');
    expect(JSON.parse(atob(link.searchParams.get('config')!))).toEqual({ url: 'https://api.test/v1/mcp' });
  });

  it('reads the tools and the anonymous activity out of a recorded session', () => {
    const recording = parseRecording(RECORDING)!;

    expect(toolsOf(recording)).toEqual([
      { name: 'validar_arquitectura', title: 'Validar una arquitectura', description: 'Comprueba un diagrama.', kind: 'read', version: '1.0.0' },
      { name: 'generar_terraform', title: 'Generar el esqueleto de Terraform', description: 'Genera main.tf.', kind: 'generate', version: '1.2.0' },
    ]);
    expect(activityOf(recording)).toEqual([{ tool: 'validar_arquitectura', outcome: 'ok', latencyMs: 31, time: null }]);
  });

  it('does not trust a file that is not a recording or a report', () => {
    expect(parseRecording(null)).toBeNull();
    expect(parseRecording({ steps: [] })).toBeNull();
    expect(parseRecording({ steps: [{ direction: 'sideways', label: 'x', message: {} }, 'texto'] })).toBeNull();
    expect(parseEval({ total: '3' })).toBeNull();
    expect(parseEval(EVAL)!.passed).toBe(3);
  });

  it('reads a telemetry event only if it is exactly tool, outcome and latency', () => {
    expect(parseActivity('tool=estimar_costos outcome=rate_limited latencyMs=3', '12:00:01'))
      .toEqual({ tool: 'estimar_costos', outcome: 'rate_limited', latencyMs: 3, time: '12:00:01' });
    expect(parseActivity('tool=x outcome=ok latencyMs=3 pregunta=¿secreto?', '12:00')).toBeNull();
    expect(parseActivity('cualquier otra cosa', '12:00')).toBeNull();
  });
});

describe('McpSectionComponent', () => {
  let status: () => Observable<McpStatus>;

  beforeEach(() => {
    status = () => of(STATUS);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: MCPService, useValue: { publicMcpStatusGet: () => status() } },
      ],
    });
    (runtimeConfig as { mockMode: boolean }).mockMode = false;
    (runtimeConfig as { apiBaseUrl: string }).apiBaseUrl = 'https://api.test/v1';
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    resetRuntimeConfig();
  });

  function create(files: { recording?: unknown; evaluation?: unknown } = { recording: RECORDING, evaluation: EVAL }) {
    const fixture = TestBed.createComponent(McpSectionComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const session = http.expectOne('mcp/session.json');
    const report = http.expectOne('mcp/mcp-eval.json');
    files.recording === undefined ? session.error(new ProgressEvent('error')) : session.flush(files.recording);
    files.evaluation === undefined ? report.error(new ProgressEvent('error')) : report.flush(files.evaluation);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  const text = (element: HTMLElement, testId: string) => element.querySelector(`[data-testid="${testId}"]`)!.textContent!.replace(/\s+/g, ' ').trim();
  /** El texto de cada hoja del árbol, separado por espacios: entre elementos en línea la plantilla no deja ninguno. */
  const leaves = (root: Element) => Array.from(root.querySelectorAll('*')).filter((node) => node.children.length === 0)
    .map((node) => node.textContent!.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');

  describe('connecting a client', () => {
    it('shows the address of the server and, per client, what to copy', () => {
      const { fixture, element } = create();

      expect(text(element, 'mcp-url')).toBe('https://api.test/v1/mcp');
      expect(text(element, 'mcp-copy-text')).toBe('claude mcp add --transport http portfolio https://api.test/v1/mcp');
      expect(element.querySelector('[data-testid="mcp-install-link"]')).toBeNull();

      const tabs = Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Cliente"] [role="tab"]'));
      expect(tabs.map((tab) => tab.textContent!.trim())).toEqual(['Claude Code', 'Claude Desktop', 'Cursor', 'VS Code']);
      tabs[3].click();
      fixture.detectChanges();
      expect(text(element, 'mcp-copy-text')).toContain('"type": "http"');
    });

    it('offers a real install link only for the client that documents one', () => {
      const { fixture, element } = create();
      Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Cliente"] [role="tab"]'))[2].click();
      fixture.detectChanges();

      const link = element.querySelector<HTMLAnchorElement>('[data-testid="mcp-install-link"]')!;
      expect(link.textContent!.trim()).toBe('Añadir a Cursor');
      expect(link.getAttribute('href')).toMatch(/^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=portfolio&config=/);
    });

    it('only trusts the install scheme it builds itself', () => {
      const { component } = create();

      expect(component.safe('javascript:alert(1)')).toBe('');
      expect(component.safe('https://example.com')).toBe('');
    });

    it('copies the command to the clipboard', async () => {
      const written: string[] = [];
      spyOn(navigator.clipboard, 'writeText').and.callFake((value: string) => {
        written.push(value);
        return Promise.resolve();
      });
      const { fixture, element, component } = create();

      await component.copy(component.client());
      fixture.detectChanges();

      expect(written).toEqual(['claude mcp add --transport http portfolio https://api.test/v1/mcp']);
      expect(element.querySelector('#mcp-client-panel .ui-btn-secondary')!.textContent).toContain('Copiado');
    });
  });

  describe('with the server answering', () => {
    it('lists the tools the server publishes, each as read or generate', () => {
      const { element } = create();

      const tools = Array.from(element.querySelectorAll('[data-testid="mcp-tools"] li')).map(leaves);
      expect(tools).toEqual([
        'listar_plantillas Lectura v1.0.0 Listar plantillas de arquitectura',
        'disenar_sistema Genera v1.0.0 Diseñar un sistema completo',
      ]);
      expect(element.querySelector('[data-testid="mcp-recorded"]')).toBeNull();
    });

    it('shows it online with its real p95 and its limits', () => {
      const { element } = create();

      const state = text(element, 'mcp-status');
      expect(state).toContain('En línea');
      expect(state).toContain('241 ms · 128 llamadas');
      expect(state).toContain('30 llamadas cada minuto');
      expect(state).toContain('2000 llamadas');
      expect(element.textContent).toContain('sus usuarios comparten cupo');
    });

    it('says there is no latency yet before the first call', () => {
      status = () => of({ ...STATUS, latency: { calls: 0 } });
      const { element } = create();

      expect(text(element, 'mcp-status')).toContain('sin llamadas todavía');
    });

    it('shows the calls that arrive on the telemetry channel, and nothing but tool, outcome and latency', () => {
      const { fixture, element } = create();
      expect(element.querySelector('[data-testid="mcp-activity"]')).toBeNull();

      const events = TestBed.inject(SystemEventsService);
      events.emitLive('ai', 'MCP tool', 'tool=generar_terraform outcome=ok latencyMs=18', new Date(2026, 9, 12, 12, 0, 1));
      events.emitLive('ai', 'MCP tool', 'tool=estimar_costos outcome=rate_limited latencyMs=2', new Date(2026, 9, 12, 12, 0, 2));
      events.emitLive('ai', 'RAG query', 'una pregunta de otro sitio', new Date());
      events.emitLive('ai', 'MCP tool', 'tool=x outcome=ok latencyMs=1 contenido=secreto', new Date());
      fixture.detectChanges();

      const lines = Array.from(element.querySelectorAll('[data-testid="mcp-activity"] li')).map(leaves);
      expect(lines.length).toBe(2);
      expect(lines.join(' | ')).toContain('generar_terraform correcta 18 ms');
      expect(lines.join(' | ')).toContain('estimar_costos límite alcanzado 2 ms');
      expect(element.textContent).not.toContain('secreto');
    });
  });

  describe('without a server (demo mode)', () => {
    beforeEach(() => {
      (runtimeConfig as { mockMode: boolean }).mockMode = true;
      status = () => throwError(() => new Error('no debería llamarse'));
    });

    it('does not ask the API and shows the recording, labelled as such', () => {
      const asked = jasmine.createSpy('status');
      status = () => {
        asked();
        return of(STATUS);
      };
      const { element } = create();

      expect(asked).not.toHaveBeenCalled();
      expect(text(element, 'mcp-recorded')).toBe('Grabación');
      expect(Array.from(element.querySelectorAll('[data-testid="mcp-tools"] code')).map((item) => item.textContent)).toEqual(['validar_arquitectura', 'generar_terraform']);
      const state = text(element, 'mcp-status');
      expect(state).toContain('Grabación');
      expect(state).not.toContain('En línea');
      // La actividad también es la de la grabación, y se dice.
      expect(leaves(element.querySelector('[data-testid="mcp-activity"]')!)).toContain('validar_arquitectura correcta 31 ms');
      expect(element.querySelector('#mcp-status-title')!.parentElement!.querySelectorAll('.ui-badge-warn').length).toBe(2);
    });
  });

  describe('trying it without installing', () => {
    it('replays the recorded session message by message', fakeAsync(() => {
      spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
      const { fixture, element, component } = create();
      expect(text(element, 'mcp-replay-progress')).toBe('0 de 6 mensajes · protocolo 2025-11-25');

      component.play();
      fixture.detectChanges();
      expect(element.querySelectorAll('[data-testid="mcp-replay"] > li').length).toBe(1);
      expect(element.querySelector('[data-testid="mcp-replay"] summary')!.textContent).toContain('cliente →');

      tick(900 * 5);
      fixture.detectChanges();
      const steps = Array.from(element.querySelectorAll('[data-testid="mcp-replay"] summary')).map(leaves);
      expect(steps.length).toBe(6);
      expect(steps[4]).toBe('cliente → tools/call · validar_arquitectura Validar una arquitectura');
      expect(steps[5]).toBe('← servidor resultado Validar una arquitectura 31 ms');
      expect(component.playing()).toBeFalse();
      expect(element.querySelector('[data-testid="mcp-replay"] li:last-child pre')!.textContent).toContain('"isError": false');
    }));

    it('can be stepped by hand, and shows everything at once with reduced motion', () => {
      spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
      const { fixture, element, component } = create();

      component.next();
      component.next();
      fixture.detectChanges();
      expect(element.querySelectorAll('[data-testid="mcp-replay"] > li').length).toBe(2);

      component.play();
      fixture.detectChanges();
      expect(element.querySelectorAll('[data-testid="mcp-replay"] > li').length).toBe(6);
      expect(component.playing()).toBeFalse();
    });

    it('says so when the recording cannot be loaded', () => {
      const { element } = create({ evaluation: EVAL });

      expect(element.querySelector('#mcp-replay-title')!.closest('section')!.textContent).toContain('No se pudo cargar la grabación.');
    });
  });

  describe('evaluations', () => {
    it('shows how many tasks pass, with which model and when', () => {
      const { element } = create();

      const summary = text(element, 'mcp-eval');
      expect(summary).toContain('3 de 3 tareas resueltas');
      expect(summary).toContain('modelo simulado y determinista');
      expect(summary).toContain('12 de octubre de 2026');
      expect(element.textContent).toContain('todavía no se ha ejecutado');
      const areas = Array.from(element.querySelectorAll('[aria-label="Tareas por área"] li')).map((item) => item.textContent!.trim());
      expect(areas).toEqual(['plantillas 1/1', 'validación 2/2']);
    });

    it('says so when the results cannot be loaded', () => {
      const { element } = create({ recording: RECORDING });

      expect(element.querySelector('#mcp-eval-title')!.closest('section')!.textContent).toContain('No se pudieron cargar los resultados.');
    });
  });
});
