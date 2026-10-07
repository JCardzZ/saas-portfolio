import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { runtimeConfig } from '../../../core/config/runtime-config';
import { AppliedAIRAGService } from '../../../core/api';
import { describeHttpError } from '../../../core/errors/http-error';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { MarkdownComponent } from '../../../shared/ui/markdown.component';
import { AUDIT_AREAS, Recommendation, auditPrompt } from './topology-auditor';

/**
 * Tarjeta flotante con la auditoría de la topología. Tiene dos partes que no se mezclan:
 * las recomendaciones, calculadas con reglas sobre el diagrama, y el contraste con la
 * plataforma real, que redacta el asistente RAG (Gemini) a partir del código y la
 * documentación indexados.
 */
@Component({
  selector: 'app-audit-card',
  standalone: true,
  imports: [MarkdownComponent, AutofocusDirective],
  host: { class: 'block', '(keydown.escape)': 'closed.emit(); $event.stopPropagation()' },
  template: `
    <section class="flex max-h-[34rem] animate-scale-up border border-white/15 bg-zinc-950/90 backdrop-blur-2xl flex-col overflow-hidden rounded-3xl shadow-2xl" role="dialog" aria-labelledby="audit-title">
      <header class="flex items-start gap-3 border-b border-white/10 px-4 py-3">
        <div class="min-w-0 flex-1">
          <h4 id="audit-title" class="text-sm font-semibold text-white">Auditoría de la topología</h4>
          <p class="text-[11px] text-zinc-400">{{ providerName() }} · {{ actions() }} {{ actions() === 1 ? 'recomendación' : 'recomendaciones' }} · {{ covered() }} ya cubiertas</p>
        </div>
        <button type="button" appAutofocus class="focus-ring rounded-full px-2 text-lg leading-none text-zinc-400 hover:text-white" aria-label="Cerrar la auditoría" (click)="closed.emit()">×</button>
      </header>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        @for (area of areas(); track area.id) {
          <section [attr.aria-label]="area.name">
            <h5 class="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{{ area.name }}</h5>
            <ul class="mt-1.5 space-y-2">
              @for (item of area.items; track item.title) {
                <li class="flex gap-2 animate-slide-up" [style.animation-delay.ms]="$index * 60">
                  <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" [class]="item.level === 'ok' ? 'bg-emerald-400' : 'bg-amber-400'" aria-hidden="true"></span>
                  <p class="text-xs leading-snug text-zinc-400">
                    <span class="font-medium text-white">{{ item.title }}.</span>
                    <span class="sr-only">{{ item.level === 'ok' ? ' Cubierto. ' : ' A revisar. ' }}</span>
                    {{ item.detail }}
                  </p>
                </li>
              }
            </ul>
          </section>
        }

        <section class="rounded-2xl border border-white/10 bg-black/30 p-3" aria-label="Contraste con la plataforma real" aria-live="polite">
          <h5 class="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Contraste con la plataforma real · asistente RAG (Gemini){{ demo ? ' · respuesta simulada' : '' }}
          </h5>
          @if (pending()) {
            <p class="mt-2 animate-pulse text-xs text-zinc-400">Consultando el código y la documentación indexados…</p>
          } @else if (error()) {
            <p class="mt-2 text-xs text-amber-200">{{ error() }}</p>
            <button type="button" class="focus-ring mt-2 rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-200 hover:bg-white/10" (click)="ask()">Reintentar</button>
          } @else {
            <app-markdown class="mt-2 block text-xs leading-relaxed text-zinc-300" [text]="answer()" />
            @if (sources() > 0) {
              <p class="mt-2 text-[10px] text-zinc-500">{{ sources() }} {{ sources() === 1 ? 'fuente citada' : 'fuentes citadas' }} del índice.</p>
            }
          }
        </section>
      </div>

      <footer class="border-t border-white/10 px-4 py-2 text-[10px] leading-snug text-zinc-500">
        Las recomendaciones salen de reglas aplicadas al diagrama, no de un modelo. El asistente solo responde con lo
        que hay indexado de la plataforma real.
      </footer>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditCardComponent implements OnInit {
  private readonly api = inject(AppliedAIRAGService);
  private readonly destroyRef = inject(DestroyRef);

  readonly recommendations = input.required<Recommendation[]>();
  readonly providerName = input.required<string>();
  readonly closed = output<void>();
  /** La consulta al asistente ha terminado: `true` si respondió. */
  readonly answered = output<boolean>();

  readonly demo = runtimeConfig.mockMode;
  readonly pending = signal(false);
  readonly answer = signal('');
  readonly sources = signal(0);
  readonly error = signal<string | null>(null);

  readonly areas = computed(() =>
    AUDIT_AREAS.map((area) => ({ ...area, items: this.recommendations().filter((item) => item.area === area.id) }))
      .filter((area) => area.items.length > 0));
  readonly actions = computed(() => this.recommendations().filter((item) => item.level === 'action').length);
  readonly covered = computed(() => this.recommendations().length - this.actions());

  ngOnInit(): void {
    this.ask();
  }

  ask(): void {
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    // Si la tarjeta se cierra antes de que llegue la respuesta, la consulta se abandona.
    this.api.aiRagQueryPost({ prompt: auditPrompt(this.recommendations(), this.providerName()) }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.answer.set(response.answer ?? '');
        this.sources.set(response.citations?.length ?? 0);
        this.pending.set(false);
        this.answered.emit(true);
      },
      error: (error: unknown) => {
        this.error.set(`El asistente no está disponible ahora (${describeHttpError(error)}). Las recomendaciones de arriba no dependen de él.`);
        this.pending.set(false);
        this.answered.emit(false);
      },
    });
  }
}
