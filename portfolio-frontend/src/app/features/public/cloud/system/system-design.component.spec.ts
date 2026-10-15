import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SystemDesignBundle, SystemDesignRequest, SystemDesignService as SystemDesignApi } from '../../../../core/api';
import { CLOUD_LINKS, CLOUD_NODES, CloudNode } from '../cloud-topology.data';
import { SystemDesignComponent } from './system-design.component';
import { SystemDesign, defaultSystemDesign } from './system-design';

@Component({
    imports: [SystemDesignComponent],
    template: `<app-system-design [design]="design()" [nodes]="nodes()" [links]="links" provider="aws" [costUsd]="cost()" (changed)="design.set($event)" />`
})
class HostComponent {
  readonly design = signal<SystemDesign>(defaultSystemDesign());
  readonly nodes = signal<CloudNode[]>(structuredClone(CLOUD_NODES));
  readonly links = CLOUD_LINKS;
  readonly cost = signal<number | null>(138);
}

describe('SystemDesignComponent', () => {
  let requests: SystemDesignRequest[];
  let answer: () => ReturnType<SystemDesignApi['publicArchitectureSystemDesignGeneratePost']>;

  beforeEach(() => {
    requests = [];
    answer = () => of({ files: [], findings: [] } as SystemDesignBundle) as never;
    TestBed.configureTestingModule({
      providers: [{
        provide: SystemDesignApi,
        useValue: { publicArchitectureSystemDesignGeneratePost: (request: SystemDesignRequest) => { requests.push(request); return answer(); } },
      }],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    return { fixture, element, host: fixture.componentInstance };
  }

  const card = (element: HTMLElement, category: string) => element.querySelector<HTMLFieldSetElement>(`fieldset[data-category="${category}"]`)!;
  const radio = (element: HTMLElement, category: string, value: string) =>
    card(element, category).querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
  const flow = (element: HTMLElement) => Array.from(element.querySelectorAll('[data-testid="system-flow"] .app-piece'))
    .map((piece) => Array.from(piece.children).map((line) => line.textContent!.trim()).join(' '));
  const rules = (element: HTMLElement) => Array.from(element.querySelectorAll('[data-rule]')).map((item) => item.getAttribute('data-rule'));
  function pick(fixture: { detectChanges(): void }, input: HTMLInputElement) {
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }
  function select(fixture: { detectChanges(): void }, control: HTMLSelectElement | HTMLInputElement, value: string) {
    control.value = value;
    control.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('shows the nine categories with the current choice and the path of a request', () => {
    const { element } = create();

    expect(Array.from(element.querySelectorAll('fieldset[data-category]')).map((item) => item.getAttribute('data-category')))
      .toEqual(['client', 'backend', 'api', 'auth', 'database', 'cache', 'queue', 'bff', 'push']);
    expect(radio(element, 'backend', 'spring-boot').checked).toBeTrue();
    expect(radio(element, 'cache', '').checked).toBeTrue();
    expect(flow(element)).toEqual([
      'Cliente Web · SPA (Angular, React) sin desplegar',
      'Backend Java · Spring Boot sin desplegar',
      'Base de datos Relacional · PostgreSQL sin desplegar',
    ]);
    expect(element.textContent).toContain('REST →');
  });

  it('offers only the infrastructure pieces where each choice can be deployed', () => {
    const { element } = create();
    const options = (category: string) => Array.from(card(element, category).querySelectorAll('select option')).map((option) => option.textContent!.trim());

    expect(options('backend')).toEqual(['Sin desplegar', 'ECS Fargate']);
    expect(options('database')).toEqual(['Sin desplegar', 'RDS PostgreSQL']);
    expect(options('client')).toEqual(['Sin desplegar', 'S3 + CloudFront']);
    // Un contrato o algo que vive en el backend no se despliega: se dice por qué.
    expect(card(element, 'api').querySelector('select')).toBeNull();
    expect(card(element, 'auth').textContent).toContain('Vive dentro del backend');
  });

  it('deploys a piece on a node of the infrastructure and reminds what is still pending', () => {
    const { fixture, element, host } = create();
    expect(rules(element).filter((rule) => rule === 'deployment-pending').length).toBe(3);
    expect(element.querySelector('[data-testid="system-findings"]')!.textContent).toContain('3 avisos');

    select(fixture, card(element, 'backend').querySelector('select')!, 'api');
    select(fixture, card(element, 'database').querySelector('select')!, 'postgres');
    select(fixture, card(element, 'client').querySelector('select')!, 'static');

    expect(host.design().deployments).toEqual({ backend: 'api', database: 'postgres', client: 'static' });
    expect(flow(element)[1]).toBe('Backend Java · Spring Boot en ECS Fargate');
    expect(rules(element)).toEqual([]);
    expect(element.querySelector('[data-testid="system-findings"]')!.textContent).toContain('Sin avisos');

    select(fixture, card(element, 'backend').querySelector('select')!, '');
    expect(host.design().deployments.backend).toBeUndefined();
  });

  it('forgets the deployment when the choice changes, and adds or removes an optional piece', () => {
    const { fixture, element, host } = create();
    select(fixture, card(element, 'database').querySelector('select')!, 'postgres');

    pick(fixture, radio(element, 'database', 'document'));
    expect(host.design().choices.database).toBe('document');
    expect(host.design().deployments.database).toBeUndefined();
    // En la arquitectura de referencia no hay dónde poner una base de datos de documentos.
    expect(card(element, 'database').textContent).toContain('Añade a la infraestructura una pieza donde desplegarlo.');

    pick(fixture, radio(element, 'cache', 'redis'));
    expect(flow(element)).not.toContain(jasmine.stringMatching(/^Caché/));
    expect(element.querySelector('[aria-label="Piezas de apoyo"]')!.textContent).toContain('Redis');
    pick(fixture, radio(element, 'cache', ''));
    expect(host.design().choices.cache).toBeUndefined();
  });

  it('flags a piece whose node was removed or changed under it', () => {
    const { fixture, element, host } = create();
    host.design.set({ ...defaultSystemDesign(), deployments: { client: 'static', backend: 'api', database: 'postgres' } });
    host.nodes.update((nodes) => nodes.filter((node) => node.id !== 'postgres'));
    fixture.detectChanges();

    expect(rules(element)).toEqual(['deployment-missing']);
    expect(card(element, 'database').querySelector('[data-rule]')!.className).toContain('text-status-danger');
    expect(element.querySelector('[data-testid="system-findings"]')!.textContent).toContain('1 error');
  });

  it('checks the non-functional requirements as they are typed, with what to do', () => {
    const { fixture, element, host } = create();
    host.design.set({ ...defaultSystemDesign(), deployments: { client: 'static', backend: 'api', database: 'postgres' } });
    fixture.detectChanges();
    const nfr = (field: string) => element.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-nfr="${field}"]`)!;

    select(fixture, nfr('rps'), '800');
    expect(host.design().nfr.rps).toBe(800);
    expect(rules(element)).toEqual(['rps-cache']);
    expect(element.querySelector('[data-rule="rps-cache"]')!.textContent).toContain('Con 800 peticiones por segundo y sin caché');
    expect(element.querySelector('[data-rule="rps-cache"]')!.textContent).toContain('Elige una caché');

    select(fixture, nfr('availability'), '99.9');
    expect(host.design().nfr.availability).toBe(99.9);
    expect(rules(element)).toContain('availability-database');

    const pci = element.querySelector<HTMLInputElement>('[data-compliance="pci"]')!;
    pci.checked = true;
    pci.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.design().nfr.compliance).toEqual(['pci']);
    expect(rules(element)).toEqual(jasmine.arrayContaining(['pci-waf']));

    // El presupuesto se compara con el coste estimado del lienzo.
    select(fixture, nfr('budgetUsd'), '100');
    expect(element.querySelector('[data-rule="budget"]')!.textContent).toContain('≈ $138 al mes');
    // Vaciar un campo deja de pedirlo.
    select(fixture, nfr('rps'), '');
    expect(host.design().nfr.rps).toBeUndefined();
    expect(rules(element)).not.toContain('rps-cache');
    // Un valor fuera de rango es un error, no algo con lo que razonar.
    select(fixture, nfr('users'), '0');
    expect(element.querySelector('[data-rule="nfr-range"]')!.className).toContain('text-status-danger');
  });

  describe('generated files', () => {
    it('asks the backend for the files of the system as it is and shows them', () => {
      answer = () => of({
        files: [
          { path: 'main.tf', language: 'hcl', content: 'provider "aws" {}' },
          { path: 'openapi.yaml', language: 'yaml', content: 'openapi: 3.0.3' },
        ],
        findings: [],
      } as SystemDesignBundle) as never;
      const { fixture, element, host } = create();
      host.design.set({ ...defaultSystemDesign(), deployments: { backend: 'api' }, nfr: { rps: 800, compliance: [] } });
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="system-output"] .ui-btn-primary')!.click();
      fixture.detectChanges();

      expect(requests.length).toBe(1);
      expect(requests[0].cloudProvider).toBe('aws');
      expect(requests[0].system).toEqual(host.design());
      expect(requests[0].estimatedMonthlyCostUsd).toBe(138);
      expect(requests[0].nodes.length).toBe(CLOUD_NODES.length);
      const tabs = Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      expect(tabs.map((tab) => tab.textContent!.trim())).toEqual(['main.tf', 'openapi.yaml']);
      expect(element.querySelector('pre')!.textContent).toBe('provider "aws" {}');

      tabs[1].click();
      fixture.detectChanges();
      expect(element.querySelector('pre')!.textContent).toBe('openapi: 3.0.3');
      expect(element.querySelector('[data-testid="system-output"]')!.textContent).toContain('Esqueleto');
    });

    it('does not send a cost it does not have', () => {
      const { fixture, element, host } = create();
      host.cost.set(null);
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="system-output"] .ui-btn-primary')!.click();

      expect('estimatedMonthlyCostUsd' in requests[0]).toBeFalse();
    });

    it('says the contract is not generated for GraphQL or events', () => {
      const { fixture, element } = create();
      pick(fixture, radio(element, 'api', 'graphql'));

      expect(element.querySelector('[data-testid="system-output"]')!.textContent).toContain('no se genera para este estilo');
    });

    it('explains why there are no files when the server is not there, or is busy', () => {
      const { fixture, element } = create();
      const generate = () => {
        element.querySelector<HTMLButtonElement>('[data-testid="system-output"] .ui-btn-primary')!.click();
        fixture.detectChanges();
        return element.querySelector('[data-testid="system-output-error"]')!.textContent!;
      };

      answer = () => throwError(() => new HttpErrorResponse({ status: 404 })) as never;
      expect(generate()).toContain('en modo demo no se simula');
      answer = () => throwError(() => new HttpErrorResponse({ status: 429 })) as never;
      expect(generate()).toContain('Demasiadas peticiones');
      answer = () => throwError(() => new HttpErrorResponse({ status: 400 })) as never;
      expect(generate()).toContain('no acepta este diseño');
      expect(element.querySelector('[role="tab"]')).toBeNull();
    });
  });

  it('is read-only on a narrow screen', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    const { element } = create();

    expect(element.querySelector('[data-testid="system-readonly"]')!.textContent).toContain('solo lectura');
    expect(card(element, 'backend').disabled).toBeTrue();
    expect(element.querySelector<HTMLFieldSetElement>('[data-testid="system-nfr"]')!.disabled).toBeTrue();
  });

  describe('live diagram and design advisor', () => {
    const pieces = (element: HTMLElement) => Array.from(element.querySelectorAll('app-system-diagram g.piece')).map((piece) => piece.getAttribute('data-piece'));
    const edges = (element: HTMLElement) => Array.from(element.querySelectorAll('app-system-diagram g.edge')).map((item) => item.getAttribute('data-edge'));
    const dialog = () => document.querySelector<HTMLElement>('[data-testid="advisor-layer"] [role="dialog"]');

    afterEach(() => document.querySelectorAll('[data-testid="advisor-layer"]').forEach((layer) => layer.remove()));

    it('draws the chosen system and redraws it the moment a technology is picked', () => {
      const { fixture, element } = create();

      expect(pieces(element)).toEqual(['client', 'backend', 'auth', 'database']);
      expect(edges(element)).toEqual(['client-backend', 'backend-database', 'backend-auth']);
      expect(element.querySelector('app-system-diagram [data-piece="backend"] .piece-title')!.textContent).toBe('Spring Boot');

      pick(fixture, radio(element, 'cache', 'redis'));
      pick(fixture, radio(element, 'backend', 'go'));

      expect(pieces(element)).toContain('cache');
      expect(edges(element)).toContain('backend-cache');
      expect(element.querySelector('app-system-diagram [data-piece="backend"] .piece-title')!.textContent).toBe('Go');
      // El resumen en texto, que es lo que lee un lector de pantalla, sigue al día.
      expect(flow(element).join(' | ')).toContain('Go');
    });

    it('shows each technology with its logo and its name, the cloud icon where it is deployed, and the trademark notice', () => {
      const { fixture, element } = create();
      select(fixture, card(element, 'backend').querySelector('select')!, 'api');
      const backend = element.querySelector('app-system-diagram [data-piece="backend"]')!;

      expect(backend.querySelector('svg.logo')!.getAttribute('data-logo')).toBe('Spring Boot');
      expect(backend.querySelector('.piece-title')!.textContent).toBe('Spring Boot');
      expect(backend.querySelector('.piece-where')!.textContent).toBe('ECS Fargate');
      expect(backend.querySelector('image')!.getAttribute('href')).toContain('cloud-icons/aws/');
      expect(backend.getAttribute('aria-label')).toContain('Java · Spring Boot. Se despliega en ECS Fargate');
      expect(element.querySelector('app-system-diagram [data-piece="client"]')!.classList).toContain('piece-pending');
      // Los mismos logos acompañan a cada opción de la lista.
      expect(Array.from(card(element, 'client').querySelectorAll('label svg[data-logo]')).map((logo) => logo.getAttribute('data-logo')))
        .toEqual(['Angular', 'React', 'Swift', 'Kotlin', 'Flutter', 'React Native']);

      const notice = element.querySelector('[data-testid="trademark-notice"]')!.textContent!;
      expect(notice).toContain('marcas de sus respectivos dueños');
      expect(notice).toContain('Spring is a trademark of Broadcom');
      expect(notice).toContain('PostgreSQL Community Association of Canada');
      expect(notice).not.toContain('Redis is a registered trademark');
      pick(fixture, radio(element, 'cache', 'redis'));
      expect(element.querySelector('[data-testid="trademark-notice"]')!.textContent).toContain('Redis is a registered trademark of Redis Ltd.');
    });

    it('lights the path of the piece under the cursor and dims the rest', () => {
      const { fixture, element } = create();
      const database = element.querySelector<SVGGElement>('app-system-diagram [data-piece="database"]')!;

      database.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      expect(element.querySelector('app-system-diagram svg.system-diagram')!.classList).toContain('is-hovering');
      expect(Array.from(element.querySelectorAll('app-system-diagram g.edge.edge-lit')).map((edge) => edge.getAttribute('data-edge'))).toEqual(['backend-database']);
      expect(Array.from(element.querySelectorAll('app-system-diagram g.piece.piece-lit')).map((piece) => piece.getAttribute('data-piece'))).toEqual(['backend', 'database']);

      database.dispatchEvent(new MouseEvent('mouseleave'));
      fixture.detectChanges();
      expect(element.querySelector('app-system-diagram svg.system-diagram')!.classList).not.toContain('is-hovering');
    });

    it('takes you to the options of the piece you click in the diagram', () => {
      const { fixture, element } = create();
      document.body.appendChild(element);

      element.querySelector<SVGGElement>('app-system-diagram [data-piece="database"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();

      expect(card(element, 'database').classList).toContain('category-focused');
      expect(card(element, 'database').contains(document.activeElement)).toBeTrue();
      expect(element.querySelector('app-system-diagram [data-piece="database"]')!.classList).toContain('piece-active');
      element.remove();
    });

    it('keeps the verdict in view and applies the top advice with one click', () => {
      const { fixture, element, host } = create();
      select(fixture, card(element, 'backend').querySelector('select')!, 'api');

      expect(element.querySelector('[data-testid="advisor-verdict"]')!.textContent).toBe('Escala, pero con límites');
      expect(element.querySelector('[data-testid="advisor-top"]')!.textContent).toContain('Cada lectura llega a la base de datos');

      element.querySelector<HTMLButtonElement>('[data-testid="advisor-top-apply"]')!.click();
      fixture.detectChanges();

      expect(host.design().choices.cache).toBe('redis');
      expect(pieces(element)).toContain('cache');
      expect(element.querySelector('[data-testid="advisor-top"]')!.textContent).not.toContain('Cada lectura llega');
    });

    it('opens the advisor as a dialog that says what its advice is based on, and applies a suggestion from it', () => {
      const { fixture, element, host } = create();
      pick(fixture, radio(element, 'auth', 'session'));
      const open = element.querySelector<HTMLButtonElement>('[data-testid="advisor-open"]')!;

      expect(element.querySelector('[data-testid="advisor-verdict"]')!.textContent).toBe('Así no va a escalar');
      open.click();
      fixture.detectChanges();

      expect(open.getAttribute('aria-expanded')).toBe('true');
      expect(dialog()!.getAttribute('aria-modal')).toBe('true');
      expect(dialog()!.querySelector('[data-testid="advisor-headline"]')!.textContent).toBe('Así no va a escalar');
      expect(dialog()!.querySelectorAll('[data-dimension]').length).toBe(5);
      expect(dialog()!.querySelector('[data-dimension="scalability"]')!.getAttribute('data-level')).toBe('risk');
      expect(dialog()!.querySelector('[data-testid="advisor-basis"]')!.textContent).toContain('No es un modelo de IA');

      dialog()!.querySelector<HTMLButtonElement>('[data-apply="session-without-store"]')!.click();
      fixture.detectChanges();
      expect(host.design().choices.cache).toBe('redis');
      expect(dialog()!.querySelector('[data-advice="session-without-store"]')).toBeNull();

      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(dialog()).toBeNull();
    });
  });
});
