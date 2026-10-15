import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { finalize } from 'rxjs';
import { SystemDesignFile, SystemDesignService as SystemDesignApi } from '../../../../core/api';
import { CloudLink, CloudNode, CloudProviderId, forProvider } from '../cloud-topology.data';
import { downloadBlob } from '../diagram-export';
import { COMPLIANCE_OPTIONS, Compliance, NFR_INPUTS, NfrField, SYSTEM_CATALOG, SystemCategory, SystemCategoryId, SystemOption } from './system-catalog.data';
import { Advice, assessSystem } from './system-advisor';
import { AdvisorOrbComponent, SystemAdvisorComponent } from './system-advisor.component';
import { SystemDesign, SystemFinding, chosen, deployTargets, evaluateSystem, withChoice } from './system-design';
import { SystemDiagramComponent } from './system-diagram.component';
import { BrandLogo, OPTION_LOGOS, REQUIRED_ATTRIBUTIONS, TRADEMARK_NOTICE } from './system-icons';

/** Una pieza de la vista de Aplicación ya resuelta: lo elegido y dónde se despliega. */
interface Piece {
  category: SystemCategory;
  option: SystemOption;
  /** Nombre del nodo de infraestructura en el que se despliega, o `null`. */
  on: string | null;
}

/**
 * Vista de Aplicación del Estudio (flag `studio.system-design`). Es el mismo proyecto que la
 * vista de Infraestructura: aquí se elige qué se construye, se dice en qué pieza del lienzo se
 * despliega cada cosa y se piden los requisitos no funcionales. Las comprobaciones salen al
 * momento, y los archivos de partida los genera el backend.
 *
 * En pantallas estrechas es de solo lectura, como el resto de lo nuevo del Estudio.
 */
