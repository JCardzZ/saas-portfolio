import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { AppPiece } from './app-catalog.data';
import { AppLink, AppNode } from './app-graph';
import { Finding, Review } from './app-advisor';
import { DrawnJourney } from './app-journey';
import { PIECE_LESSONS, PROTOCOL_LESSONS } from './app-learn.data';
import { Protocol } from './app-protocols';

export function levelName(level: string): string {
  return level === 'risk' ? 'Riesgo' : level === 'warn' ? 'Mejora' : 'Idea';
}

/**
 * Asistente del Estudio de Aplicación (flag `studio.app-canvas`): la revisión del diseño con sus
 * arreglos, el recorrido de una petición por lo dibujado y la lección de la pieza o el cable
 * elegidos. No toca el lienzo: avisa de qué arreglo aplicar y qué piezas resaltar.
 */
@Component({
  selector: 'app-app-assistant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 w-full' },
  template: `
<div class="appc-assistant" data-testid="appc-assistant">
  <div class="appc-assistant-head">
  <div class="appc-verdict" [attr.data-level]="review().verdict">
    <span class="appc-verdict-dot" aria-hidden="true"></span>
    <span class="min-w-0"><span class="block text-xs text-ink-3">Asistente</span><span class="block text-sm font-semibold text-ink-1" data-testid="appc-verdict">{{ review().headline }}</span></span>
  </div>
  <div class="ui-segmented appc-tabs" role="tablist" aria-label="Asistente">
    @for (tab of tabs; track tab.id) {
      <button type="button" role="tab" class="ui-segment" [attr.aria-selected]="assistantTab() === tab.id" (click)="assistantTab.set(tab.id)">
        {{ tab.label }}@if (tab.id === 'review' && review().findings.length) { <span class="appc-count">{{ review().findings.length }}</span> }
      </button>
    }
  </div>
  </div>

  <div class="appc-assistant-body">
    @switch (assistantTab()) {
      @case ('review') {
        @for (finding of review().findings; track finding.id) {
          <article class="appc-finding" [attr.data-level]="finding.level" [attr.data-finding]="finding.id"
            (mouseenter)="highlighted.emit(finding.nodeIds)" (mouseleave)="highlighted.emit(null)" (focusin)="highlighted.emit(finding.nodeIds)" (focusout)="highlighted.emit(null)">
            <p class="appc-finding-title"><span class="appc-level">{{ levelName(finding.level) }}</span>{{ finding.title }}</p>
            <p class="appc-finding-detail">{{ finding.detail }}</p>
            <details class="appc-learn">
              <summary>Por qué importa</summary>
              <p>{{ finding.learn }}</p>
            </details>
            @if (finding.fix) {
              <button type="button" class="appc-fix" (click)="fixed.emit(finding)">{{ finding.fix.label }}</button>
            }
          </article>
        } @empty {
          <p class="appc-calm">@if (hasNodes()) { Nada que objetar: entrada, identidad, datos protegidos y observabilidad en su sitio. } @else { Añade piezas y el asistente revisará el diseño mientras dibujas. }</p>
        }
      }
      @case ('journey') {
        @if (journey(); as path) {
          <div class="appc-journey">
          <div class="appc-journey-head">
            <span class="text-sm text-ink-2">El usuario espera <strong class="font-mono text-ink-1">≈ {{ path.totalMs }} ms</strong></span>
            <button type="button" class="ui-btn-secondary" [attr.aria-pressed]="playing()" (click)="playing() ? stop() : play()">{{ playing() ? 'Detener' : 'Reproducir' }}</button>
          </div>
          <ol class="appc-hops">
            <li class="appc-hop appc-hop-net"><span class="appc-hop-ms">{{ path.networkMs }} ms</span><span>Red pública, ida y vuelta</span></li>
            @for (step of path.hops; track step.nodeId; let i = $index) {
              <li class="appc-hop" [class.appc-hop-on]="playStep() === i" [class.appc-hop-async]="step.async" [attr.data-hop]="step.nodeId"
                (mouseenter)="highlighted.emit([step.nodeId])" (mouseleave)="highlighted.emit(null)">
                <span class="appc-hop-ms">{{ step.async ? 'después' : step.ms + ' ms' }}</span>
                <span class="min-w-0">
                  <span class="block text-sm text-ink-1">@if (step.protocol) { <code class="appc-proto">{{ step.protocol }}</code> }{{ step.name }}</span>
                  <span class="block text-xs text-ink-3"><span class="text-status-danger">Si cae:</span> {{ step.impact }}</span>
                  <span class="block text-xs text-ink-3"><span class="text-status-ok">Mitigación:</span> {{ step.mitigation }}</span>
                </span>
              </li>
            }
          </ol>
          <p class="text-xs text-ink-3">Órdenes de magnitud dentro de una región, no una medición.</p>
          </div>
        } @else {
          <p class="appc-calm">Conecta un cliente con la entrada y los servicios para ver el recorrido de una petición.</p>
        }
      }
      @case ('learn') {
        <div class="appc-lesson-wrap">
        @if (node(); as item) {
          @let lesson = lessonOf(item.node.type);
          <h6 class="appc-learn-title" [style.--layer]="item.color">{{ item.piece.name }} <span class="text-ink-3">· {{ item.tech }}</span></h6>
          @if (lesson) {
            <dl class="appc-lesson">
              <dt>Qué es</dt><dd>{{ lesson.what }}</dd>
              <dt>Cuándo usarlo</dt><dd>{{ lesson.when }}</dd>
              <dt>Qué evitar</dt><dd>{{ lesson.avoid }}</dd>
              <dt>Si cae</dt><dd>{{ lesson.failure.impact }} {{ lesson.failure.mitigation }}</dd>
            </dl>
          }
        } @else if (link(); as link) {
          <h6 class="appc-learn-title">{{ link.protocol }} <span class="text-ink-3">· {{ linkNames() }}</span></h6>
          <dl class="appc-lesson">
            <dt>Qué es</dt><dd>{{ protocolLesson(link.protocol).what }}</dd>
            <dt>Cuándo elegirlo</dt><dd>{{ protocolLesson(link.protocol).when }}</dd>
            <dt>Otras opciones aquí</dt><dd>{{ otherProtocols(link.protocol) }}</dd>
          </dl>
        } @else {
          <p class="appc-calm">Selecciona una pieza o un cable y aquí verás qué es, cuándo conviene, qué evitar y qué pasa si cae.</p>
        }
        </div>
      }
    }
  </div>
</div>
  `,
  styles: [`
    .appc-assistant { display: flex; flex-direction: column; width: 100%; min-height: 0; }
    .appc-assistant-body { grid-template-columns: var(--assistant-columns, repeat(auto-fill, minmax(17rem, 1fr))); }
    .appc-assistant-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.25rem 0.75rem; padding-right: 0.75rem; }
    .appc-assistant-body > .appc-calm, .appc-assistant-body > .appc-journey, .appc-assistant-body > .appc-lesson-wrap { grid-column: 1 / -1; }
    .appc-verdict { display: flex; align-items: center; gap: 0.6rem; padding: 0.75rem 0.9rem 0.5rem; }
    .appc-verdict-dot { flex: none; width: 0.65rem; height: 0.65rem; border-radius: 9999px; background: var(--status-ok); box-shadow: 0 0 0 4px rgb(var(--c-status-ok) / 0.15); }
    .appc-verdict[data-level='limited'] .appc-verdict-dot { background: var(--status-warn); box-shadow: 0 0 0 4px rgb(var(--c-status-warn) / 0.15); }
    .appc-verdict[data-level='risk'] .appc-verdict-dot { background: var(--status-danger); box-shadow: 0 0 0 4px rgb(var(--c-status-danger) / 0.15); }
    .appc-tabs { margin: 0.25rem 0 0.5rem 0.75rem; }
    .appc-count { margin-left: 0.3rem; padding: 0 0.35rem; border-radius: 9999px; background: rgb(var(--c-ink-1) / 0.1); font-size: 0.75rem; }
    .appc-assistant-body { flex: 1; overflow-y: auto; padding: 0 0.75rem 0.9rem; display: grid; gap: 0.5rem; align-content: start; }
    .appc-calm { padding: 0.5rem 0.25rem; font-size: 0.8125rem; line-height: 1.5; color: var(--text-3); }
    .appc-finding { padding: 0.6rem 0.7rem; border-radius: var(--radius-control); border: 1px solid var(--border-subtle); background: rgb(var(--c-surface-2) / 0.6); border-left-width: 3px; }
    .appc-finding[data-level='risk'] { border-left-color: var(--status-danger); }
    .appc-finding[data-level='warn'] { border-left-color: var(--status-warn); }
    .appc-finding[data-level='tip'] { border-left-color: var(--accent-text); }
    .appc-finding-title { font-size: 0.8125rem; font-weight: 600; color: var(--text-1); }
    .appc-level { margin-right: 0.4rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); }
    .appc-finding-detail { margin-top: 0.15rem; font-size: 0.8125rem; color: var(--text-2); }
    .appc-learn { margin-top: 0.3rem; font-size: 0.8125rem; color: var(--text-2); }
    .appc-learn summary { width: fit-content; cursor: pointer; font-size: 0.75rem; color: var(--accent-text); }
    .appc-learn p { margin-top: 0.25rem; line-height: 1.5; }
    .appc-fix { display: inline-flex; align-items: center; gap: 0.35rem; margin-top: 0.45rem; padding: 0.25rem 0.6rem; border-radius: 9999px; border: 1px solid rgb(var(--c-accent-solid) / 0.45); background: rgb(var(--c-accent-solid) / 0.1); color: var(--accent-text); font-size: 0.8125rem; font-weight: 600; text-align: left; }
    .appc-fix::before { content: '✦'; font-size: 0.75rem; }
    .appc-fix:hover { background: rgb(var(--c-accent-solid) / 0.2); }
    .appc-fix:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
    .appc-journey-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .appc-hops { display: grid; gap: 0.15rem; }
    .appc-hop { display: grid; grid-template-columns: 4rem minmax(0, 1fr); gap: 0.5rem; padding: 0.45rem 0.35rem; border-radius: var(--radius-control); transition: background var(--duration-fast); }
    .appc-hop:hover, .appc-hop-on { background: rgb(var(--c-accent-solid) / 0.08); }
    .appc-hop-async { opacity: 0.8; }
    .appc-hop-net { font-size: 0.8125rem; color: var(--text-3); }
    .appc-hop-ms { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-2); text-align: right; font-variant-numeric: tabular-nums; }
    .appc-proto { margin-right: 0.35rem; padding: 0 0.3rem; border-radius: 0.3rem; background: rgb(var(--c-ink-1) / 0.07); font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent-text); }
    .appc-learn-title { font-size: 0.875rem; font-weight: 600; color: var(--text-1); }
    .appc-lesson { display: grid; gap: 0.15rem 0; font-size: 0.8125rem; line-height: 1.5; }
    .appc-lesson dt { margin-top: 0.45rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); }
    .appc-lesson dd { margin: 0; color: var(--text-2); }
    @media (prefers-reduced-motion: reduce) { .appc-hop { transition: none; } }
  `],
})
export class AppAssistantComponent {
  readonly review = input.required<Review>();
  readonly journey = input<DrawnJourney | null>(null);
  readonly hasNodes = input(false);
  readonly node = input<{ node: AppNode; piece: AppPiece; color: string; tech: string } | null>(null);
  readonly link = input<AppLink | null>(null);
  readonly linkNames = input('');
  readonly alternatives = input<Protocol[]>([]);
  readonly fixed = output<Finding>();
  readonly highlighted = output<string[] | null>();

