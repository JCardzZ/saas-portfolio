import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { MCPService, McpStatus } from '../../../core/api';
import { runtimeConfig } from '../../../core/config/runtime-config';
import { SystemEventsService } from '../data/system-events.service';
import {
  ClientGuide, EVAL_URL, EvalReport, SESSION_URL, SessionRecording, SessionStep, ToolActivity, ToolCard, activityOf, clientGuides, parseActivity,
  parseEval, parseRecording, toolsOf,
} from './mcp-data';

/** Etiqueta de las llamadas MCP en la consola de eventos (ver `telemetry-stream.service.ts`). */
export const MCP_EVENT_TAG = 'MCP tool';
const CURSOR_LINK = 'cursor://anysphere.cursor-deeplink/mcp/install?';
const REPLAY_STEP_MS = 900;

/**
 * Sección «Usa mi plataforma desde tu IA» (flag `mcp.section`): cómo conectar un cliente MCP al
 * servidor de la plataforma, qué herramientas ofrece, cómo está respondiendo y una sesión real
 * grabada para verlo sin instalar nada.
 *
 * Lo que es en vivo viene de la API (`/public/mcp/status`) y del canal de telemetría. En modo
 * demo no hay servidor: se enseña lo mismo sacado de la grabación, con la etiqueta «Grabación».
 */
