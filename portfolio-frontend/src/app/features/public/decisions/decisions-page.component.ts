import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { LanguageService, Localized } from '../../../core/i18n/language.service';
import { LanguageSwitchComponent } from '../../../core/i18n/language-switch.component';
import { MarkdownComponent } from '../../../shared/ui/markdown.component';
import { ADRS, AREAS, Adr, AreaId, REPOSITORY_URL, evidenceUrl, matchesQuery, relatedAdrs, sourceUrl, statusTone } from './decisions';

const COPY = {
  back: { es: 'Portafolio', en: 'Portfolio' },
  all: { es: 'Todas', en: 'All' },
  eyebrow: { es: 'Architecture Decision Records', en: 'Architecture Decision Records' },
  title: { es: 'Decisiones de arquitectura', en: 'Architecture decisions' },
  intro: {
    es: 'Por qué esta plataforma está hecha así. Cada decisión con su problema, las opciones que se miraron, por qué se eligió una y lo que cuesta. Se escriben en el repositorio y se revisan en un PR, como el código.',
    en: 'Why this platform is built the way it is. Every decision with its problem, the options weighed, why one was chosen and what it costs. They live in the repository and are reviewed in a PR, like the code.',
  },
  decisions: { es: 'decisiones', en: 'decisions' },
  areas: { es: 'áreas', en: 'areas' },
  accepted: { es: 'aceptadas', en: 'accepted' },
  format: { es: 'Formato y proceso', en: 'Format and process' },
  search: { es: 'Buscar decisión, tecnología o coste…', en: 'Search decision, tech or cost…' },
  filter: { es: 'Filtrar por área', en: 'Filter by area' },
  gains: { es: 'Gana', en: 'Gains' },
  costs: { es: 'Cuesta', en: 'Costs' },
  read: { es: 'Leer la decisión', en: 'Read the decision' },
  none: { es: 'Ninguna decisión coincide con la búsqueda.', en: 'No decision matches the search.' },
  clear: { es: 'Quitar filtros', en: 'Clear filters' },
  context: { es: 'Contexto', en: 'Context' },
  options: { es: 'Opciones', en: 'Options' },
  decision: { es: 'Decisión', en: 'Decision' },
  consequences: { es: 'Consecuencias', en: 'Consequences' },
  revisit: { es: 'Cuándo revisarla', en: 'When to revisit' },
  status: { es: 'Estado', en: 'Status' },
  date: { es: 'Fecha', en: 'Date' },
  area: { es: 'Área', en: 'Area' },
  evidence: { es: 'Dónde se ve en el código', en: 'Where it shows in the code' },
  related: { es: 'Relacionadas', en: 'Related' },
  source: { es: 'Ver el ADR en GitHub', en: 'View the ADR on GitHub' },
  index: { es: 'Todas las decisiones', en: 'All decisions' },
  previous: { es: 'Anterior', en: 'Previous' },
  next: { es: 'Siguiente', en: 'Next' },
  notFound: { es: 'Esa decisión no existe.', en: 'That decision does not exist.' },
} satisfies Record<string, Localized>;

/**
 * /decisiones: los ADR de la plataforma (docs/adr), con filtros por área, búsqueda y una vista de
 * detalle por decisión (/decisiones/:slug). Los datos se generan en el build desde el repositorio:
 * publicar una decisión es fusionar su PR. Detrás de la flag `site.adr` (ruta con canMatch).
 */
