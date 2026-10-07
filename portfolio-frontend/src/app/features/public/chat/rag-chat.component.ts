import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, model, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { FocusTrapDirective } from '../../../shared/ui/focus-trap.directive';
import { MarkdownComponent } from '../../../shared/ui/markdown.component';
import { CitationPillComponent } from './citation-pill.component';
import { MAX_PROMPT_LENGTH, RagChatStore } from './data/rag-chat.store';

/**
 * Asistente RAG como panel tipo Spotlight. La conversación se conserva mientras
 * viva el componente, aunque el panel se cierre y se vuelva a abrir.
 */
@Component({
  selector: 'app-rag-chat',
  standalone: true,
  imports: [ReactiveFormsModule, AutofocusDirective, CitationPillComponent, FocusTrapDirective, MarkdownComponent],
  providers: [RagChatStore],
  templateUrl: './rag-chat.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RagChatComponent {
  readonly store = inject(RagChatStore);

  readonly open = model(false);

  readonly maxLength = MAX_PROMPT_LENGTH;
  readonly prompt = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_PROMPT_LENGTH)],
  });
  readonly suggestions = [
    '¿Qué arquitectura usa el backend y por qué?',
    '¿Cómo funciona la caché con Redis?',
    '¿Qué proyectos incluye el portafolio?',
  ];

  private readonly feed = viewChild<ElementRef<HTMLElement>>('feed');

  constructor() {
    // Mantiene a la vista el último mensaje cada vez que cambia la conversación.
    effect(() => {
      this.store.messages();
      this.store.pending();
      const element = this.feed()?.nativeElement;
      if (element) {
        setTimeout(() => element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' }));
      }
    });
  }

  close(): void {
    this.open.set(false);
  }

  // Formulario nativo (un solo control, sin FormGroup): hay que impedir la recarga de la página.
  submit(event: Event): void {
    event.preventDefault();
    if (this.prompt.invalid || !this.prompt.value.trim() || this.store.pending()) {
      return;
    }
    this.store.ask(this.prompt.value);
    this.prompt.reset();
  }

  ask(question: string): void {
    this.store.ask(question);
  }

  // Al desaparecer la alerta, su trampa de foco lo devuelve al campo de la pregunta.
  dismissAlert(): void {
    this.store.dismissAlert();
  }
}
