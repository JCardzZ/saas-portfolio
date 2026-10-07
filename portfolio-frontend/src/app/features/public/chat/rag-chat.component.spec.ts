import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { provideApi } from '../../../core/api';
import { MOCK_LATENCY_MS, mockApiInterceptor, resetMockApi } from '../../../core/mock/mock-api.interceptor';
import { RagChatComponent } from './rag-chat.component';

/** Recorre el chat de punta a punta en el DOM, con la API simulada del modo demo. */
describe('RagChatComponent', () => {
  let fixture: ComponentFixture<RagChatComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    resetMockApi();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), provideApi(environment.apiBaseUrl)],
    });
    fixture = TestBed.createComponent(RagChatComponent);
    element = fixture.nativeElement;
    document.body.appendChild(element);
  });

  afterEach(() => element.remove());

  function open(): void {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    tick();
  }

  function ask(question: string): void {
    const input = element.querySelector<HTMLInputElement>('#rag-prompt')!;
    input.value = question;
    input.dispatchEvent(new Event('input'));
    const submit = new Event('submit', { cancelable: true });
    element.querySelector('form')!.dispatchEvent(submit);
    expect(submit.defaultPrevented).withContext('el envío no debe recargar la página').toBeTrue();
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

  it('keeps Tab inside the dialog, wrapping in both directions', fakeAsync(() => {
    open();
    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('input, button'));
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
