import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { AIQueryResponseCitationsInner, AppliedAIRAGService } from '../../../../core/api';
import { describeHttpError } from '../../../../core/errors/http-error';
import { SystemEventsService } from '../../data/system-events.service';

/** Mismo tope que aplica el backend a la pregunta. */
export const MAX_PROMPT_LENGTH = 2000;

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  citations: AIQueryResponseCitationsInner[];
  failed: boolean;
}

export interface ChatAlert {
  title: string;
  message: string;
}

/**
 * Conversación con el asistente. Cada pregunta se responde de forma independiente:
 * el backend no recibe el historial.
 */
@Injectable()
export class RagChatStore {
  private readonly api = inject(AppliedAIRAGService);
  private readonly events = inject(SystemEventsService);

  private readonly _messages = signal<ChatMessage[]>([]);
  private readonly _pending = signal(false);
  private readonly _alert = signal<ChatAlert | null>(null);
  private nextId = 1;

  readonly messages = this._messages.asReadonly();
  readonly pending = this._pending.asReadonly();
  /** Aviso que interrumpe la conversación (límite de preguntas alcanzado). */
  readonly alert = this._alert.asReadonly();

  ask(prompt: string): void {
    const text = prompt.trim();
    if (!text || text.length > MAX_PROMPT_LENGTH || this._pending()) {
      return;
    }
    this.append('user', text);
    this._pending.set(true);
    this.events.emitBackendSimulation([
      ['info', 'POST /ai/rag/query', `"${text.length > 42 ? text.slice(0, 42) + '…' : text}"`],
      ['info', 'RateLimit check', 'rag-query · por IP y global'],
      ['ai', 'Gemini embedQuery', '768 dims'],
    ]);
    this.api
      .aiRagQueryPost({ prompt: text })
      .pipe(finalize(() => this._pending.set(false)))
      .subscribe({
        next: (response) => {
          const citations = response.citations ?? [];
          this.events.emitBackendSimulation([
            ['vector', 'pgvector CosineDistance', `top-${citations.length} · HNSW`],
            ['ai', 'Gemini generateContent', 'respuesta con contexto'],
            ['ok', '200 OK', `${citations.length} fuentes citadas`],
          ]);
          this.append('assistant', response.answer ?? '', citations);
        },
        error: (error: unknown) => this.handleError(error),
      });
  }

  dismissAlert(): void {
    this._alert.set(null);
  }

  private handleError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    this.events.emitBackendSimulation([['warn', `${status || 'ERR'} ${status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'ERROR'}`, 'POST /ai/rag/query']]);
    if (error instanceof HttpErrorResponse && error.status === 429) {
      this._alert.set({ title: 'Límite de preguntas alcanzado', message: describeHttpError(error) });
      return;
    }
    this.append('assistant', describeHttpError(error), [], true);
  }

  private append(
    role: ChatMessage['role'],
    text: string,
    citations: AIQueryResponseCitationsInner[] = [],
    failed = false,
  ): void {
    this._messages.update((messages) => [...messages, { id: this.nextId++, role, text, citations, failed }]);
  }
}