@Component({
    selector: 'app-mcp-section',
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
    <div class="grid gap-4 lg:grid-cols-2" data-testid="mcp-section">
      <!-- Conectar -->
      <section class="ui-card min-w-0 lg:col-span-2" aria-labelledby="mcp-connect-title">
        <h3 id="mcp-connect-title" class="text-base font-semibold text-ink-1">{{ 'Conectar en un clic' | t }}</h3>
        <p class="mt-1 text-sm text-ink-2">
          {{ 'El servidor está en' | t }} <code class="break-all rounded-control bg-surface-2 px-1.5 py-0.5 text-xs text-ink-1" data-testid="mcp-url">{{ url }}</code>{{ '. No pide cuenta ni clave.' | t }}
        </p>
        <div class="mt-4 ui-segmented" role="tablist" [attr.aria-label]="'Cliente' | t">
          @for (guide of guides; track guide.id) {
            <button type="button" role="tab" class="ui-segment" [attr.aria-selected]="guide.id === client().id" [attr.aria-controls]="'mcp-client-panel'" (click)="clientId.set(guide.id)">{{ guide.name }}</button>
          }
        </div>
        <div id="mcp-client-panel" role="tabpanel" class="mt-3" [attr.aria-label]="client().name">
          <p class="text-sm text-ink-2">{{ client().how | t }}</p>
          <pre class="mt-2 overflow-x-auto rounded-panel border border-line-subtle bg-surface-2 p-3 text-xs leading-relaxed text-ink-1" data-testid="mcp-copy-text"><code>{{ client().copy }}</code></pre>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            @if (client().link; as link) {
              <a class="ui-btn-primary" [href]="safe(link.href)" data-testid="mcp-install-link">{{ link.label | t }}</a>
            }
            <button type="button" class="ui-btn-secondary" (click)="copy(client())">{{ copied() === client().id ? ('Copiado' | t) : (client().copyLabel | t) }}</button>
          </div>
        </div>
      </section>

      <!-- Herramientas -->
      <section class="ui-card min-w-0" aria-labelledby="mcp-tools-title">
        <h3 id="mcp-tools-title" class="text-base font-semibold text-ink-1">
          {{ 'Herramientas' | t }}
          @if (recorded()) { <span class="ml-1 ui-badge ui-badge-warn" data-testid="mcp-recorded">{{ 'Grabación' | t }}</span> }
        </h3>
        <p class="mt-1 text-sm text-ink-2">{{ 'Las que el servidor anuncia en' | t }} <code class="text-xs">tools/list</code>{{ '. Ninguna guarda ni aplica nada.' | t }}</p>
        @if (tools().length) {
          <ul class="mt-3 space-y-3" data-testid="mcp-tools">
            @for (tool of tools(); track tool.name) {
              <li class="min-w-0">
                <p class="flex flex-wrap items-center gap-2">
                  <code class="break-all text-sm font-semibold text-ink-1">{{ tool.name }}</code>
                  <span class="ui-badge" [class.ui-badge-accent]="tool.kind === 'generate'">{{ tool.kind === 'generate' ? ('Genera' | t) : ('Lectura' | t) }}</span>
                  @if (tool.version) { <span class="text-xs text-ink-3">v{{ tool.version }}</span> }
                </p>
                <p class="mt-0.5 text-xs leading-snug text-ink-2">{{ tool.title | t }}</p>
              </li>
            }
          </ul>
        } @else {
          <p class="mt-3 text-sm text-ink-3">{{ 'No se pudo leer la lista de herramientas.' | t }}</p>
        }
      </section>

      <!-- Estado y actividad -->
      <section class="ui-card min-w-0" aria-labelledby="mcp-status-title">
        <h3 id="mcp-status-title" class="text-base font-semibold text-ink-1">{{ 'Estado' | t }}</h3>
        <dl class="mt-3 grid grid-cols-2 gap-3 text-sm" data-testid="mcp-status">
          <div>
            <dt class="text-xs text-ink-3">{{ 'Servidor' | t }}</dt>
            <dd class="mt-0.5">
              @if (status(); as live) {
                <span class="ui-badge ui-badge-ok"><span class="ui-badge-dot"></span>{{ 'En línea' | t }}</span>
              } @else if (recorded()) {
                <span class="ui-badge ui-badge-warn">{{ 'Grabación' | t }}</span>
              } @else {
                <span class="ui-badge"><span class="ui-badge-dot"></span>{{ statusFailed() ? ('Sin respuesta' | t) : ('Comprobando…' | t) }}</span>
              }
            </dd>
          </div>
          <div>
            <dt class="text-xs text-ink-3">{{ 'Latencia p95' | t }}</dt>
            <dd class="mt-0.5 text-ink-1">{{ p95() | t }}</dd>
          </div>
          <div>
            <dt class="text-xs text-ink-3">{{ 'Límite por cliente' | t }}</dt>
            <dd class="mt-0.5 text-ink-1">{{ limit() }}</dd>
          </div>
          <div>
            <dt class="text-xs text-ink-3">{{ 'Tope diario' | t }}</dt>
            <dd class="mt-0.5 text-ink-1">{{ daily() }}</dd>
          </div>
        </dl>
        <p class="mt-2 text-xs leading-snug text-ink-3">
          {{ 'El límite va por dirección de origen. Claude Desktop se conecta desde la nube de su proveedor, así que sus usuarios comparten cupo.' | t }}
        </p>

        <h4 class="mt-4 text-sm font-semibold text-ink-1">
          Actividad reciente
          @if (activityRecorded()) { <span class="ml-1 ui-badge ui-badge-warn">{{ 'Grabación' | t }}</span> }
        </h4>
        <p class="text-xs text-ink-3">{{ 'Anónima: qué herramienta, cómo acabó y cuánto tardó. Nunca el contenido.' | t }}</p>
        @if (activity().length) {
          <ul class="mt-2 space-y-1 text-xs" data-testid="mcp-activity">
            @for (call of activity(); track $index) {
              <li class="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-control bg-surface-2 px-2 py-1">
                <code class="text-ink-1">{{ call.tool }}</code>
                <span [class]="call.outcome === 'ok' ? 'text-status-ok' : 'text-status-warn'">{{ (call.outcome === 'ok' ? 'correcta' : outcomeLabel(call.outcome)) | t }}</span>
                <span class="text-ink-2">{{ call.latencyMs }} ms</span>
                @if (call.time) { <span class="ml-auto text-ink-3">{{ call.time }}</span> }
              </li>
            }
          </ul>
        } @else {
          <p class="mt-2 text-xs text-ink-3">{{ 'Todavía no ha llegado ninguna llamada desde que abriste la página.' | t }}</p>
        }
      </section>

      <!-- Probar sin instalar -->
      <section class="ui-card min-w-0 lg:col-span-2" aria-labelledby="mcp-replay-title">
        <div class="flex flex-wrap items-center gap-3">
          <div class="min-w-0 flex-1">
            <h3 id="mcp-replay-title" class="text-base font-semibold text-ink-1">{{ 'Probar sin instalar' | t }} <span class="ml-1 ui-badge ui-badge-warn">{{ 'Grabación' | t }}</span></h3>
            <p class="mt-1 text-sm text-ink-2">{{ 'Una sesión MCP real contra este servidor, mensaje a mensaje, como la enseña el Inspector de MCP. El diagrama es sintético.' | t }}</p>
          </div>
          @if (recording(); as session) {
            <div class="flex items-center gap-2">
              <button type="button" class="ui-btn-primary" [disabled]="playing()" (click)="play()">{{ shown() >= session.steps.length ? ('Reproducir otra vez' | t) : shown() ? ('Continuar' | t) : ('Reproducir' | t) }}</button>
              <button type="button" class="ui-btn-secondary" [disabled]="shown() >= session.steps.length" (click)="next()">{{ 'Siguiente' | t }}</button>
            </div>
          }
        </div>
        @if (recording(); as session) {
          <p class="mt-3 text-xs text-ink-3" aria-live="polite" data-testid="mcp-replay-progress">{{ shown() }} {{ 'de' | t }} {{ session.steps.length }} {{ 'mensajes · protocolo' | t }} {{ session.protocolVersion }}</p>
          <ol class="mt-2 space-y-2" data-testid="mcp-replay">
            @for (step of visibleSteps(); track $index) {
              <li class="min-w-0 rounded-panel border border-line-subtle bg-surface-2">
                <details [open]="$index === visibleSteps().length - 1">
                  <summary class="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <span class="ui-badge" [class.ui-badge-accent]="step.direction === 'request'">{{ step.direction === 'request' ? ('cliente →' | t) : ('← servidor' | t) }}</span>
                    <code class="text-ink-1">{{ methodOf(step) }}</code>
                    <span class="text-ink-2">{{ step.label | t }}</span>
                    @if (step.ms !== undefined) { <span class="ml-auto text-ink-3">{{ step.ms }} ms</span> }
                  </summary>
                  <pre class="max-h-72 overflow-auto border-t border-line-subtle p-3 text-xs leading-relaxed text-ink-1"><code>{{ pretty(step) }}</code></pre>
                </details>
              </li>
            }
          </ol>
        } @else {
          <p class="mt-3 text-sm text-ink-3">{{ recordingFailed() ? ('No se pudo cargar la grabación.' | t) : ('Cargando la grabación…' | t) }}</p>
        }
      </section>

      <!-- Evaluaciones -->
      <section class="ui-card min-w-0 lg:col-span-2" aria-labelledby="mcp-eval-title">
        <h3 id="mcp-eval-title" class="text-base font-semibold text-ink-1">{{ 'Evaluaciones' | t }}</h3>
        @if (evaluation(); as report) {
          <p class="mt-1 text-sm text-ink-2" data-testid="mcp-eval">
            <strong class="font-semibold text-ink-1">{{ report.passed }} {{ 'de' | t }} {{ report.total }}</strong> {{ 'tareas resueltas' | t }}
            · {{ report.simulated ? ('modelo simulado y determinista' | t) : report.model }}
            · {{ report.toolCalls }} {{ 'llamadas a herramientas' | t }}
            · <time [attr.datetime]="report.generatedAt">{{ dateOf(report.generatedAt) }}</time>
          </p>
          <p class="mt-2 text-xs leading-snug text-ink-3">
            {{ 'Tareas sintéticas, sin datos de nadie, resueltas con un cliente MCP real contra el servidor. En cada cambio las resuelve un modelo simulado, que comprueba el servidor; la evaluación con un modelo real es nocturna y' | t }}
            {{ (report.simulated ? 'todavía no se ha ejecutado.' : 'es esta.') | t }}
            {{ 'El detalle está en' | t }} <code>docs/mcp/README.md</code>{{ ', en el repositorio.' | t }}
          </p>
          <ul class="mt-3 flex flex-wrap gap-1.5" [attr.aria-label]="'Tareas por área' | t">
            @for (area of areas(); track area.name) {
              <li class="ui-badge" [class.ui-badge-ok]="area.passed === area.total" [class.ui-badge-warn]="area.passed !== area.total">{{ area.name | t }} {{ area.passed }}/{{ area.total }}</li>
            }
          </ul>
        } @else {
          <p class="mt-1 text-sm text-ink-3">{{ evalFailed() ? ('No se pudieron cargar los resultados.' | t) : ('Cargando los resultados…' | t) }}</p>
        }
      </section>
    </div>
  `
})
export class McpSectionComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);
  private readonly api = inject(MCPService);
  private readonly events = inject(SystemEventsService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  /** Dirección del servidor MCP: la de la API con `/mcp`. */
  readonly url = `${runtimeConfig.apiBaseUrl}/mcp`;
  readonly guides = clientGuides(this.url);
  readonly clientId = signal<ClientGuide['id']>('claude-code');
  readonly client = computed(() => this.guides.find((guide) => guide.id === this.clientId())!);
  readonly copied = signal<string | null>(null);

  readonly status = signal<McpStatus | null>(null);
  readonly statusFailed = signal(false);
  readonly recording = signal<SessionRecording | null>(null);
  readonly recordingFailed = signal(false);
  readonly evaluation = signal<EvalReport | null>(null);
  readonly evalFailed = signal(false);

  /** Sin estado en vivo (modo demo, o el servidor no responde), lo que se enseña sale de la grabación. */
  readonly recorded = computed(() => !this.status() && this.recording() !== null && (runtimeConfig.mockMode || this.statusFailed()));
  readonly tools = computed<ToolCard[]>(() => {
    const live = this.status();
    if (live) {
      return live.tools.map((tool) => ({ name: tool.name, title: tool.title, description: tool.description, kind: tool.kind === 'generate' ? 'generate' : 'read', version: tool.version }));
    }
    const session = this.recording();
    return session ? toolsOf(session) : [];
  });
  readonly p95 = computed(() => {
    const live = this.status();
    if (!live) {
      return '—';
    }
    return live.latency.p95Ms === undefined ? 'sin llamadas todavía' : `${Math.round(live.latency.p95Ms)} ms · ${live.latency.calls} ${this.calls()}`;
  });
  readonly limit = computed(() => {
    const limits = this.status()?.limits;
    const en = this.language.lang() === 'en';
    return limits ? `${limits.perClient} ${this.calls()} ${en ? 'per' : 'cada'} ${limits.windowSeconds === 60 ? (en ? 'minute' : 'minuto') : limits.windowSeconds + ' s'}` : '—';
  });
  readonly daily = computed(() => {
    const limits = this.status()?.limits;
    return limits ? `${limits.dailyTotal.toLocaleString(this.language.lang() === 'en' ? 'en-US' : 'es-ES')} ${this.calls()}` : '—';
  });

  /** Llamadas que han llegado por el canal de telemetría mientras la página está abierta. */
  private readonly liveActivity = computed(() => this.events.events()
    .filter((event) => event.origin === 'live' && event.tag === MCP_EVENT_TAG)
    .flatMap((event): ToolActivity[] => {
      const call = parseActivity(event.detail, event.time);
      return call ? [call] : [];
    }).slice(0, 6));
  readonly activityRecorded = computed(() => this.liveActivity().length === 0 && this.recorded());
  readonly activity = computed<ToolActivity[]>(() => {
    if (this.liveActivity().length) {
      return this.liveActivity();
    }
    const session = this.recording();
    return this.recorded() && session ? activityOf(session) : [];
  });

  // ---------- Reproducción ----------
  readonly shown = signal(0);
  readonly playing = signal(false);
  readonly visibleSteps = computed(() => this.recording()?.steps.slice(0, this.shown()) ?? []);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly areas = computed(() => {
    const byArea = new Map<string, { name: string; passed: number; total: number }>();
    for (const task of this.evaluation()?.tasks ?? []) {
      const area = byArea.get(task.area) ?? { name: task.area, passed: 0, total: 0 };
      area.total++;
      area.passed += task.passed ? 1 : 0;
      byArea.set(task.area, area);
    }
    return [...byArea.values()];
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stop());
  }

  ngOnInit(): void {
    if (runtimeConfig.mockMode) {
      // En modo demo no hay servidor al que preguntar: no se finge uno.
      this.statusFailed.set(true);
    } else {
      this.api.publicMcpStatusGet().subscribe({
        next: (status) => this.status.set(status),
        error: () => this.statusFailed.set(true),
      });
    }
    this.http.get<unknown>(SESSION_URL).subscribe({
      next: (body) => {
        const parsed = parseRecording(body);
        this.recording.set(parsed);
        this.recordingFailed.set(parsed === null);
      },
      error: () => this.recordingFailed.set(true),
    });
    this.http.get<unknown>(EVAL_URL).subscribe({
      next: (body) => {
        const parsed = parseEval(body);
        this.evaluation.set(parsed);
        this.evalFailed.set(parsed === null);
      },
      error: () => this.evalFailed.set(true),
    });
  }

  /** El enlace de instalación de un cliente. Solo se confía en el esquema que construye esta sección. */
  safe(href: string): SafeUrl | string {
    return href.startsWith(CURSOR_LINK) ? this.sanitizer.bypassSecurityTrustUrl(href) : '';
  }

  async copy(guide: ClientGuide): Promise<void> {
    try {
      await navigator.clipboard.writeText(guide.copy);
      this.copied.set(guide.id);
    } catch {
      this.copied.set(null);
    }
  }

  private calls(): string {
    return this.language.lang() === 'en' ? 'calls' : 'llamadas';
  }

  outcomeLabel(outcome: string): string {
    return outcome === 'rate_limited' ? 'límite alcanzado' : outcome === 'invalid_input' ? 'entrada no válida' : 'error';
  }

  methodOf(step: SessionStep): string {
    const method = step.message['method'];
    if (typeof method === 'string') {
      const params = step.message['params'] as { name?: unknown } | undefined;
      return method === 'tools/call' && typeof params?.name === 'string' ? `tools/call · ${params.name}` : method;
    }
    return 'error' in step.message ? 'error' : 'resultado';
  }

  pretty(step: SessionStep): string {
    return JSON.stringify(step.message, null, 2);
  }

  dateOf(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(this.language.lang() === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  next(): void {
    const total = this.recording()?.steps.length ?? 0;
    this.shown.update((shown) => Math.min(total, shown + 1));
  }

  /** Enseña los mensajes uno a uno. Con «reducir movimiento», todos de golpe. */
  play(): void {
    const total = this.recording()?.steps.length ?? 0;
    if (!total || this.playing()) {
      return;
    }
    if (this.shown() >= total) {
      this.shown.set(0);
    }
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.shown.set(total);
      return;
    }
    this.playing.set(true);
    this.next();
    this.timer = setInterval(() => {
      this.next();
      if (this.shown() >= total) {
        this.stop();
      }
    }, REPLAY_STEP_MS);
  }

  private stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.playing.set(false);
  }
}
