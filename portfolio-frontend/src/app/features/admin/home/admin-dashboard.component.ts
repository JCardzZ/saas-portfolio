import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EMPTY, Observable } from 'rxjs';

import {
  AdminProjectsCMSService, AdminTechnologiesCMSService, AdminUsersService, Article, FeatureFlagAuditEntry, FeatureFlagDetail,
  FeatureFlagsService, Project, PublicCatalogShowcasesService, SystemHealthResponse, Technology, TelemetryObservabilityService, UserAccount,
} from '../../../core/api';
import { AuthService } from '../../../core/auth/auth.service';
import { describeHttpError } from '../../../core/errors/http-error';
import { SECTION_META } from '../layout/admin-sections';
import { CREATE_KINDS, QuickCreateService, createKind } from '../layout/quick-create';

/** Estado de un panel que carga su propio endpoint: cada uno falla o llega por su cuenta. */
export interface Widget<T> {
  state: Signal<'loading' | 'ready' | 'error'>;
  data: Signal<T | null>;
  error: Signal<string | null>;
  reload(): void;
}

function widget<T>(source: () => Observable<T>): Widget<T> {
  const state = signal<'loading' | 'ready' | 'error'>('loading');
  const data = signal<T | null>(null);
  const error = signal<string | null>(null);
  const reload = () => {
    state.set('loading');
    error.set(null);
    source().subscribe({
      next: (value) => {
        data.set(value);
        state.set('ready');
      },
      error: (failure: unknown) => {
        error.set(describeHttpError(failure));
        state.set('error');
      },
    });
  };
  reload();
  return { state, data, error, reload };
}