  readonly tabs = [{ id: 'review', label: 'Revisión' }, { id: 'journey', label: 'Recorrido' }, { id: 'learn', label: 'Aprende' }] as const;
  readonly assistantTab = signal<'review' | 'journey' | 'learn'>('review');
  readonly playStep = signal<number | null>(null);
  readonly playing = computed(() => this.playStep() !== null);
  private timer: ReturnType<typeof setInterval> | undefined;

  readonly levelName = levelName;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  lessonOf(type: string) {
    return PIECE_LESSONS[type];
  }

  protocolLesson(protocol: Protocol) {
    return PROTOCOL_LESSONS[protocol];
  }

  otherProtocols(current: Protocol): string {
    const others = this.alternatives().filter((protocol) => protocol !== current);
    return others.length ? others.map((protocol) => `${protocol}: ${PROTOCOL_LESSONS[protocol].when}`).join(' · ') : 'Es el único que aplica a esta pareja.';
  }

  /** Recorre los saltos de la petición uno a uno, resaltando cada pieza en el lienzo. */
  play(): void {
    this.stop();
    const hops = this.journey()?.hops ?? [];
    if (!hops.length) {
      return;
    }
    this.advance(0);
    this.timer = setInterval(() => {
      const next = (this.playStep() ?? 0) + 1;
      if (next >= (this.journey()?.hops.length ?? 0)) {
        this.stop();
      } else {
        this.advance(next);
      }
    }, 700);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    if (this.playStep() !== null) {
      this.playStep.set(null);
      this.highlighted.emit(null);
    }
  }

  private advance(index: number): void {
    this.playStep.set(index);
    this.highlighted.emit([this.journey()!.hops[index].nodeId]);
  }
}
