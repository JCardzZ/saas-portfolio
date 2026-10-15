import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { SystemEventsService } from '../data/system-events.service';
import { IngestionSandboxComponent } from './ingestion-sandbox.component';

describe('IngestionSandboxComponent', () => {
  /** Crea el simulador y lo despliega (arranca plegado). */
  function create() {
    const fixture = TestBed.createComponent(IngestionSandboxComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('[data-testid="ingestion-toggle"]')!.click();
    fixture.detectChanges();
    return { fixture, element };
  }

  it('starts collapsed, showing only the three steps and a button to open the demo', () => {
    const fixture = TestBed.createComponent(IngestionSandboxComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('[data-testid="ingestion-toggle"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('pre')).toBeNull();
    expect(element.textContent).toContain('Vector 768D');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelectorAll('pre').length).toBeGreaterThan(1);
  });

  const button = (element: HTMLElement, text: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => candidate.textContent?.includes(text))!;

  it('opens already processed, with chunks, metadata and an embedding on screen', () => {
    const { element } = create();

    expect(element.querySelectorAll('pre').length).toBeGreaterThan(1);
    expect(element.textContent).toContain('default-tenant');
    expect(element.querySelectorAll('[role="img"] span').length).toBe(48);
  });

  it('walks through the three steps for free text and logs the ingestion', fakeAsync(() => {
    const { fixture, element } = create();
    const textarea = element.querySelector<HTMLTextAreaElement>('#ingestion-input')!;
    textarea.value = Array.from({ length: 14 }, (_, i) => `linea ${i + 1}`).join('\n');
    textarea.dispatchEvent(new Event('input'));

    button(element, 'Procesar ingesta').click();
    fixture.detectChanges();
    expect(element.querySelectorAll('pre').length).toBe(3);
    expect(element.textContent).toContain('líneas 7-12');
    expect(element.querySelector('dl')).toBeNull();

    tick(750);
    fixture.detectChanges();
    expect(element.querySelector('dl')?.textContent).toContain('sandbox/entrada.txt');
    expect(element.querySelector('[role="img"]')).toBeNull();

    tick(750);
    fixture.detectChanges();
    expect(element.querySelectorAll('[role="img"] span').length).toBe(48);

    const tags = TestBed.inject(SystemEventsService).events().map((event) => event.tag);
    expect(tags).toEqual(['ingest', 'embedDocuments', 'pgvector UPSERT']);
  }));

  it('shows the metadata of the chunk the visitor selects', () => {
    const { fixture, element } = create();

    element.querySelectorAll<HTMLButtonElement>('button[aria-pressed] pre')[1].closest('button')!.click();
    fixture.detectChanges();

    expect(element.querySelector('dl')?.textContent).toContain('chunk_index1');
  });

  it('cannot process an empty input', () => {
    const { fixture, element } = create();
    const textarea = element.querySelector<HTMLTextAreaElement>('#ingestion-input')!;
    textarea.value = '   ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(button(element, 'Procesar ingesta').disabled).toBeTrue();
  });
});