@Component({
  selector: 'app-decisions-page',
  imports: [RouterLink, LanguageSwitchComponent, MarkdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adr-page safe-x min-h-dvh bg-surface-1 text-ink-1">
      <header class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 max-[399px]:px-4">
        <a [routerLink]="current() ? '/decisiones' : '/'" class="ui-btn-ghost tap">← {{ t(current() ? copy.index : copy.back) }}</a>
        <app-language-switch />
      </header>

      <main class="mx-auto max-w-6xl px-6 pb-[calc(5rem+var(--pill-space,0px)+env(safe-area-inset-bottom,0px))] max-[399px]:px-4">
        @if (slug() && !current()) {
          <p class="mt-10 text-body text-ink-2" role="alert">{{ t(copy.notFound) }}</p>
        } @else if (current(); as adr) {
          <!-- ───────── Detalle de una decisión ───────── -->
          @let text = adr[lang()];
          <article class="mt-4 animate-fade-in" data-testid="adr-detail">
            <div class="flex flex-wrap items-center gap-3">
              <span class="area-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="areas[adr.area].icon" /></svg></span>
              <span class="font-mono text-mono-sm text-ink-3">ADR-{{ adr.number }}</span>
              <span class="status" [attr.data-tone]="tone(text.status)">{{ text.status }}</span>
            </div>
            <h1 class="mt-4 max-w-4xl text-title-1-sm text-ink-1 [text-wrap:balance] sm:text-title-1">{{ text.title }}</h1>
            <p class="mt-4 max-w-3xl text-body-lg text-ink-2">{{ text.summary }}</p>

            <div class="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div class="min-w-0 space-y-10">
                <section aria-labelledby="adr-context">
                  <h2 id="adr-context" class="section-title"><span class="dot"></span>{{ t(copy.context) }}</h2>
                  <app-markdown class="adr-md mt-3 block" [text]="text.sections.context" />
                </section>
                <section aria-labelledby="adr-options">
                  <h2 id="adr-options" class="section-title"><span class="dot"></span>{{ t(copy.options) }}</h2>
                  <app-markdown class="adr-md adr-options mt-3 block" [text]="text.sections.options" />
                </section>
                <section aria-labelledby="adr-decision" class="decision">
                  <h2 id="adr-decision" class="section-title"><span class="dot dot-accent"></span>{{ t(copy.decision) }}</h2>
                  <app-markdown class="adr-md mt-3 block" [text]="text.sections.decision" />
                </section>
                <section aria-labelledby="adr-consequences">
                  <h2 id="adr-consequences" class="section-title"><span class="dot"></span>{{ t(copy.consequences) }}</h2>
                  <div class="mt-4 grid gap-4 md:grid-cols-2">
                    <div class="tradeoff" data-tone="ok">
                      <p class="tradeoff-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{{ t(copy.gains) }}</p>
                      <app-markdown class="adr-md adr-tradeoff mt-2 block" [text]="text.gainsDetail" />
                    </div>
                    <div class="tradeoff" data-tone="warn">
                      <p class="tradeoff-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5v.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>{{ t(copy.costs) }}</p>
                      <app-markdown class="adr-md adr-tradeoff mt-2 block" [text]="text.costsDetail" />
                    </div>
                  </div>
                  @if (text.sections.consequences) {
                    <app-markdown class="adr-md mt-5 block" [text]="text.sections.consequences" />
                  }
                </section>
              </div>

              <aside class="min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
                <dl class="meta">
                  <div><dt>{{ t(copy.status) }}</dt><dd><span class="status" [attr.data-tone]="tone(text.status)">{{ text.status }}</span></dd></div>
                  <div><dt>{{ t(copy.area) }}</dt><dd>{{ t(areas[adr.area].label) }}</dd></div>
                  <div><dt>{{ t(copy.date) }}</dt><dd class="font-mono">{{ adr.date }}</dd></div>
                </dl>
                <div class="revisit">
                  <p class="tradeoff-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg>{{ t(copy.revisit) }}</p>
                  <p class="mt-2 text-body-sm text-ink-2">{{ text.revisit }}</p>
                </div>
                @if (adr.evidence.length) {
                  <div>
                    <p class="aside-title">{{ t(copy.evidence) }}</p>
                    <ul class="mt-2 space-y-1.5">
                      @for (path of adr.evidence; track path) {
                        <li><a class="evidence focus-ring" [href]="evidenceUrl(path)" target="_blank" rel="noopener" [title]="path">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9.5 13.5 8 15l1.5 1.5M14.5 13.5 16 15l-1.5 1.5" /></svg>
                          <span class="truncate">{{ fileName(path) }}</span></a></li>
                      }
                    </ul>
                  </div>
                }
                @if (related().length) {
                  <div>
                    <p class="aside-title">{{ t(copy.related) }}</p>
                    <ul class="mt-2 space-y-1.5">
                      @for (other of related(); track other.number) {
                        <li><a class="evidence focus-ring" [routerLink]="['/decisiones', other.slug]">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="areas[other.area].icon" /></svg>
                          <span class="truncate">{{ other.number }} · {{ other[lang()].title }}</span></a></li>
                      }
                    </ul>
                  </div>
                }
                <a class="ui-btn-secondary tap inline-flex" [href]="sourceUrl(adr, lang())" target="_blank" rel="noopener">{{ t(copy.source) }} ↗</a>
              </aside>
            </div>

            <nav class="mt-16 grid gap-3 border-t border-line-subtle pt-6 sm:grid-cols-2" [attr.aria-label]="t(copy.index)">
              @if (neighbours().previous; as previous) {
                <a class="pager focus-ring" [routerLink]="['/decisiones', previous.slug]"><span class="text-body-sm text-ink-3">← {{ t(copy.previous) }}</span><span class="mt-1 text-body text-ink-1">{{ previous[lang()].title }}</span></a>
              } @else { <span></span> }
              @if (neighbours().next; as next) {
                <a class="pager focus-ring text-right sm:col-start-2" [routerLink]="['/decisiones', next.slug]"><span class="text-body-sm text-ink-3">{{ t(copy.next) }} →</span><span class="mt-1 text-body text-ink-1">{{ next[lang()].title }}</span></a>
              }
            </nav>
          </article>
        } @else {
          <!-- ───────── Índice ───────── -->
          <section class="animate-fade-in" aria-labelledby="adr-title">
            <p class="font-mono text-mono-sm text-accent-text">{{ t(copy.eyebrow) }}</p>
            <h1 id="adr-title" class="mt-3 text-title-1-sm text-ink-1 [text-wrap:balance] sm:text-title-1">{{ t(copy.title) }}</h1>
            <p class="mt-4 max-w-3xl text-body-lg text-ink-2">{{ t(copy.intro) }}</p>
            <div class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm text-ink-3">
              <span><b class="font-mono text-ink-1">{{ adrs.length }}</b> {{ t(copy.decisions) }}</span>
              <span><b class="font-mono text-ink-1">{{ areaCount }}</b> {{ t(copy.areas) }}</span>
              <span><b class="font-mono text-status-ok">{{ acceptedCount() }}</b> {{ t(copy.accepted) }}</span>
              <a class="text-accent-text hover:underline focus-ring rounded-control" [href]="repository + '/tree/main/docs/adr'" target="_blank" rel="noopener">{{ t(copy.format) }} ↗</a>
            </div>
          </section>

          <div class="mt-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="t(copy.filter)" data-testid="adr-filters">
              <button type="button" class="chip tap" [attr.aria-pressed]="area() === null" (click)="area.set(null)">{{ t(copy.all) }} <span class="count">{{ adrs.length }}</span></button>
              @for (id of areaIds; track id) {
                <button type="button" class="chip tap" [attr.aria-pressed]="area() === id" (click)="area.set(area() === id ? null : id)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="areas[id].icon" /></svg>{{ t(areas[id].label) }} <span class="count">{{ countByArea[id] }}</span>
                </button>
              }
            </div>
            <label class="search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
              <input type="search" [placeholder]="t(copy.search)" [attr.aria-label]="t(copy.search)" [value]="query()" (input)="query.set($any($event.target).value)" data-testid="adr-search" />
            </label>
          </div>

          @if (visible().length) {
            <ul class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="adr-list">
              @for (adr of visible(); track adr.number; let i = $index) {
                @let text = adr[lang()];
                <li class="animate-slide-up" [style.animation-delay.ms]="i * 40">
                  <a class="card focus-ring" [routerLink]="['/decisiones', adr.slug]" [attr.data-area]="adr.area">
                    <div class="flex items-start justify-between gap-3">
                      <span class="area-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="areas[adr.area].icon" /></svg></span>
                      <span class="status" [attr.data-tone]="tone(text.status)">{{ text.status }}</span>
                    </div>
                    <p class="mt-4 font-mono text-mono-sm text-ink-3">ADR-{{ adr.number }} · {{ t(areas[adr.area].label) }}</p>
                    <h2 class="mt-1 text-title-3 text-ink-1 [text-wrap:balance]">{{ text.title }}</h2>
                    <p class="mt-2 line-clamp-3 text-body-sm text-ink-2">{{ text.summary }}</p>
                    <dl class="mt-4 space-y-2 border-t border-line-subtle pt-4 text-body-sm">
                      <div class="flex gap-2"><dt class="mark" data-tone="ok" [attr.aria-label]="t(copy.gains)">✓</dt><dd class="line-clamp-2 text-ink-2">{{ text.gains }}</dd></div>
                      <div class="flex gap-2"><dt class="mark" data-tone="warn" [attr.aria-label]="t(copy.costs)">!</dt><dd class="line-clamp-2 text-ink-2">{{ text.costs }}</dd></div>
                    </dl>
                    <span class="read">{{ t(copy.read) }} →</span>
                  </a>
                </li>
              }
            </ul>
          } @else {
            <div class="mt-12 text-center">
              <p class="text-body text-ink-2">{{ t(copy.none) }}</p>
              <button type="button" class="ui-btn-secondary mt-4" (click)="area.set(null); query.set('')">{{ t(copy.clear) }}</button>
            </div>
          }
        }
      </main>
    </div>
  `,
  styles: `
    .area-icon { display: inline-grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: 0.75rem;
      background: rgb(var(--c-accent-solid) / 0.1); box-shadow: inset 0 0 0 1px rgb(var(--c-accent-solid) / 0.25); color: var(--accent-text); }
    .area-icon svg, .chip svg, .tradeoff-label svg, .evidence svg, .search svg { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    .area-icon svg { width: 1.3rem; height: 1.3rem; }
    .status { display: inline-flex; align-items: center; gap: 0.375rem; border-radius: 999px; border: 1px solid var(--border-subtle); padding: 0.125rem 0.625rem; font-size: 0.75rem; color: var(--text-2); }
    .status::before { content: ''; width: 0.4rem; height: 0.4rem; border-radius: 999px; background: var(--text-3); }
    .status[data-tone='ok']::before { background: var(--status-ok); }
    .status[data-tone='warn']::before { background: var(--status-warn); }
    .chip { display: inline-flex; align-items: center; gap: 0.4rem; border-radius: 999px; border: 1px solid var(--border-subtle); padding: 0.4rem 0.8rem; font-size: 0.8125rem; color: var(--text-2); transition: all var(--duration-fast) var(--ease-standard); }
    .chip svg { width: 1rem; height: 1rem; }
    .chip:hover { border-color: var(--border-strong); color: var(--text-1); }
    .chip[aria-pressed='true'] { border-color: rgb(var(--c-accent-solid) / 0.55); background: rgb(var(--c-accent-solid) / 0.1); color: var(--text-1); }
    .count { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-3); }
    .search { display: flex; align-items: center; gap: 0.5rem; min-width: min(100%, 22rem); border-radius: 0.75rem; border: 1px solid var(--border-subtle); background: rgb(var(--c-surface-2) / 0.6); padding: 0.55rem 0.8rem; color: var(--text-3); }
    .search:focus-within { border-color: var(--border-strong); }
    .search svg { width: 1.1rem; height: 1.1rem; flex: none; }
    .search input { width: 100%; background: transparent; outline: none; color: var(--text-1); font-size: 0.875rem; }
    .card { position: relative; display: flex; height: 100%; flex-direction: column; border-radius: var(--radius-card); border: 1px solid var(--border-subtle); background: rgb(var(--c-surface-2) / 0.5); padding: 1.25rem; transition: border-color var(--duration-fast) var(--ease-standard), transform var(--duration-base) var(--ease-emphasized), background var(--duration-fast); }
    .card:hover { border-color: rgb(var(--c-accent-solid) / 0.45); background: rgb(var(--c-surface-2) / 0.85); transform: translateY(-2px); }
    .mark { display: inline-grid; place-items: center; flex: none; width: 1.25rem; height: 1.25rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; }
    .mark[data-tone='ok'] { color: var(--status-ok); background: rgb(var(--c-status-ok) / 0.12); }
    .mark[data-tone='warn'] { color: var(--status-warn); background: rgb(var(--c-status-warn) / 0.12); }
    .read { margin-top: auto; padding-top: 1rem; font-size: 0.8125rem; color: var(--text-3); transition: color var(--duration-fast); }
    .card:hover .read { color: var(--accent-text); }
    .section-title { display: flex; align-items: center; gap: 0.6rem; font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em; color: var(--text-1); }
    .dot { width: 0.45rem; height: 0.45rem; border-radius: 999px; background: var(--border-strong); }
    .dot-accent { background: var(--accent-solid); box-shadow: 0 0 0 4px rgb(var(--c-accent-solid) / 0.15); }
    .decision { border-left: 2px solid rgb(var(--c-accent-solid) / 0.6); padding-left: 1.25rem; }
    .tradeoff, .revisit { border-radius: 0.875rem; border: 1px solid var(--border-subtle); background: rgb(var(--c-surface-2) / 0.5); padding: 1rem 1.1rem; }
    .tradeoff[data-tone='ok'] { border-color: color-mix(in srgb, var(--status-ok) 35%, transparent); }
    .tradeoff[data-tone='warn'] { border-color: color-mix(in srgb, var(--status-warn) 35%, transparent); }
    .tradeoff-label { display: flex; align-items: center; gap: 0.45rem; font-size: 0.8125rem; font-weight: 600; color: var(--text-1); }
    .tradeoff-label svg { width: 1.05rem; height: 1.05rem; }
    .tradeoff[data-tone='ok'] .tradeoff-label svg { color: var(--status-ok); }
    .tradeoff[data-tone='warn'] .tradeoff-label svg { color: var(--status-warn); }
    .revisit .tradeoff-label svg { color: var(--accent-text); }
    .meta { display: grid; gap: 0.75rem; border-radius: 0.875rem; border: 1px solid var(--border-subtle); padding: 1rem 1.1rem; }
    .meta div { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .meta dt, .aside-title { font-size: 0.8125rem; color: var(--text-3); }
    .meta dd { font-size: 0.875rem; color: var(--text-1); }
    .evidence { display: flex; align-items: center; gap: 0.5rem; border-radius: 0.5rem; padding: 0.35rem 0.5rem; font-size: 0.8125rem; color: var(--text-2); transition: background var(--duration-fast), color var(--duration-fast); }
    .evidence:hover { background: rgb(var(--c-ink-1) / 0.05); color: var(--text-1); }
    .evidence svg { width: 1rem; height: 1rem; flex: none; color: var(--text-3); }
    .pager { display: flex; flex-direction: column; border-radius: 0.875rem; border: 1px solid var(--border-subtle); padding: 1rem 1.1rem; transition: border-color var(--duration-fast); }
    .pager:hover { border-color: rgb(var(--c-accent-solid) / 0.45); }
  `,
})
export class DecisionsPageComponent {
  private readonly i18n = inject(LanguageService);
  private readonly titleService = inject(Title);
  /** Segmento `:slug` de la ruta: sin él, el índice. */
  readonly slug = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('slug') ?? undefined)));

  readonly copy = COPY;
  readonly adrs = ADRS;
  readonly areas = AREAS;
  readonly repository = REPOSITORY_URL;
  readonly evidenceUrl = evidenceUrl;
  readonly sourceUrl = sourceUrl;
  readonly areaIds = (Object.keys(AREAS) as AreaId[]).filter((id) => ADRS.some((adr) => adr.area === id));
  readonly areaCount = this.areaIds.length;
  readonly countByArea = Object.fromEntries(this.areaIds.map((id) => [id, ADRS.filter((adr) => adr.area === id).length])) as Record<AreaId, number>;

  readonly lang = computed(() => (this.i18n.lang() === 'en' ? 'en' : 'es') as 'es' | 'en');
  readonly area = signal<AreaId | null>(null);
  readonly query = signal('');

  readonly visible = computed(() => ADRS.filter((adr) => (this.area() === null || adr.area === this.area())
    && matchesQuery(adr, adr[this.lang()], this.i18n.t(AREAS[adr.area].label), this.query())));
  readonly acceptedCount = computed(() => ADRS.filter((adr) => statusTone(adr[this.lang()].status) === 'ok').length);
  readonly current = computed(() => ADRS.find((adr) => adr.slug === this.slug()) ?? null);
  readonly related = computed(() => { const adr = this.current(); return adr ? relatedAdrs(adr, adr[this.lang()]) : []; });
  readonly neighbours = computed(() => {
    const index = ADRS.findIndex((adr) => adr.slug === this.slug());
    return { previous: index > 0 ? ADRS[index - 1] : null, next: index >= 0 && index < ADRS.length - 1 ? ADRS[index + 1] : null };
  });

  constructor() {
    effect(() => {
      const adr = this.current();
      this.titleService.setTitle(adr ? `ADR-${adr.number} · ${adr[this.lang()].title} · Manuel Cardoza` : `${this.t(COPY.title)} · Manuel Cardoza`);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    });
  }

  t(text: Localized): string {
    return this.i18n.t(text);
  }

  tone(status: string): 'ok' | 'warn' | 'muted' {
    return statusTone(status);
  }

  fileName(path: string): string {
    return path.split('/').pop() ?? path;
  }
}
