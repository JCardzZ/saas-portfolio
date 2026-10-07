import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { finalize } from 'rxjs';

import { environment } from '../../../../environments/environment';
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
  standalone: true,
  imports: [MarkdownComponent, AutofocusDirective],
  host: { class: 'block', '(keydown.escape)': 'closed.emit(); $event.stopPropagation()', '(keydown)': '$event.stopPropagation()' },
  template: `
    <section class="flex max-h-[36rem] animate-scale-up flex-col overflow-hidden rounded-3xl border border-white/15 bg-zinc-950/95 text-zinc-100 shadow-2xl backdrop-blur-2xl" role="dialog" aria-labelledby="copilot-title">
      <header class="flex items-start gap-3 border-b border-white/10 px-4 py-3">
        <div class="min-w-0 flex-1">
          <h4 id="copilot-title" class="text-sm font-semibold text-white">Co-piloto de arquitectura</h4>
          <p class="text-[11px] text-zinc-400">IA sobre tu diagrama{{ demo ? ' · respuestas simuladas (modo demo)' : ' · Gemini con el índice RAG' }}</p>
        </div>
        <button type="button" class="focus-ring rounded-full px-2 text-lg leading-none text-zinc-400 hover:text-white" aria-label="Cerrar el copiloto" (click)="closed.emit()">×</button>
      </header>

      <div #scroll class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3" aria-live="polite">
        @for (exchange of exchanges(); track exchange.id) {
          <article>
            <p class="ml-8 rounded-2xl rounded-br-md bg-accent px-3 py-1.5 text-xs text-white">{{ exchange.question }}</p>
            @if (exchange.pending) {
              <p class="mt-2 animate-pulse text-xs text-zinc-400">Analizando el diagrama…</p>
            } @else if (exchange.error) {
              <p class="mt-2 text-xs text-amber-200" role="alert">{{ exchange.error }}</p>
            } @else {
              <app-markdown class="mt-2 block text-xs leading-relaxed text-zinc-300" [text]="exchange.answer" />
              @for (recommendation of exchange.recommendations; track recommendation.title) {
                <div class="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <h5 class="text-[13px] font-medium text-white">{{ recommendation.title }}</h5>
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p class="text-[10px] font-medium uppercase tracking-wider text-emerald-300">Puntos fuertes</p>
                      <ul class="mt-1 space-y-1 text-[11px] leading-snug text-zinc-300">
                        @for (pro of recommendation.pros; track pro) { <li>{{ pro }}</li> } @empty { <li class="text-zinc-500">—</li> }
                      </ul>
                    </div>
                    <div>
                      <p class="text-[10px] font-medium uppercase tracking-wider text-amber-300">Riesgos y costes</p>
                      <ul class="mt-1 space-y-1 text-[11px] leading-snug text-zinc-300">
                        @for (con of recommendation.cons; track con) { <li>{{ con }}</li> } @empty { <li class="text-zinc-500">—</li> }
                      </ul>
                    </div>
                  </div>

                  <p class="mt-2 text-[11px] text-zinc-400" data-finops>
                    <span class="font-medium text-zinc-200">FinOps:</span> {{ impactOf(recommendation.additions) }}
                  </p>

                  @if (recommendation.snippet) {
                    <figure class="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/50">
                      <figcaption class="border-b border-white/10 px-2 py-1 font-mono text-[10px] text-zinc-500">{{ recommendation.snippetLanguage }} · ejemplo ilustrativo, sin verificar</figcaption>
                      <pre class="max-h-40 overflow-auto p-2 font-mono text-[10.5px] leading-relaxed text-zinc-200" tabindex="0">{{ recommendation.snippet }}</pre>
                    </figure>
                  }

                  @if (recommendation.additions.length > 0) {
                    <ul class="mt-2 flex flex-wrap gap-1" aria-label="Piezas que añadiría">
                      @for (addition of recommendation.additions; track $index) {
                        <li class="rounded-full border border-white/15 px-2 py-0.5 text-[10.5px] text-zinc-200">
                          + {{ nameOf(addition) }}@if (addition.code === 'custom') { <span class="text-zinc-500"> · fuera del catálogo</span> }
                        </li>
                      }
                    </ul>
                    <button
                      type="button"
                      class="focus-ring mt-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white transition hover:bg-accent-hover disabled:cursor-default disabled:bg-white/10 disabled:text-zinc-300"
                      [disabled]="recommendation.applied !== null"
                      (click)="apply(exchange.id, recommendation)"
                    >
                      {{ recommendation.applied === null ? '✨ Aplicar cambios al lienzo' : 'Aplicado · ' + recommendation.applied + (recommendation.applied === 1 ? ' pieza' : ' piezas') }}
                    </button>
                  }
                </div>
              }
            }
          </article>
        } @empty {
          <div class="text-xs text-zinc-400">
            <p>Pregunta por tu diagrama. Por ejemplo:</p>
            <ul class="mt-2 space-y-1.5">
              @for (suggestion of suggestions; track suggestion) {
                <li><button type="button" class="focus-ring rounded-full border border-white/15 px-3 py-1 text-left text-zinc-200 transition hover:bg-white/10" (click)="ask(suggestion)">{{ suggestion }}</button></li>
              }
            </ul>
          </div>
        }
      </div>

      <form class="flex items-end gap-2 border-t border-white/10 p-3" (submit)="submit($event)">
        <label class="sr-only" for="copilot-prompt">Pregunta para el copiloto</label>
        <textarea
          #prompt
          id="copilot-prompt"
          appAutofocus
          rows="2"
          [attr.maxlength]="maxPrompt"
          class="focus-ring min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white placeholder:text-zinc-500"
          placeholder="¿Qué quieres mejorar de esta arquitectura?"
          (keydown.enter)="submit($event)"
        ></textarea>
        <button type="submit" class="focus-ring rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40" [disabled]="busy()">Preguntar</button>
      </form>
      <p class="border-t border-white/10 px-4 py-2 text-[10px] leading-snug text-zinc-500">
        Las recomendaciones las redacta un modelo y pueden equivocarse: revísalas. El coste sale del catálogo del estudio, no del modelo.
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchitectureCopilotComponent {
  private readonly api = inject(AppliedAIRAGService);

  readonly project = input.required<StudioProject>();
  readonly catalog = input.required<CatalogCategory[]>();
  readonly costs = input<CostOverrides>({});
  /** La persona ha pedido aplicar las piezas de una recomendación; quien escucha responde con cuántas ha colocado. */
  readonly applied = output<{ additions: CopilotAddition[]; done: (count: number) => void }>();
  readonly closed = output<void>();

  readonly demo = environment.mockMode;
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
