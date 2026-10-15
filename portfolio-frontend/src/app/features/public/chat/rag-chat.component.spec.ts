import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { provideApi } from '../../../core/api';
import { MOCK_LATENCY_MS, mockApiInterceptor, resetMockApi } from '../../../core/mock/mock-api.interceptor';
import { CvPickerService } from '../../../shared/ui/cv-download.component';
import { RagChatComponent } from './rag-chat.component';

/**
 * Recorre el chat de punta a punta en el DOM, con la API simulada del modo demo. Las mismas
 * pruebas corren con la paleta de comandos apagada (el panel de antes) y encendida: el asistente
 * tiene que comportarse igual en las dos.
 */
for (const palette of [false, true]) {
describe(`RagChatComponent (chat, ui.command-palette ${palette ? 'on' : 'off'})`, () => {
  let fixture: ComponentFixture<RagChatComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), provideApi(environment.apiBaseUrl), provideRouter([])],
    });
    fixture = TestBed.createComponent(RagChatComponent);
    fixture.componentInstance.palette.set(palette);
    element = fixture.nativeElement;
    document.body.appendChild(element);
  });

  afterEach(() => element.remove());

  function open(): void {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
  }

  function ask(question: string): void {
    const input = element.querySelector<HTMLInputElement>('#rag-prompt')!;
    input.value = question;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    if (palette) {
      // Con la paleta, lo escrito busca; la pregunta se lleva al asistente con su opción.
      element.querySelector<HTMLElement>('[data-testid="palette-ask"]')!.click();
    } else {
      const submit = new Event('submit', { cancelable: true });
      element.querySelector('form')!.dispatchEvent(submit);
      expect(submit.defaultPrevented).withContext('el envío no debe recargar la página').toBeTrue();
    }
    fixture.detectChanges();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    tick();
  }

  function pressTab(target: HTMLElement, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  it('renders nothing while closed and focuses the question field when opened', fakeAsync(() => {
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();

    open();

    expect(document.activeElement).toBe(element.querySelector('#rag-prompt'));
  }));

  it('renders the answer as Markdown and expands a citation pill', fakeAsync(() => {
    open();
    ask('¿Qué arquitectura usa el backend?');

    const answer = element.querySelector('app-markdown')!;
    expect(answer.querySelector('strong')?.textContent).toBe('arquitectura hexagonal');
    expect(answer.querySelector('pre code')?.textContent).toContain('@Bean');

    const pill = element.querySelector<HTMLButtonElement>('app-citation-pill button')!;
    expect(pill.textContent).toContain('CLAUDE.md');
    expect(pill.textContent).toContain('L15-30');
    expect(pill.getAttribute('aria-expanded')).toBe('false');

    pill.click();
    fixture.detectChanges();

    expect(pill.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('app-citation-pill pre')?.textContent).toContain('Arquitectura Hexagonal Pura');
  }));

  it('says the answers come from Google Gemini, can be wrong and must not carry personal data', fakeAsync(() => {
    open();
    ask('¿Qué arquitectura usa el backend?');

    const notice = element.querySelector('[data-testid="ai-notice"]')!;
    expect(notice.textContent).toContain('Google Gemini');
    expect(notice.textContent).toContain('pueden contener errores');
    expect(notice.textContent).toContain('No escribas datos personales');
    expect(notice.querySelector('a')!.getAttribute('href')).toBe('/legal');
  }));

  it('keeps Tab inside the dialog, wrapping in both directions', fakeAsync(() => {
    open();
    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('input, button, a[href]'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    expect(pressTab(last).defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(first);

    expect(pressTab(first, true).defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(last);
  }));

  it('shows the rate limit as an alert that holds the focus until dismissed', fakeAsync(() => {
    open();
    ask('prueba 429');

    const alert = element.querySelector<HTMLElement>('[role="alertdialog"]')!;
    const button = alert.querySelector('button')!;
    expect(alert.textContent).toContain('Límite de preguntas alcanzado');
    expect(alert.textContent).toContain('42 segundos');
    expect(document.activeElement).toBe(button);

    // Con Tab el foco no escapa a los controles que quedan detrás de la alerta.
    pressTab(button);
    expect(document.activeElement).toBe(button);

    button.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(element.querySelector('#rag-prompt'));
  }));

  it('returns the focus to the trigger when the dialog closes', fakeAsync(() => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    open();

    element.querySelector<HTMLElement>('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  }));
});
}

describe('RagChatComponent (command palette)', () => {
  let fixture: ComponentFixture<RagChatComponent>;
  let element: HTMLElement;

  const PROJECTS = [
    { id: 'p1', title: 'Motor RAG con pgvector', summary: 'Búsqueda semántica sobre el código' },
    { id: 'p2', title: 'Rate limiter distribuido', summary: 'Ventana fija atómica en Redis' },
  ];
  const TECHNOLOGIES = [
    { id: 't1', name: 'Kubernetes', category: 'Infraestructura' },
    { id: 't2', name: 'PostgreSQL', category: 'Bases de datos' },
  ];

  beforeEach(() => {
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), provideApi(environment.apiBaseUrl), provideRouter([])],
    });
    fixture = TestBed.createComponent(RagChatComponent);
    fixture.componentInstance.palette.set(true);
    fixture.componentRef.setInput('projects', PROJECTS);
    fixture.componentRef.setInput('technologies', TECHNOLOGIES);
    element = fixture.nativeElement;
    document.body.appendChild(element);
  });

  afterEach(() => element.remove());

  const field = (): HTMLInputElement => element.querySelector<HTMLInputElement>('#rag-prompt')!;
  const options = (): HTMLElement[] => Array.from(element.querySelectorAll<HTMLElement>('[role="option"]'));
  const active = (): HTMLElement | null => element.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
  const groupLabels = (): string[] =>
    Array.from(element.querySelectorAll('[role="listbox"] [role="group"] > p')).map((label) => label.textContent!.trim());
  const action = (id: string): HTMLButtonElement => element.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;

  function open(): void {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    // Los artículos se piden al abrir.
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
  }

  function type(text: string): void {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    field().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  function enter(): void {
    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  }

  it('opens as a modal dialog with the search field focused and the suggestions below', fakeAsync(() => {
    open();

    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(field());
    expect(field().getAttribute('role')).toBe('combobox');
    expect(field().getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('[role="listbox"]')).toBeNull();
    expect(element.textContent).toContain('Sugerencias');
    expect(element.textContent).toContain('¿Cómo funciona la caché con Redis?');
    expect(Array.from(element.querySelectorAll('[data-action]')).map((button) => button.getAttribute('aria-label')))
      .toEqual(['Estudio', 'Proyectos', 'CV', 'IA']);
  }));

  it('groups the results as you type, with the first one active and the question to the assistant last', fakeAsync(() => {
    open();
    type('limiter');

    expect(field().getAttribute('aria-expanded')).toBe('true');
    expect(field().getAttribute('aria-controls')).toBe(element.querySelector('[role="listbox"]')!.id);
    expect(groupLabels()).toEqual(['Proyectos']);
    expect(options().map((option) => option.querySelector('span')!.textContent!.trim())).toEqual([
      'Rate limiter distribuido',
      'Preguntar a la IA: «limiter»',
    ]);
    expect(options()[0].textContent).toContain('Ventana fija atómica en Redis');
    expect(active()).toBe(options()[0]);
    expect(field().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    expect(element.textContent).not.toContain('Sugerencias');
  }));

  it('searches sections, projects, technologies, Studio templates and articles', fakeAsync(() => {
    open();

    type('tecnologias');
    expect(groupLabels()).toEqual(['Secciones']);
    type('kuberntes');
    expect(groupLabels()).toContain('Tecnologías');
    type('cdc');
    expect(groupLabels()).toContain('Plantillas');
    type('cache aside');
    expect(groupLabels()).toEqual(['Artículos']);
    type('pgvector');
    expect(groupLabels()).toContain('Proyectos');
  }));

  it('moves the active result with the arrow keys, wrapping at both ends, without leaving the field', fakeAsync(() => {
    open();
    type('arquitectura');
    const count = options().length;
    expect(count).toBeGreaterThan(2);

    expect(press('ArrowDown').defaultPrevented).toBeTrue();
    expect(active()).toBe(options()[1]);
    expect(field().getAttribute('aria-activedescendant')).toBe(options()[1].id);

    press('ArrowUp');
    press('ArrowUp');
    expect(active()).toBe(options()[count - 1]);
    expect(active()!.textContent).toContain('Preguntar a la IA');

    press('ArrowDown');
    expect(active()).toBe(options()[0]);
    expect(document.activeElement).toBe(field());
    tick();
  }));

  it('goes to the chosen result with Enter and closes', fakeAsync(() => {
    const section = document.createElement('section');
    section.id = 'entrega';
    document.body.appendChild(section);
    const scroll = spyOn(section, 'scrollIntoView');
    open();
    type('pipeline');

    expect(active()!.textContent).toContain('Entrega');
    enter();
    tick();

    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.store.messages()).toEqual([]);
    section.remove();
  }));

  it('takes what was typed to the assistant from the last option and keeps the conversation going', fakeAsync(() => {
    open();
    type('¿Qué arquitectura usa el backend?');
    press('ArrowUp');
    expect(active()!.textContent).toContain('Preguntar a la IA: «¿Qué arquitectura usa el backend?»');

    enter();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    tick();

    expect(element.querySelector('[role="listbox"]')).toBeNull();
    expect(element.querySelector('app-markdown strong')?.textContent).toBe('arquitectura hexagonal');
    expect(field().value).toBe('');
    expect(action('ia').getAttribute('aria-pressed')).toBe('true');

    // Ya en conversación, lo escrito va directo al asistente: no vuelve a buscar.
    type('¿Y la caché?');
    expect(element.querySelector('[role="listbox"]')).toBeNull();
    enter();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    tick();
    expect(fixture.componentInstance.store.messages().filter((message) => message.role === 'user').length).toBe(2);
  }));

  it('asks a suggestion with one click, as before', fakeAsync(() => {
    open();
    const suggestion = Array.from(element.querySelectorAll('button')).find((button) => button.textContent!.includes('caché con Redis'))!;

    suggestion.click();
    fixture.detectChanges();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    tick();

    expect(fixture.componentInstance.store.messages()[0].text).toBe('¿Cómo funciona la caché con Redis?');
    expect(element.querySelectorAll('app-markdown').length).toBe(1);
  }));

  it('says so when nothing matches and still offers the assistant', fakeAsync(() => {
    open();
    type('zzzzqqq');

    expect(element.querySelector('[role="listbox"]')!.textContent).toContain('Sin resultados en el portafolio.');
    expect(options().length).toBe(1);
    expect(active()!.textContent).toContain('Preguntar a la IA: «zzzzqqq»');
  }));

  it('limits the results to a group with its quick action and its shortcut', fakeAsync(() => {
    open();

    press('2', { code: 'Digit2', metaKey: true });
    expect(action('proyectos').getAttribute('aria-pressed')).toBe('true');
    expect(groupLabels()).toEqual(['Secciones', 'Proyectos']);
    expect(options().map((option) => option.querySelector('span')!.textContent)).toEqual(['Proyectos', 'Motor RAG con pgvector', 'Rate limiter distribuido']);

    type('kubernetes');
    expect(options().length).withContext('fuera del grupo no hay resultados; queda la pregunta').toBe(1);

    expect(press('1', { code: 'Digit1', ctrlKey: true }).defaultPrevented).toBeTrue();
    type('');
    expect(action('estudio').getAttribute('aria-pressed')).toBe('true');
    expect(action('proyectos').getAttribute('aria-pressed')).toBe('false');
    expect(groupLabels()).toEqual(['Secciones', 'Plantillas']);

    action('estudio').click();
    fixture.detectChanges();
    expect(element.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(field());
    tick();
  }));

  it('opens the CV picker with its quick action and closes the palette', fakeAsync(() => {
    const picker = TestBed.inject(CvPickerService);
    open();

    press('3', { code: 'Digit3', altKey: true });

    expect(picker.open()).toBeTrue();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    picker.open.set(false);
  }));

  it('switches to the assistant with the last quick action, asking what was already typed', fakeAsync(() => {
    open();
    press('4', { code: 'Digit4', metaKey: true });
    expect(action('ia').getAttribute('aria-pressed')).toBe('true');
    expect(field().placeholder).toBe('Pregunta sobre el portafolio…');

    action('ia').click();
    fixture.detectChanges();
    expect(action('ia').getAttribute('aria-pressed')).toBe('false');

    type('¿Qué arquitectura usa el backend?');
    action('ia').click();
    fixture.detectChanges();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    tick();
    expect(fixture.componentInstance.store.messages()[0].text).toBe('¿Qué arquitectura usa el backend?');
  }));

  it('ignores the digits without a modifier: they are text', fakeAsync(() => {
    open();

    expect(press('2', { code: 'Digit2' }).defaultPrevented).toBeFalse();
    expect(action('proyectos').getAttribute('aria-pressed')).toBe('false');
  }));

  it('closes with Escape or a click on the backdrop and returns the focus to the trigger', fakeAsync(() => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    open();
    type('redis');

    press('Escape');
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    element.querySelector<HTMLElement>('[data-testid="palette-backdrop"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  }));

  it('keeps the old panel, without search or quick actions, when the flag is off', fakeAsync(() => {
    fixture.componentInstance.palette.set(false);
    open();
    type('redis');

    expect(element.querySelector('[role="listbox"]')).toBeNull();
    expect(element.querySelector('[data-action]')).toBeNull();
    expect(field().getAttribute('role')).toBeNull();
    expect(field().placeholder).toBe('Pregunta sobre el portafolio…');
  }));
});
