import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { finalize } from 'rxjs';

import { runtimeConfig } from '../../../core/config/runtime-config';
import { AppliedAIRAGService } from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { MarkdownComponent } from '../../../shared/ui/markdown.component';
import { CatalogCategory } from './cloud-catalog.data';
import { CostOverrides, formatUsd } from './cloud-costs.data';
import { CloudProviderId } from './cloud-topology.data';
import { COPILOT_MAX_PROMPT, CopilotAddition, CopilotRecommendation, additionName, additionsCost, cleanAdvice } from './copilot';
import { StudioProject } from './studio-project';

interface Exchange {
  id: number;
  question: string;
  answer: string;
  recommendations: (CopilotRecommendation & { applied: number | null })[];
  error: string | null;
  pending: boolean;
}

const SUGGESTIONS = ['¿Cómo hago esta arquitectura más resiliente?', 'Optimiza los costes de la base de datos', 'Añade una capa L2 de Polygon e IPFS para Web3'];

/**
 * Copiloto de arquitectura: preguntas en lenguaje natural sobre el diagrama del lienzo. El
 * modelo responde con recomendaciones y sus contrapartidas; el impacto en el coste se calcula
 * aquí con el catálogo, no lo estima el modelo, y nada llega al lienzo hasta que la persona
 * pulsa «Aplicar cambios».
 */