@Component({
    selector: 'app-system-design',
    imports: [TranslatePipe, AdvisorOrbComponent, SystemAdvisorComponent, SystemDiagramComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
    <section class="mt-3 space-y-4" aria-labelledby="system-design-title" data-testid="system-design">
      <header class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
       <div class="min-w-0">
        <p class="text-xs font-medium uppercase tracking-wider text-ink-3">{{ 'Diseño de sistema' | t }}</p>
        <h4 id="system-design-title" class="mt-1 text-base font-semibold text-ink-1">{{ 'Vista de Aplicación' | t }}</h4>
        <p class="mt-1 max-w-prose text-sm leading-snug text-ink-2">
          {{ 'Qué se construye y dónde corre. Cada pieza se despliega en una de las piezas de la vista de Infraestructura, que es el mismo proyecto visto desde abajo.' | t }}
        </p>
        @if (readonly()) {
          <p class="mt-2 text-xs text-ink-3" data-testid="system-readonly">{{ 'En el móvil esta vista es de solo lectura: se edita en una pantalla más ancha.' | t }}</p>
        }
       </div>
        <!-- El asistente: su veredicto siempre a la vista; la ventana da el detalle. -->
        <button
          type="button"
          class="advisor-button ui-focus tap flex max-w-full items-center gap-3 rounded-panel border border-line-strong bg-surface-2 py-2 pl-2.5 pr-4 text-left transition-colors duration-fast ease-standard hover:border-line-control"
          aria-haspopup="dialog"
          [attr.aria-expanded]="advisorOpen()"
          data-testid="advisor-open"
          (click)="advisorOpen.set(true)"
        >
          <app-advisor-orb [size]="36" [level]="assessment().verdict" />
          <span class="min-w-0">
            <span class="block text-xs uppercase tracking-wide text-ink-3">{{ 'Asistente de diseño' | t }}</span>
            <span class="block text-sm font-semibold text-ink-1" data-testid="advisor-verdict">{{ assessment().headline }}</span>
            <span class="block text-xs text-ink-2">{{ adviceCount() }}</span>
          </span>
        </button>
      </header>

      <!-- El sistema, dibujado: cambia con cada elección. -->
      <div class="ui-card-inset">
        <app-system-diagram [design]="design()" [nodes]="nodes()" [provider]="provider()" [active]="focused()" (picked)="goTo($event)" />
        <p class="mt-2 text-xs leading-snug text-ink-3" data-testid="trademark-notice">
          {{ trademarkNotice }}
          @for (line of attributions(); track line) { <span class="block">{{ line }}</span> }
        </p>
        @if (topAdvice(); as advice) {
          <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-subtle pt-3" data-testid="advisor-top" role="status">
            <app-advisor-orb [size]="20" [level]="advice.level === 'risk' ? 'risk' : 'limited'" />
            <p class="min-w-0 flex-1 text-sm text-ink-2"><span class="font-medium text-ink-1">{{ advice.title }}.</span> {{ advice.why }}</p>
            @if (advice.action; as action) {
              @if (action.kind === 'choose' && !readonly()) {
                <button type="button" class="ui-btn-secondary" data-testid="advisor-top-apply" (click)="apply(advice)">{{ action.label }}</button>
              }
            }
            <button type="button" class="ui-btn-ghost" aria-haspopup="dialog" (click)="advisorOpen.set(true)">{{ 'Ver todo' | t }}</button>
          </div>
        }
      </div>

      @if (advisorOpen()) {
        <app-system-advisor [assessment]="assessment()" [readonly]="readonly()" (closed)="advisorOpen.set(false)" (applied)="apply($event)" />
      }

      <!-- El mismo sistema en texto: es lo que lee un lector de pantalla en lugar del dibujo. -->
      <div class="sr-only" [attr.aria-label]="'Resumen del sistema' | t" role="group">
        <ol class="flex flex-wrap items-stretch gap-x-2 gap-y-3" data-testid="system-flow">
          @for (piece of requestPath(); track piece.category.id; let first = $first) {
            @if (!first) {
              <li class="flex items-center text-xs text-ink-3" aria-hidden="true">{{ piece.category.id === 'backend' ? apiStyle() + ' →' : '→' }}</li>
            }
            <li class="app-piece">
              <span class="text-xs uppercase tracking-wide text-ink-3">{{ piece.category.name }}</span>
              <span class="block text-sm font-semibold text-ink-1">{{ piece.option.name }}</span>
              <span class="block text-xs text-ink-2">{{ where(piece) }}</span>
            </li>
          }
        </ol>
        @if (supporting().length) {
          <ul class="mt-3 flex flex-wrap gap-2 border-t border-line-subtle pt-3" [attr.aria-label]="'Piezas de apoyo' | t">
            @for (piece of supporting(); track piece.category.id) {
              <li class="app-piece">
                <span class="text-xs uppercase tracking-wide text-ink-3">{{ piece.category.name }}</span>
                <span class="block text-sm font-semibold text-ink-1">{{ piece.option.name }}</span>
                <span class="block text-xs text-ink-2">{{ where(piece) }}</span>
              </li>
            }
          </ul>
        }
      </div>

      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        @for (category of catalog; track category.id) {
          <fieldset class="ui-card-inset min-w-0 scroll-mt-28" [class.category-focused]="focused() === category.id" [attr.data-category]="category.id" [disabled]="readonly()" (focusin)="focused.set(category.id)">
            <legend class="float-left mb-1 w-full text-xs font-medium uppercase tracking-wider text-ink-3">{{ category.name }}</legend>
            <p class="clear-both text-sm text-ink-2">{{ category.question }}</p>
            <div class="mt-2 space-y-1">
              @for (option of category.options; track option.id) {
                <label class="flex cursor-pointer items-start gap-2 rounded-control px-1 py-1.5 hover:bg-surface-3">
                  <input type="radio" class="mt-1 accent-current" [name]="'system-' + category.id" [value]="option.id" [checked]="design().choices[category.id] === option.id" (change)="choose(category.id, option.id)" />
                  <span class="min-w-0">
                    <span class="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink-1">
                      @for (logo of logosOf(option.id); track logo.title) {
                        <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" [attr.data-logo]="logo.title"><path [attr.d]="logo.path" [attr.fill]="logo.color" /></svg>
                      }
                      {{ option.name }}
                    </span>
                    <span class="block text-xs leading-snug text-ink-2">{{ option.summary }}</span>
                  </span>
                </label>
              }
              @if (category.optional) {
                <label class="flex cursor-pointer items-start gap-2 rounded-control px-1 py-1.5 hover:bg-surface-3">
                  <input type="radio" class="mt-1 accent-current" [name]="'system-' + category.id" value="" [checked]="!design().choices[category.id]" (change)="choose(category.id, null)" />
                  <span class="text-sm font-medium text-ink-1">{{ none(category) }}</span>
                </label>
              }
            </div>

            @if (optionOf(category.id); as option) {
              @if (option.deploysOn.length) {
                <label class="mt-3 block text-xs font-medium text-ink-2" [attr.for]="'deploy-' + category.id">{{ 'Se despliega en' | t }}</label>
                <select [id]="'deploy-' + category.id" class="focus-ring mt-1 w-full rounded-control border border-line-strong bg-surface-2 px-2 py-1.5 text-sm text-ink-1" (change)="deploy(category.id, $any($event.target).value)">
                  <option value="" [selected]="!design().deployments[category.id]">{{ 'Sin desplegar' | t }}</option>
                  @for (target of targetsOf(option); track target.id) {
                    <option [value]="target.id" [selected]="design().deployments[category.id] === target.id">{{ nameOf(target) }}</option>
                  }
                </select>
              } @else {
                <p class="mt-3 text-xs leading-snug text-ink-3">{{ option.notDeployed }}</p>
              }
            }
            @for (finding of findingsOf(category.id); track finding.rule) {
              <p class="mt-2 rounded-control border px-2 py-1.5 text-xs leading-snug" [class]="tone(finding)" role="status" [attr.data-rule]="finding.rule">
                {{ finding.message }} @if (finding.suggestion) { <strong class="font-semibold">{{ finding.suggestion }}</strong> }
              </p>
            }
          </fieldset>
        }
      </div>

      <fieldset class="ui-card-inset" [disabled]="readonly()" data-testid="system-nfr">
        <legend class="float-left mb-1 w-full text-xs font-medium uppercase tracking-wider text-ink-3">{{ 'Requisitos no funcionales' | t }}</legend>
        <p class="clear-both text-sm text-ink-2">{{ 'Lo que se le pide al sistema. Deja en blanco lo que no importe: no se comprueba.' | t }}</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          @for (item of inputs; track item.field) {
            <label class="block min-w-0 text-xs font-medium text-ink-2">
              {{ item.name }}
              @if (item.choices) {
                <select class="focus-ring mt-1 w-full rounded-control border border-line-strong bg-surface-2 px-2 py-1.5 text-sm text-ink-1" [attr.data-nfr]="item.field" (change)="setNumber(item.field, $any($event.target).value)">
                  <option value="" [selected]="design().nfr[item.field] === undefined">{{ 'Sin objetivo' | t }}</option>
                  @for (choice of item.choices; track choice) {
                    <option [value]="choice" [selected]="design().nfr[item.field] === choice">{{ choice }} {{ item.unit }}</option>
                  }
                </select>
              } @else {
                <input type="number" inputmode="decimal" class="focus-ring mt-1 w-full rounded-control border border-line-strong bg-surface-2 px-2 py-1.5 text-sm text-ink-1 placeholder:text-ink-3" [attr.data-nfr]="item.field" [min]="item.min" [max]="item.max" [placeholder]="item.unit" [value]="design().nfr[item.field] ?? ''" (change)="setNumber(item.field, $any($event.target).value)" />
              }
              <span class="mt-1 block font-normal leading-snug text-ink-3">{{ item.help }}</span>
            </label>
          }
        </div>
        <div class="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          @for (option of compliance; track option.id) {
            <label class="flex cursor-pointer items-start gap-2 text-sm text-ink-1" [title]="option.help">
              <input type="checkbox" class="mt-1 accent-current" [attr.data-compliance]="option.id" [checked]="design().nfr.compliance.includes(option.id)" (change)="toggleCompliance(option.id, $any($event.target).checked)" />
              {{ option.name }}
            </label>
          }
        </div>
      </fieldset>

      <section aria-labelledby="system-findings-title" data-testid="system-findings">
        <h5 id="system-findings-title" class="text-sm font-semibold text-ink-1">
          {{ 'Comprobaciones' | t }}
          <span class="ml-1 ui-badge" [class.ui-badge-ok]="!findings().length" [class.ui-badge-warn]="findings().length > 0 && !errors()" [class.ui-badge-danger]="errors() > 0">{{ summary() }}</span>
        </h5>
        @if (general().length) {
          <ul class="mt-2 space-y-1">
            @for (finding of general(); track finding.rule + finding.message) {
              <li class="rounded-control border px-3 py-1.5 text-xs leading-snug" [class]="tone(finding)" role="status" [attr.data-rule]="finding.rule">
                {{ finding.message }} @if (finding.suggestion) { <strong class="font-semibold">{{ finding.suggestion }}</strong> }
              </li>
            }
          </ul>
        } @else if (!findings().length) {
          <p class="mt-1 text-xs text-ink-2">{{ 'El diseño cumple lo que se le pide y todo está desplegado donde puede correr.' | t }}</p>
        }
      </section>

      <section class="ui-card-inset" aria-labelledby="system-output-title" data-testid="system-output">
        <div class="flex flex-wrap items-center gap-3">
          <div class="min-w-0 flex-1">
            <h5 id="system-output-title" class="text-sm font-semibold text-ink-1">{{ 'Archivos de partida' | t }}</h5>
            <p class="text-xs leading-snug text-ink-2">
              Terraform, contrato inicial de la API ({{ contractName() }}), docker-compose y README.
              <span class="ui-badge ml-1">{{ 'Esqueleto' | t }}</span> {{ 'Son para completar: nada se puede desplegar tal cual.' | t }}
            </p>
          </div>
          <button type="button" class="ui-btn-primary" [disabled]="generating()" (click)="generate()">{{ generating() ? ('Generando…' | t) : ('Generar archivos' | t) }}</button>
        </div>
        @if (error(); as message) {
          <p class="mt-3 rounded-control border border-status-warn/30 bg-status-warn/10 px-3 py-1.5 text-xs text-status-warn" role="alert" data-testid="system-output-error">{{ message }}</p>
        }
        @if (files().length) {
          <div class="mt-3 ui-segmented" role="tablist" [attr.aria-label]="'Archivos generados' | t">
            @for (file of files(); track file.path) {
              <button type="button" role="tab" class="ui-segment font-mono" [attr.aria-selected]="file.path === openPath()" (click)="opened.set(file.path)">{{ file.path }}</button>
            }
          </div>
          @if (openFile(); as file) {
            <div class="mt-2 overflow-hidden rounded-panel border border-line-subtle bg-surface-1" role="tabpanel" [attr.aria-label]="file.path">
              <div class="flex items-center justify-end gap-2 border-b border-line-subtle px-2 py-1">
                <button type="button" class="ui-btn-ghost" (click)="copy(file)">{{ copied() === file.path ? ('Copiado' | t) : ('Copiar' | t) }}</button>
                <button type="button" class="ui-btn-ghost" (click)="download(file)">{{ 'Descargar' | t }}</button>
              </div>
              <pre class="max-h-96 overflow-auto p-3 text-xs leading-relaxed text-ink-1"><code>{{ file.content }}</code></pre>
            </div>
          }
        }
      </section>
    </section>
  `,
    styles: [`
    .category-focused { border-color: var(--accent-text); }
    .app-piece {
      min-width: 9rem;
      max-width: 16rem;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-surface-2);
      padding: 0.5rem 0.75rem;
    }
    fieldset:disabled label { cursor: default; }
  `]
})
export class SystemDesignComponent {
  private readonly api = inject(SystemDesignApi);

  readonly design = input.required<SystemDesign>();
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  readonly nodes = input.required<CloudNode[]>();
  readonly links = input.required<CloudLink[]>();
  readonly provider = input.required<CloudProviderId>();
  /** Coste mensual estimado de la infraestructura; `null` si no hay estimación. */
  readonly costUsd = input<number | null>(null);
  readonly changed = output<SystemDesign>();

  readonly catalog = SYSTEM_CATALOG;
  readonly inputs = NFR_INPUTS;
  readonly compliance = COMPLIANCE_OPTIONS;
  /** En pantallas estrechas la vista no se edita. */
  readonly readonly = signal(typeof matchMedia === 'function' && matchMedia('(max-width: 639px)').matches);

  readonly nameOf = (node: { id: string }): string => {
    const found = this.nodes().find((candidate) => candidate.id === node.id);
    return found ? found.name?.trim() || forProvider(found.service, this.provider()) : node.id;
  };

  readonly findings = computed<SystemFinding[]>(() => evaluateSystem(this.design(), this.nodes(), this.costUsd(), this.nameOf));
  readonly errors = computed(() => this.findings().filter((finding) => finding.severity === 'error').length);
  /** Lo que no es de una categoría concreta (o es de un requisito): va en la lista de abajo. */
  readonly general = computed(() => this.findings().filter((finding) => finding.kind !== 'deployment' && finding.rule !== 'choice-missing'));
  readonly summary = computed(() => {
    const total = this.findings().length;
    const errors = this.errors();
    if (!total) {
      return 'Sin avisos';
    }
    const warnings = total - errors;
    return [errors ? `${errors} ${errors === 1 ? 'error' : 'errores'}` : '', warnings ? `${warnings} ${warnings === 1 ? 'aviso' : 'avisos'}` : '']
      .filter(Boolean).join(' · ');
  });

  private readonly pieces = computed<Piece[]>(() => this.catalog.flatMap((category): Piece[] => {
    const option = chosen(this.design(), category.id);
    if (!option) {
      return [];
    }
    const node = this.nodes().find((candidate) => candidate.id === this.design().deployments[category.id]);
    return [{ category, option, on: node ? this.nameOf(node) : null }];
  }));
  /** El camino de una petición: cliente, BFF si lo hay, backend y base de datos. */
  readonly requestPath = computed(() => (['client', 'bff', 'backend', 'database'] as SystemCategoryId[])
    .flatMap((id) => this.pieces().filter((piece) => piece.category.id === id)));
  readonly supporting = computed(() => this.pieces().filter((piece) => ['auth', 'cache', 'queue', 'push'].includes(piece.category.id)));
  readonly apiStyle = computed(() => chosen(this.design(), 'api')?.name ?? '');
  readonly contractName = computed(() => {
    const contract = chosen(this.design(), 'api')?.contract;
    return contract === 'openapi' ? 'OpenAPI' : contract === 'proto' ? '.proto' : 'no se genera para este estilo';
  });

  // ---------- Marcas ----------
  readonly trademarkNotice = TRADEMARK_NOTICE;
  /** Las atribuciones que piden las marcas cuyo logo está ahora en el diagrama. */
  readonly attributions = computed(() => Object.values(this.design().choices).flatMap((option) => (option && REQUIRED_ATTRIBUTIONS[option] ? [REQUIRED_ATTRIBUTIONS[option]] : [])));

  logosOf(option: string): BrandLogo[] {
    return OPTION_LOGOS[option] ?? [];
  }

  // ---------- Diagrama y asistente ----------
  /** Categoría que se está editando: su pieza se resalta en el diagrama. */
  readonly focused = signal<SystemCategoryId | null>(null);
  readonly advisorOpen = signal(false);
  readonly assessment = computed(() => assessSystem(this.design(), this.nodes(), this.findings()));
  /** El consejo más grave, que se muestra bajo el diagrama. */
  readonly topAdvice = computed(() => this.assessment().advice[0] ?? null);
  readonly adviceCount = computed(() => {
    const total = this.assessment().advice.length;
    return total ? `${total} ${total === 1 ? 'sugerencia' : 'sugerencias'}` : 'Sin sugerencias';
  });

  /** Lleva a las opciones de la pieza pulsada en el diagrama. */
  goTo(category: SystemCategoryId): void {
    this.focused.set(category);
    const fieldset = this.host.querySelector<HTMLElement>(`fieldset[data-category="${category}"]`);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    fieldset?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    fieldset?.querySelector<HTMLElement>('input:checked, input, select')?.focus({ preventScroll: true });
  }

  /** Aplica un consejo que es una elección de esta vista. */
  apply(advice: Advice): void {
    if (advice.action?.kind === 'choose' && !this.readonly()) {
      this.focused.set(advice.action.category);
      this.choose(advice.action.category, advice.action.option);
    }
  }

  // ---------- Archivos generados ----------
  readonly generating = signal(false);
  readonly error = signal<string | null>(null);
  readonly files = signal<SystemDesignFile[]>([]);
  readonly opened = signal<string | null>(null);
  readonly openFile = computed(() => this.files().find((file) => file.path === this.opened()) ?? this.files()[0] ?? null);
  readonly openPath = computed(() => this.openFile()?.path ?? null);
  readonly copied = signal<string | null>(null);

  /** «Sin caché», «Sin BFF»: las siglas no se pasan a minúsculas. */
  none(category: SystemCategory): string {
    return `Sin ${category.name === category.name.toUpperCase() ? category.name : category.name.toLowerCase()}`;
  }

  optionOf(category: SystemCategoryId): SystemOption | null {
    return chosen(this.design(), category);
  }

  targetsOf(option: SystemOption): CloudNode[] {
    return deployTargets(option, this.nodes());
  }

  findingsOf(category: SystemCategoryId): SystemFinding[] {
    return this.findings().filter((finding) => finding.category === category && (finding.kind === 'deployment' || finding.rule === 'choice-missing'));
  }

  where(piece: Piece): string {
    if (!piece.option.deploysOn.length) {
      return piece.category.id === 'client' ? 'En las tiendas de aplicaciones' : 'Dentro del backend';
    }
    return piece.on ? `en ${piece.on}` : 'sin desplegar';
  }

  tone(finding: SystemFinding): string {
    return finding.severity === 'error'
      ? 'border-status-danger/30 bg-status-danger/10 text-status-danger'
      : 'border-status-warn/30 bg-status-warn/10 text-status-warn';
  }

  choose(category: SystemCategoryId, option: string | null): void {
    this.changed.emit(withChoice(this.design(), category, option));
  }

  deploy(category: SystemCategoryId, nodeId: string): void {
    const deployments = { ...this.design().deployments };
    if (nodeId) {
      deployments[category] = nodeId;
    } else {
      delete deployments[category];
    }
    this.changed.emit({ ...this.design(), deployments });
  }

  setNumber(field: NfrField, text: string): void {
    const nfr = { ...this.design().nfr };
    const value = Number(text);
    if (text.trim() === '' || !Number.isFinite(value)) {
      delete nfr[field];
    } else {
      nfr[field] = value;
    }
    this.changed.emit({ ...this.design(), nfr });
  }

  toggleCompliance(id: Compliance, on: boolean): void {
    const current = this.design().nfr.compliance;
    const compliance = this.compliance.map((option) => option.id).filter((option) => (option === id ? on : current.includes(option)));
    this.changed.emit({ ...this.design(), nfr: { ...this.design().nfr, compliance } });
  }

  /** Pide al backend los archivos de partida del sistema tal como está ahora. No guarda nada. */
  generate(): void {
    if (this.generating()) {
      return;
    }
    this.generating.set(true);
    this.error.set(null);
    const cost = this.costUsd();
    this.api.publicArchitectureSystemDesignGeneratePost({
      cloudProvider: this.provider(),
      nodes: this.nodes() as unknown as { [key: string]: unknown }[],
      connections: this.links() as unknown as { [key: string]: unknown }[],
      system: this.design(),
      ...(cost !== null ? { estimatedMonthlyCostUsd: cost } : {}),
    }).pipe(finalize(() => this.generating.set(false))).subscribe({
      next: (bundle) => {
        this.files.set(bundle.files);
        this.opened.set(bundle.files[0]?.path ?? null);
      },
      error: (failure: HttpErrorResponse) => {
        this.files.set([]);
        this.error.set(failure.status === 404
          ? 'La generación de archivos la hace el servidor, y ahora no está disponible (en modo demo no se simula).'
          : failure.status === 429
            ? 'Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.'
            : failure.status === 400
              ? 'El servidor no acepta este diseño. Revisa las comprobaciones de arriba.'
              : 'No se pudieron generar los archivos. Vuelve a intentarlo más tarde.');
      },
    });
  }

  async copy(file: SystemDesignFile): Promise<void> {
    try {
      await navigator.clipboard.writeText(file.content);
      this.copied.set(file.path);
    } catch {
      this.copied.set(null);
    }
  }

  download(file: SystemDesignFile): void {
    downloadBlob(new Blob([file.content], { type: 'text/plain' }), file.path);
  }
}