/**
 * Inicio del panel rediseñado (`admin.redesign`): un dashboard con datos reales de la API. Cada
 * panel pide su endpoint solo si el rol lo permite, y se dibuja, falla o se reintenta por separado.
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dash" data-testid="admin-dashboard"
      [class.dash-drop-ready]="create.dragging()"
      (dragover)="create.over($event)" (drop)="create.drop($event)">
      @if (create.dragging(); as kind) {
        <div class="dash-drop" aria-hidden="true"><span>Suelta para crear: {{ dropLabel(kind) }}</span></div>
      }
      <header class="dash-head">
        <div class="min-w-0">
          <h1 class="dash-title">{{ greeting() }}{{ firstName() ? ', ' + firstName() : '' }}</h1>
          <p class="dash-sub">{{ todayLabel }} · {{ who()?.role }}</p>
        </div>
        @if (health.state() === 'ready') {
          <span class="dash-status" data-testid="dash-status">
            <span class="dash-dot" [attr.data-level]="healthy() ? 'up' : 'warn'"></span>{{ healthy() ? 'Operativo' : 'Degradado' }}@if (health.data()?.version; as version) { · {{ version }} }
          </span>
        }
      </header>

      @if (creatable().length) {
        <!-- Crear: un clic abre el panel lateral; también se arrastran a su sección o aquí. -->
        <nav class="dash-actions" aria-label="Crear">
          @for (item of creatable(); track item.kind) {
            <button type="button" class="dash-action" draggable="true" [style.--sec]="meta[item.path]?.color" [attr.data-create]="item.kind"
              (click)="create.open.set(item.kind)" (dragstart)="create.start($event, item.kind)" (dragend)="create.end()">
              <span class="admin-link-chip" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="meta[item.path]?.icon" /></svg></span>
              {{ item.title }}
            </button>
          }
        </nav>
      }

      <!-- Indicadores: lo que hay publicado ahora mismo, con enlace a su sección. -->
      <div class="dash-kpis">
        @for (kpi of kpis(); track kpi.path) {
          <a class="dash-kpi admin-rise" [routerLink]="kpi.path" [style.--sec]="meta[kpi.path]?.color" [style.--i]="$index" [attr.data-kpi]="kpi.path">
            <span class="admin-link-chip" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="meta[kpi.path]?.icon" /></svg></span>
            <span class="dash-kpi-label">{{ kpi.label }}</span>
            @switch (kpi.widget.state()) {
              @case ('loading') { <span class="dash-skeleton dash-skeleton-num"></span> }
              @case ('error') { <span class="dash-kpi-error">—</span> }
              @default { <span class="dash-kpi-value">{{ kpi.value() }}</span> }
            }
            <span class="dash-kpi-note">{{ kpi.widget.state() === 'error' ? 'No disponible' : kpi.note() }}</span>
          </a>
        }
      </div>

      <div class="dash-grid">
        @if (canFlags) {
          <section class="dash-card dash-span-2" aria-labelledby="dash-activity">
            <header class="dash-card-head">
              <h2 id="dash-activity">Actividad reciente</h2>
              <a routerLink="features" class="dash-link">Flags →</a>
            </header>
            @switch (audit.state()) {
              @case ('loading') { <div class="dash-skeleton-list"><span></span><span></span><span></span></div> }
              @case ('error') {
                <p class="dash-error">{{ audit.error() }} <button type="button" class="dash-retry" (click)="audit.reload()">Reintentar</button></p> }
              @default {
                @if (recent().length) {
                  <ol class="dash-timeline">
                    @for (entry of recent(); track entry.changedAt + entry.key) {
                      <li>
                        <span class="dash-timeline-dot" [class.dash-timeline-on]="entry.enabled" aria-hidden="true"></span>
                        <span class="min-w-0 flex-1">
                          <span class="block text-sm text-[var(--a-text-1)]"><code class="dash-code">{{ entry.key }}</code> {{ entry.enabled ? 'encendida' : 'apagada' }}</span>
                          <span class="block text-xs text-[var(--a-text-3)]">{{ entry.actor }} · {{ entry.changedAt | date: 'd MMM, HH:mm' }}</span>
                        </span>
                      </li>
                    }
                  </ol>
                } @else {
                  <p class="dash-empty">Nadie ha cambiado una flag todavía. Lo que se encienda o apague aparecerá aquí.</p>
                }
              }
            }
          </section>
        }

        <section class="dash-card" aria-labelledby="dash-health">
          <header class="dash-card-head"><h2 id="dash-health">Salud del sistema</h2></header>
          @switch (health.state()) {
            @case ('loading') { <div class="dash-skeleton-list"><span></span><span></span><span></span></div> }
            @case ('error') { <p class="dash-error">{{ health.error() }} <button type="button" class="dash-retry" (click)="health.reload()">Reintentar</button></p> }
            @default {
              <ul class="dash-health">
                @for (item of components(); track item.name) {
                  <li>
                    <span class="dash-dot" [attr.data-level]="item.level" aria-hidden="true"></span>
                    <span class="flex-1">{{ item.name }}</span>
                    <span class="dash-health-state" [attr.data-level]="item.level">{{ item.state }}</span>
                  </li>
                }
              </ul>
            }
          }
        </section>

        @if (canFlags) {
          <section class="dash-card" aria-labelledby="dash-flags">
            <header class="dash-card-head">
              <h2 id="dash-flags">Flags</h2>
              <a routerLink="features" class="dash-link">Gestionar →</a>
            </header>
            @switch (flags.state()) {
              @case ('loading') { <span class="dash-skeleton dash-skeleton-ring"></span> }
              @case ('error') { <p class="dash-error">{{ flags.error() }} <button type="button" class="dash-retry" (click)="flags.reload()">Reintentar</button></p> }
              @default {
                <div class="dash-ring-wrap">
                  <svg class="dash-ring" viewBox="0 0 42 42" role="img" [attr.aria-label]="flagsOn() + ' de ' + flagsTotal() + ' encendidas'">
                    <circle cx="21" cy="21" r="15.9" class="dash-ring-track" />
                    <circle cx="21" cy="21" r="15.9" class="dash-ring-value" [attr.stroke-dasharray]="flagShare() + ' ' + (100 - flagShare())" stroke-dashoffset="25" />
                  </svg>
                  <div>
                    <p class="dash-ring-num">{{ flagsOn() }}<span>/{{ flagsTotal() }}</span></p>
                    <p class="dash-kpi-note">encendidas en producción</p>
                  </div>
                </div>
              }
            }
          </section>
        }

        @if (canCms) {
          <section class="dash-card" aria-labelledby="dash-stack">
            <header class="dash-card-head">
              <h2 id="dash-stack">Stack por categoría</h2>
              <a routerLink="technologies" class="dash-link">Tecnologías →</a>
            </header>
            @switch (technologies.state()) {
              @case ('loading') { <div class="dash-skeleton-list"><span></span><span></span><span></span></div> }
              @case ('error') { <p class="dash-error">{{ technologies.error() }} <button type="button" class="dash-retry" (click)="technologies.reload()">Reintentar</button></p> }
              @default {
                <ul class="dash-bars">
                  @for (row of categories(); track row.name) {
                    <li>
                      <span class="dash-bars-label">{{ row.name }}</span>
                      <span class="dash-bars-track"><span class="dash-bars-fill" [style.width.%]="row.share"></span></span>
                      <span class="dash-bars-num">{{ row.count }}</span>
                    </li>
                  } @empty {
                    <li class="dash-empty">Aún no hay tecnologías.</li>
                  }
                </ul>
              }
            }
          </section>

          <section class="dash-card" aria-labelledby="dash-articles">
            <header class="dash-card-head">
              <h2 id="dash-articles">Últimos artículos</h2>
              <a routerLink="articles" class="dash-link">Artículos →</a>
            </header>
            @switch (articles.state()) {
              @case ('loading') { <div class="dash-skeleton-list"><span></span><span></span><span></span></div> }
              @case ('error') { <p class="dash-error">{{ articles.error() }} <button type="button" class="dash-retry" (click)="articles.reload()">Reintentar</button></p> }
              @default {
                <ul class="dash-list">
                  @for (article of latestArticles(); track article.id ?? article.slug) {
                    <li>
                      <span class="min-w-0 flex-1 truncate">{{ article.title }}</span>
                      <span class="dash-list-meta">{{ article.publishedAt | date: 'd MMM y' }}</span>
                    </li>
                  } @empty {
                    <li class="dash-empty">Todavía no hay artículos publicados.</li>
                  }
                </ul>
              }
            }
          </section>
        }

      </div>
    </div>
  `,
})
export class AdminDashboardComponent {
  private readonly auth = inject(AuthService);
  readonly meta = SECTION_META;
  readonly who = this.auth.who;
  readonly today = new Date();
  /** «lunes, 2 de noviembre»: sin depender de que Angular tenga registrado el idioma. */
  readonly todayLabel = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(this.today);
  readonly firstName = computed(() => (this.who()?.name ?? '').split(/\s+/)[0]);
  readonly greeting = computed(() => {
    const hour = this.today.getHours();
    return hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  });

  readonly canCms = this.auth.can('cms:read');
  readonly canFlags = this.auth.can('flags:read');
  readonly canUsers = this.auth.can('users:manage');

  private readonly healthApi = inject(TelemetryObservabilityService);
  private readonly technologyApi = inject(AdminTechnologiesCMSService);
  private readonly projectApi = inject(AdminProjectsCMSService);
  private readonly publicApi = inject(PublicCatalogShowcasesService);
  private readonly usersApi = inject(AdminUsersService);
  private readonly flagsApi = inject(FeatureFlagsService);

  // Cada panel pide solo lo que el rol puede leer; lo demás ni se llama.
  readonly health: Widget<SystemHealthResponse> = widget(() => this.healthApi.telemetryHealthGet());
  readonly technologies: Widget<Technology[]> = this.load(this.canCms, () => this.technologyApi.adminTechnologiesGet());
  readonly projects: Widget<Project[]> = this.load(this.canCms, () => this.projectApi.adminProjectsGet());
  readonly articles: Widget<Article[]> = this.load(this.canCms, () => this.publicApi.publicArticlesGet());
  readonly users: Widget<UserAccount[]> = this.load(this.canUsers, () => this.usersApi.listUsers());
  readonly flags: Widget<FeatureFlagDetail[]> = this.load(this.canFlags, () => this.flagsApi.adminFeaturesGet());
  readonly audit: Widget<FeatureFlagAuditEntry[]> = this.load(this.canFlags, () => this.flagsApi.adminFeaturesAuditGet());

  private load<T>(allowed: boolean, source: () => Observable<T>): Widget<T> {
    return widget(allowed ? source : () => EMPTY);
  }

  readonly healthy = computed(() => levelOf(this.health.data()?.status) === 'up');
  readonly components = computed(() => {
    const health = this.health.data();
    if (!health) {
      return [];
    }
    return [
      { name: 'API', state: health.status ?? '—', level: levelOf(health.status) },
      { name: 'Base de datos', state: health.database ?? '—', level: levelOf(health.database) },
      { name: 'Caché (Redis)', state: health.redisCache ?? '—', level: levelOf(health.redisCache) },
      { name: 'Motor de IA', state: health.circuitBreakers?.aiEngine ?? '—', level: levelOf(health.circuitBreakers?.aiEngine) },
    ];
  });

  readonly flagsOn = computed(() => (this.flags.data() ?? []).filter((flag) => flag.enabled).length);
  readonly flagsTotal = computed(() => (this.flags.data() ?? []).length);
  readonly flagShare = computed(() => (this.flagsTotal() ? Math.round((this.flagsOn() / this.flagsTotal()) * 100) : 0));
  readonly recent = computed(() => [...(this.audit.data() ?? [])].sort((a, b) => b.changedAt.localeCompare(a.changedAt)).slice(0, 6));
  readonly latestArticles = computed(() => [...(this.articles.data() ?? [])]
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).slice(0, 5));
  readonly categories = computed(() => {
    const counts = new Map<string, number>();
    for (const technology of this.technologies.data() ?? []) {
      const name = technology.category?.trim() || 'Otras';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, count]) => ({ name, count, share: Math.round((count / max) * 100) }));
  });

  /** Indicadores, solo de lo que el rol puede ver. */
  readonly kpis = computed(() => [
    ...(this.canCms ? [
      { path: 'projects', label: 'Proyectos', widget: this.projects as Widget<unknown>, value: () => this.projects.data()?.length ?? 0,
        note: () => `${new Set((this.projects.data() ?? []).flatMap((project) => project.technologiesUsed ?? [])).size} tecnologías usadas` },
      { path: 'technologies', label: 'Tecnologías', widget: this.technologies as Widget<unknown>, value: () => this.technologies.data()?.length ?? 0,
        note: () => `${(this.technologies.data() ?? []).filter((technology) => technology.isFeatured).length} destacadas en la portada` },
      { path: 'articles', label: 'Artículos', widget: this.articles as Widget<unknown>, value: () => this.articles.data()?.length ?? 0,
        note: () => (this.latestArticles()[0]?.publishedAt ? `último: ${new Date(this.latestArticles()[0].publishedAt!).toLocaleDateString('es')}` : 'sin publicar') },
    ] : []),
    ...(this.canUsers ? [
      { path: 'users', label: 'Usuarios', widget: this.users as Widget<unknown>, value: () => this.users.data()?.length ?? 0,
        note: () => { const active = (this.users.data() ?? []).filter((user) => user.active).length; return `${active} ${active === 1 ? 'activo' : 'activos'}`; } },
    ] : []),
  ]);

  readonly create = inject(QuickCreateService);
  readonly creatable = computed(() => CREATE_KINDS.filter((info) => this.auth.can(info.permission)));

  dropLabel(kind: string): string {
    return createKind(kind as never).label.toLowerCase();
  }

  constructor() {
    // Algo se creó desde la paleta: se vuelven a pedir los paneles que lo cuentan.
    effect(() => {
      const created = this.create.created();
      if (!created) {
        return;
      }
      untracked(() => {
        const reload = { project: this.projects, article: this.articles, technology: this.technologies, user: this.users }[created.kind];
        reload.reload();
      });
    });
  }

}

/** Nivel de un componente según su texto: bien, degradado, caído o simulado (modo demo). */
export function levelOf(value: string | undefined): 'up' | 'warn' | 'down' | 'demo' {
  const text = (value ?? '').toUpperCase();
  if (!text) {
    return 'demo';
  }
  if (text.includes('DEMO') || text.includes('SIMULAD')) {
    return 'demo';
  }
  if (text.includes('UNAVAILABLE') || text === 'DOWN' || text === 'OPEN') {
    return 'down';
  }
  if (text === 'DEGRADED' || text === 'HALF_OPEN') {
    return 'warn';
  }
  return 'up';
}
