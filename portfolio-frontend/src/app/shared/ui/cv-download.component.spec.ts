import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CvDownloadComponent, CvPickerComponent, CvPickerService, cvPreviewUrl, cvUrl } from './cv-download.component';

@Component({
  standalone: true,
  imports: [CvDownloadComponent, CvPickerComponent],
  template: `<app-cv-download variant="nav" /><app-cv-download /><app-cv-picker />`,
})
class HostComponent {}

describe('CV download', () => {
  function create() {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const triggers = Array.from(element.querySelectorAll<HTMLButtonElement>('app-cv-download button'));
    const dialog = () => element.querySelector<HTMLElement>('[role="dialog"]');
    const open = (trigger = triggers[1]) => {
      trigger.click();
      fixture.detectChanges();
    };
    return { fixture, element, triggers, dialog, open, cards: () => Array.from(element.querySelectorAll<HTMLAnchorElement>('[role="dialog"] ul a')) };
  }

  afterEach(() => {
    TestBed.inject(CvPickerService).open.set(false);
    document.querySelectorAll('[id^="root"]').forEach((element) => element.remove());
  });

  it('opens one shared picker from any of the buttons, in the navigation bar or in the page', () => {
    const { triggers, dialog, open, fixture } = create();
    expect(triggers.map((trigger) => trigger.textContent!.trim())).toEqual(['CV', 'Descargar CV']);
    expect(triggers[0].getAttribute('aria-haspopup')).toBe('dialog');
    expect(dialog()).toBeNull();

    open(triggers[0]);
    expect(dialog()!.getAttribute('aria-modal')).toBe('true');
    expect(dialog()!.querySelector('h2')!.textContent).toBe('Descargar CV');

    TestBed.inject(CvPickerService).open.set(false);
    fixture.detectChanges();
    open(triggers[1]);
    expect(dialog()).not.toBeNull();
  });

  it('previews the four designed formats as cards with the real first page of each PDF', () => {
    const { open, cards } = create();
    open();

    expect(cards().map((card) => card.querySelectorAll('span')[1].textContent)).toEqual([
      'English · One-Pager', 'English · Full Dossier', 'Español · Resumen ejecutivo', 'Español · CV completo',
    ]);
    expect(cards().map((card) => card.querySelector('img')!.getAttribute('src'))).toEqual([
      'cv/cv-en-short.png', 'cv/cv-en-full.png', 'cv/cv-es-short.png', 'cv/cv-es-full.png',
    ]);
    // La miniatura es decorativa: el nombre accesible de la tarjeta dice qué se descarga.
    expect(cards()[2].querySelector('img')!.getAttribute('alt')).toBe('');
    expect(cards()[2].getAttribute('aria-label')).toBe('Descargar Español · Resumen ejecutivo en PDF');
    expect(cvPreviewUrl('es', 'ats')).toBe('cv/cv-es-ats.png');
  });

  it('links each format to its PDF: the exported copy in demo mode, the API otherwise', () => {
    const { open, cards, dialog } = create();
    open();

    // Los tests usan el entorno base, que está en modo demo.
    expect(cards().map((card) => card.getAttribute('href'))).toEqual(['cv/cv-en-short.pdf', 'cv/cv-en-full.pdf', 'cv/cv-es-short.pdf', 'cv/cv-es-full.pdf']);
    expect(cards()[3].getAttribute('download')).toBe('cv-es-full.pdf');
    expect(cards()[0].getAttribute('hreflang')).toBe('en');
    const ats = Array.from(dialog()!.querySelectorAll<HTMLAnchorElement>('div > a'));
    expect(ats.map((link) => link.getAttribute('href'))).toEqual(['cv/cv-en-ats.pdf', 'cv/cv-es-ats.pdf']);
    expect(dialog()!.textContent).toContain('Modo demo: se descargan las copias exportadas del CV.');

    const production = { mockMode: false, apiBaseUrl: 'https://api.example.test/v1' };
    expect(cvUrl('en', 'ats', true, production)).toBe('https://api.example.test/v1/public/cv/download?lang=en&type=ats');
    expect(cvUrl('es', 'full', true, production)).toBe('https://api.example.test/v1/public/cv/download?lang=es&type=full');
  });

  it('lets the visitor download the designed formats without the profile photo', () => {
    const { fixture, open, cards, dialog } = create();
    open();
    const toggle = dialog()!.querySelector<HTMLInputElement>('input[role="switch"]')!;
    expect(toggle.checked).toBeTrue();

    toggle.click();
    fixture.detectChanges();
    expect(cards().map((card) => card.getAttribute('href'))).toEqual([
      'cv/cv-en-short-nophoto.pdf', 'cv/cv-en-full-nophoto.pdf', 'cv/cv-es-short-nophoto.pdf', 'cv/cv-es-full-nophoto.pdf',
    ]);
    // La vista previa cambia con el interruptor; el nombre del archivo descargado, no.
    expect(cards()[0].querySelector('img')!.getAttribute('src')).toBe('cv/cv-en-short-nophoto.png');
    expect(cards()[0].getAttribute('download')).toBe('cv-en-short.pdf');
    expect(cards()[0].getAttribute('aria-label')).toBe('Descargar English · One-Pager en PDF, sin foto');
    // La versión ATS nunca lleva foto: no tiene variante.
    expect(Array.from(dialog()!.querySelectorAll<HTMLAnchorElement>('div > a')).map((link) => link.getAttribute('href')))
      .toEqual(['cv/cv-en-ats.pdf', 'cv/cv-es-ats.pdf']);

    const production = { mockMode: false, apiBaseUrl: 'https://api.example.test/v1' };
    expect(cvUrl('es', 'short', false, production)).toBe('https://api.example.test/v1/public/cv/download?lang=es&type=short&photo=false');
    expect(cvUrl('es', 'ats', false, production)).toBe('https://api.example.test/v1/public/cv/download?lang=es&type=ats');
    TestBed.inject(CvPickerService).withPhoto.set(true);
  });

  it('closes with its button, with Escape and by clicking outside, but not by clicking inside', () => {
    const { fixture, element, dialog, open } = create();
    const closedAfter = (action: () => void) => {
      open();
      action();
      fixture.detectChanges();
      return dialog() === null;
    };

    expect(closedAfter(() => dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')!.click())).toBeTrue();
    expect(closedAfter(() => dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))).toBeTrue();
    expect(closedAfter(() => element.querySelector<HTMLElement>('app-cv-picker > div')!.click())).toBeTrue();
    expect(closedAfter(() => dialog()!.querySelector('p')!.click())).toBeFalse();
  });
});