@Component({
    selector: 'app-architecture-copilot',
    imports: [TranslatePipe, MarkdownComponent, AutofocusDirective],
    host: { class: 'block', '(keydown.escape)': 'closed.emit(); $event.stopPropagation()', '(keydown)': '$event.stopPropagation()' },
    template: `
    <section class="flex max-h-[36rem] animate-scale-up flex-col overflow-hidden rounded-card border border-line-strong bg-surface-1/95 text-ink-1 shadow-2xl backdrop-blur-2xl" role="dialog" aria-labelledby="copilot-title">
      <header class="flex items-start gap-3 border-b border-line-subtle px-4 py-3">
        <div class="min-w-0 flex-1">
          <h4 id="copilot-title" class="text-sm font-semibold text-ink-1">{{ 'Co-piloto de arquitectura' | t }}</h4>
          <p class="text-xs text-ink-2">IA sobre tu diagrama{{ demo ? (' · respuestas simuladas (modo demo)' | t) : (' · Gemini con el índice RAG' | t) }}</p>
        </div>
        <button type="button" class="focus-ring rounded-control px-2 text-lg leading-none text-ink-2 hover:text-ink-1" [attr.aria-label]="'Cerrar el copiloto' | t" (click)="closed.emit()">×</button>
      </header>

      <div #scroll class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3" aria-live="polite">
        @for (exchange of exchanges(); track exchange.id) {
          <article>
            <p class="ml-8 rounded-panel rounded-br-mark bg-accent-solid px-3 py-1.5 text-xs text-accent-on">{{ exchange.question }}</p>
            @if (exchange.pending) {
              <p class="mt-2 animate-pulse text-xs text-ink-2">{{ 'Analizando el diagrama…' | t }}</p>
            } @else if (exchange.error) {
              <p class="mt-2 text-xs text-status-warn" role="alert">{{ exchange.error }}</p>
            } @else {
              <app-markdown class="mt-2 block text-xs leading-relaxed text-ink-2" [text]="exchange.answer" />
              @for (recommendation of exchange.recommendations; track recommendation.title) {
                <div class="mt-2 rounded-panel border border-line-subtle bg-surface-2 p-3">
                  <h5 class="text-[13px] font-medium text-ink-1">{{ recommendation.title }}</h5>
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p class="text-xs font-medium uppercase tracking-wider text-status-ok">{{ 'Puntos fuertes' | t }}</p>
                      <ul class="mt-1 space-y-1 text-xs leading-snug text-ink-2">
                        @for (pro of recommendation.pros; track pro) { <li>{{ pro }}</li> } @empty { <li class="text-ink-3">—</li> }
                      </ul>
                    </div>
                    <div>
                      <p class="text-xs font-medium uppercase tracking-wider text-status-warn">{{ 'Riesgos y costes' | t }}</p>
                      <ul class="mt-1 space-y-1 text-xs leading-snug text-ink-2">
                        @for (con of recommendation.cons; track con) { <li>{{ con }}</li> } @empty { <li class="text-ink-3">—</li> }
                      </ul>
                    </div>
                  </div>

                  <p class="mt-2 text-xs text-ink-2" data-finops>
                    <span class="font-medium text-ink-1">FinOps:</span> {{ impactOf(recommendation.additions) }}
                  </p>

                  @if (recommendation.snippet) {
                    <figure class="mt-2 overflow-hidden rounded-panel border border-line-subtle bg-surface-2">
                      <figcaption class="border-b border-line-subtle px-2 py-1 font-mono text-xs text-ink-3">{{ recommendation.snippetLanguage }} · ejemplo ilustrativo, sin verificar</figcaption>
                      <pre class="max-h-40 overflow-auto p-2 font-mono text-xs leading-relaxed text-ink-1" tabindex="0">{{ recommendation.snippet }}</pre>
                    </figure>
                  }

                  @if (recommendation.additions.length > 0) {
                    <ul class="mt-2 flex flex-wrap gap-1" [attr.aria-label]="'Piezas que añadiría' | t">
                      @for (addition of recommendation.additions; track $index) {
                        <li class="rounded-full border border-line-strong px-2 py-0.5 text-xs text-ink-1">
                          + {{ nameOf(addition) }}@if (addition.code === 'custom') { <span class="text-ink-3"> {{ '· fuera del catálogo' | t }}</span> }
                        </li>
                      }
                    </ul>
                    <button
                      type="button"
                      class="focus-ring mt-2 rounded-control bg-accent-solid px-3 py-1 text-xs font-medium text-accent-on transition hover:bg-accent-solid-hover disabled:cursor-default disabled:bg-surface-3 disabled:text-ink-2"
                      [disabled]="recommendation.applied !== null"
                      (click)="apply(exchange.id, recommendation)"
                    >
                      {{ recommendation.applied === null ? ('✨ Aplicar cambios al lienzo' | t) : ('Aplicado · ' | t) + recommendation.applied + (recommendation.applied === 1 ? (' pieza' | t) : (' piezas' | t)) }}
                    </button>
                  }
                </div>
              }
            }
          </article>
        } @empty {
          <div class="text-xs text-ink-2">
            <p>{{ 'Pregunta por tu diagrama. Por ejemplo:' | t }}</p>
            <ul class="mt-2 space-y-1.5">
              @for (suggestion of suggestions; track suggestion) {
                <li><button type="button" class="focus-ring rounded-control border border-line-strong px-3 py-1 text-left text-ink-1 transition hover:bg-surface-3" (click)="ask(suggestion)">{{ suggestion }}</button></li>
              }
            </ul>
          </div>
        }
      </div>

      <form class="flex items-end gap-2 border-t border-line-subtle p-3" (submit)="submit($event)">
        <label class="sr-only" for="copilot-prompt">{{ 'Pregunta para el copiloto' | t }}</label>
        <textarea
          #prompt
          id="copilot-prompt"
          appAutofocus
          rows="2"
          [attr.maxlength]="maxPrompt"
          class="focus-ring min-w-0 flex-1 resize-none rounded-panel border border-line-subtle bg-surface-2 px-3 py-1.5 text-xs text-ink-1 placeholder:text-ink-3"
          [placeholder]="'¿Qué quieres mejorar de esta arquitectura?' | t"
          (keydown.enter)="submit($event)"
        ></textarea>
        <button type="submit" class="focus-ring rounded-control bg-accent-solid px-3 py-1.5 text-xs font-medium text-accent-on disabled:opacity-40" [disabled]="busy()">{{ 'Preguntar' | t }}</button>
      </form>
      <p class="border-t border-line-subtle px-4 py-2 text-xs leading-snug text-ink-3">
        {{ 'Las recomendaciones las redacta un modelo y pueden equivocarse: revísalas. El coste sale del catálogo del estudio, no del modelo.' | t }}
      </p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArchitectureCopilotComponent {
  private readonly api = inject(AppliedAIRAGService);

  readonly project = input.required<StudioProject>();
  readonly catalog = input.required<CatalogCategory[]>();
  readonly costs = input<CostOverrides>({});
  /** La persona ha pedido aplicar las piezas de una recomendación; quien escucha responde con cuántas ha colocado. */
  readonly applied = output<{ additions: CopilotAddition[]; done: (count: number) => void }>();
  readonly closed = output<void>();

  readonly demo = runtimeConfig.mockMode;
  readonly suggestions = SUGGESTIONS;
  readonly maxPrompt = COPILOT_MAX_PROMPT;
  readonly exchanges = signal<Exchange[]>([]);
  readonly busy = signal(false);
  private nextId = 1;

  private readonly promptField = viewChild<ElementRef<HTMLTextAreaElement>>('prompt');
  private readonly scroll = viewChild<ElementRef<HTMLElement>>('scroll');

  submit(event: Event): void {
    event.preventDefault();
    const field = this.promptField()?.nativeElement;
    if (field && this.ask(field.value)) {
      field.value = '';
    }
  }

  ask(question: string): boolean {
    const prompt = question.trim();
    if (!prompt || prompt.length > COPILOT_MAX_PROMPT || this.busy()) {
      return false;
    }
    const id = this.nextId++;
    const project = this.project();
    this.exchanges.update((list) => [...list, { id, question: prompt, answer: '', recommendations: [], error: null, pending: true }]);
    this.busy.set(true);
    this.scrollToEnd();

    this.api.aiArchitectureCopilotPost({
      prompt, cloudProvider: project.provider,
      nodes: project.nodes as unknown as { [key: string]: unknown }[],
      connections: project.links as unknown as { [key: string]: unknown }[],
    }).pipe(finalize(() => this.busy.set(false))).subscribe({
      next: (response) => {
        const advice = cleanAdvice(response, this.catalog());
        this.patch(id, {
          pending: false, answer: advice.answer || 'El copiloto no ha dado una respuesta.',
          recommendations: advice.recommendations.map((recommendation) => ({ ...recommendation, applied: null })),
        });
        this.scrollToEnd();
      },
      error: (error: unknown) => this.patch(id, { pending: false, error: `El copiloto no está disponible ahora: ${describeHttpError(error)}` }),
    });
    return true;
  }

  apply(exchangeId: number, recommendation: CopilotRecommendation): void {
    this.applied.emit({
      additions: recommendation.additions,
      done: (count) => this.exchanges.update((list) => list.map((exchange) => (exchange.id !== exchangeId ? exchange : {
        ...exchange,
        recommendations: exchange.recommendations.map((item) => (item.title === recommendation.title ? { ...item, applied: count } : item)),
      }))),
    });
  }

  nameOf(addition: CopilotAddition): string {
    return additionName(addition, this.catalog(), this.provider());
  }

  /** Impacto en el coste mensual, con los costes orientativos del catálogo. */
  impactOf(additions: CopilotAddition[]): string {
    if (additions.length === 0) {
      return 'no añade piezas: sin coste fijo nuevo.';
    }
    const { usd, unknown } = additionsCost(additions, this.catalog(), this.provider(), this.costs());
    const known = additions.length - unknown;
    const parts = [
      ...(known > 0 ? [`≈ +${formatUsd(usd)}/mes (estimación orientativa del catálogo)`] : []),
      ...(unknown > 0 ? [`${unknown} ${unknown === 1 ? 'pieza' : 'piezas'} fuera del catálogo, sin estimación`] : []),
    ];
    return parts.join(' · ') + '.';
  }

  private provider(): CloudProviderId {
    return this.project().provider;
  }

  private patch(id: number, change: Partial<Exchange>): void {
    this.exchanges.update((list) => list.map((exchange) => (exchange.id === id ? { ...exchange, ...change } : exchange)));
  }

  private scrollToEnd(): void {
    setTimeout(() => {
      const element = this.scroll()?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}
