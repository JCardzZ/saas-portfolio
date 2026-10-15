import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, model, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { Article, Project, PublicCatalogShowcasesService, Technology } from '../../../core/api';
import { featureEnabled } from '../../../core/config/feature-flags';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { CvPickerService } from '../../../shared/ui/cv-download.component';
import { FocusTrapDirective } from '../../../shared/ui/focus-trap.directive';
import { MarkdownComponent } from '../../../shared/ui/markdown.component';
import { CitationPillComponent } from './citation-pill.component';
import { PaletteEntry, PaletteGroup, searchPalette } from './data/palette-search';
import { MAX_PROMPT_LENGTH, RagChatStore } from './data/rag-chat.store';
import SEARCH_INDEX from './generated/search-index.json';

/**
 * Accesos rápidos junto a la caja de búsqueda, en el orden de sus atajos (1 a 4). Los iconos son
 * dibujos propios (trazo de 1,6 sobre 24 px), no los de ninguna marca ni sistema operativo.
 */
export const QUICK_ACTIONS = [
  {
    id: 'estudio', label: 'Estudio', hint: 'Plantillas del Estudio de arquitectura',
    icon: 'M3 4h6v6H3zM15 4h6v6h-6zM9 15h6v6H9zM6 10v2.5h12V10M12 12.5V15',
  },
  {
    id: 'proyectos', label: 'Proyectos', hint: 'Proyectos del portafolio',
    icon: 'M3 7.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  },
  {
    id: 'cv', label: 'CV', hint: 'Descargar el CV',
    icon: 'M7 3h7l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v4h4M9 12h6M9 16h4',
  },
  {
    id: 'ia', label: 'IA', hint: 'Preguntar al asistente',
    icon: 'M11 4l1.8 4.7 4.7 1.8-4.7 1.8L11 17l-1.8-4.7-4.7-1.8 4.7-1.8zM18.5 15.5v4M16.5 17.5h4',
  },
] as const;
export type QuickActionId = (typeof QUICK_ACTIONS)[number]['id'];

const ACTION_SCOPE: Partial<Record<QuickActionId, PaletteGroup>> = { estudio: 'plantillas', proyectos: 'proyectos' };

/** Lo que se puede elegir en la lista: un resultado o, al final, llevar lo escrito al asistente. */
export type PaletteOption =
  | { kind: 'entry'; id: string; entry: PaletteEntry }
  | { kind: 'ask'; id: string; question: string };

const ASK_OPTION_ID = 'palette-option-ask';

/**
 * Asistente RAG como panel tipo Spotlight y, con `ui.command-palette`, paleta de comandos: lo
 * escrito busca en un índice local (secciones, proyectos, tecnologías, plantillas y artículos) y
 * siempre se puede llevar al asistente. La conversación se conserva mientras viva el componente,
 * aunque el panel se cierre y se vuelva a abrir.
 */
@Component({
    selector: 'app-rag-chat',
    imports: [TranslatePipe, NgTemplateOutlet, ReactiveFormsModule, AutofocusDirective, CitationPillComponent, FocusTrapDirective, MarkdownComponent],
    providers: [RagChatStore],
    templateUrl: './rag-chat.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RagChatComponent {
  readonly store = inject(RagChatStore);
  private readonly api = inject(PublicCatalogShowcasesService);
  private readonly cvPicker = inject(CvPickerService);

  readonly open = model(false);
  /** Contenido del CMS que ya tiene cargado la página: entra en el índice de búsqueda. */
  readonly projects = input<Project[]>([]);
  readonly technologies = input<Technology[]>([]);

  /** Con la paleta apagada, el panel es solo el asistente, como antes. */
  readonly palette = signal(featureEnabled('ui.command-palette'));
  /** En conversación, lo escrito va directo al asistente y no se busca. */
  readonly chatting = signal(false);
  /** Grupo al que limita la búsqueda un acceso rápido, o `null`. */
  readonly scope = signal<PaletteGroup | null>(null);
  /** Posición del elemento activo de la lista de resultados. */
  readonly cursor = signal(0);

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
  readonly quickActions = QUICK_ACTIONS;
  readonly modifier = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl ';

  private readonly query = toSignal(this.prompt.valueChanges, { initialValue: '' });
  private readonly articles = signal<Article[]>([]);
  private articlesRequested = false;

  private readonly entries = computed<PaletteEntry[]>(() => [
    ...(SEARCH_INDEX as PaletteEntry[]),
    ...this.projects().map((project): PaletteEntry => (
      { id: `proyecto-${project.id}`, group: 'proyectos', title: project.title ?? '', text: project.summary ?? '', target: `proyecto-${project.id}` })),
    ...this.technologies().map((technology): PaletteEntry => (
      { id: `tecnologia-${technology.id}`, group: 'tecnologias', title: technology.name ?? '', text: technology.category ?? '', target: 'tecnologias' })),
    ...this.articles().map((article): PaletteEntry => (
      { id: `articulo-${article.id}`, group: 'articulos', title: article.title ?? '', text: '', target: 'articulos' })),
  ].filter((entry) => entry.title.trim().length > 0));

  /** Se buscan resultados mientras no se conversa y hay algo escrito o un grupo elegido. */
  readonly searching = computed(() =>
    this.palette() && !this.chatting() && (this.query().trim().length > 0 || this.scope() !== null));
  readonly groups = computed(() => (this.searching() ? searchPalette(this.entries(), this.query(), this.scope()) : []));
  readonly options = computed<PaletteOption[]>(() => {
    if (!this.searching()) {
      return [];
    }
    const question = this.query().trim();
    return [
      ...this.groups().flatMap((group) => group.entries.map((entry): PaletteOption => ({ kind: 'entry', id: optionId(entry), entry }))),
      ...(question ? [{ kind: 'ask', id: ASK_OPTION_ID, question } as const] : []),
    ];
  });
  readonly activeOption = computed<PaletteOption | null>(() => this.options()[Math.min(this.cursor(), this.options().length - 1)] ?? null);
  readonly askOption = computed(() => this.options().find((option) => option.kind === 'ask') ?? null);
  readonly optionId = optionId;

  private readonly feed = viewChild<ElementRef<HTMLElement>>('feed');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly listbox = viewChild<ElementRef<HTMLElement>>('listbox');

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
    // Cada cambio en lo escrito devuelve la selección al primer resultado.
    this.prompt.valueChanges.subscribe(() => this.cursor.set(0));
    // Los artículos no los tiene la página a mano: se piden la primera vez que se abre la paleta.
    effect(() => {
      if (this.open() && this.palette() && !this.articlesRequested) {
        this.articlesRequested = true;
        this.api.publicArticlesGet().subscribe({ next: (articles) => this.articles.set(articles), error: () => undefined });
      }
    });
  }

  close(): void {
    this.open.set(false);
    this.scope.set(null);
  }

  // Formulario nativo (un solo control, sin FormGroup): hay que impedir la recarga de la página.
  submit(event: Event): void {
    event.preventDefault();
    if (this.searching()) {
      const option = this.activeOption();
      if (option) {
        this.activate(option);
      }
      return;
    }
    if (this.prompt.invalid || !this.prompt.value.trim() || this.store.pending()) {
      return;
    }
    this.ask(this.prompt.value);
  }

  ask(question: string): void {
    if (this.store.pending()) {
      return;
    }
    this.chatting.set(true);
    this.scope.set(null);
    this.store.ask(question);
    this.prompt.reset();
    this.field()?.nativeElement.focus();
  }

  activate(option: PaletteOption): void {
    if (option.kind === 'ask') {
      this.ask(option.question);
      return;
    }
    const target = option.entry.target;
    this.prompt.reset();
    this.close();
    // Tras cerrar, el foco vuelve a donde estaba; el desplazamiento va después para que no lo deshaga.
    setTimeout(() => {
      const element = document.getElementById(target) ?? document.getElementById(target.startsWith('proyecto-') ? 'proyectos' : target);
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      element?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  }

  /** Flechas para recorrer los resultados; el foco no sale del campo de texto. */
  onFieldKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    if (!count || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End')) {
      return;
    }
    if ((event.key === 'Home' || event.key === 'End') && !event.ctrlKey && !event.metaKey) {
      return; // Inicio y Fin a secas mueven el cursor dentro del texto.
    }
    event.preventDefault();
    const current = Math.min(this.cursor(), count - 1);
    const next = event.key === 'ArrowDown' ? (current + 1) % count
      : event.key === 'ArrowUp' ? (current - 1 + count) % count
        : event.key === 'Home' ? 0 : count - 1;
    this.cursor.set(next);
    setTimeout(() => this.listbox()?.nativeElement.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }

  /** ⌘ / Ctrl / Alt + 1…4 activan los accesos rápidos. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (!this.palette() || !(event.metaKey || event.ctrlKey || event.altKey)) {
      return;
    }
    const action = QUICK_ACTIONS[['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code)];
    if (action) {
      event.preventDefault();
      this.runAction(action.id);
    }
  }

  runAction(id: QuickActionId): void {
    if (id === 'cv') {
      this.close();
      this.cvPicker.open.set(true);
      return;
    }
    if (id === 'ia') {
      const question = this.prompt.value.trim();
      if (question && !this.chatting()) {
        this.ask(question);
      } else {
        this.chatting.update((chatting) => !chatting);
        this.scope.set(null);
      }
    } else {
      const scope = ACTION_SCOPE[id]!;
      this.chatting.set(false);
      this.scope.update((current) => (current === scope ? null : scope));
    }
    this.cursor.set(0);
    this.field()?.nativeElement.focus();
  }

  isActionOn(id: QuickActionId): boolean {
    return id === 'ia' ? this.chatting() : !this.chatting() && this.scope() !== null && this.scope() === ACTION_SCOPE[id];
  }

  hover(option: PaletteOption): void {
    this.cursor.set(this.options().indexOf(option));
  }

  optionFor(entry: PaletteEntry): PaletteOption {
    return this.options().find((option) => option.kind === 'entry' && option.entry === entry)!;
  }

  // Al desaparecer la alerta, su trampa de foco lo devuelve al campo de la pregunta.
  dismissAlert(): void {
    this.store.dismissAlert();
  }
}

function optionId(entry: PaletteEntry): string {
  return `palette-option-${entry.id}`;
}
