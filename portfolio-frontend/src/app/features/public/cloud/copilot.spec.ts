import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AppliedAIRAGService, provideApi } from '../../../core/api';
import { mockApiInterceptor, resetMockApi } from '../../../core/mock/mock-api.interceptor';
import { ArchitectureCopilotComponent } from './architecture-copilot.component';
import { SERVICE_CATALOG } from './cloud-catalog.data';
import { CloudInfraComponent } from './cloud-infra.component';
import { CLOUD_NODES } from './cloud-topology.data';
import { CopilotAddition, additionName, additionsCost, cleanAdvice, mockCopilotAdvice } from './copilot';
import { referenceProject } from './studio-project';

describe('copilot advice', () => {
  it('keeps from the model only what has the expected shape and is in the catalog', () => {
    const advice = cleanAdvice({
      answer: '  Añade una cola.  ',
      extra: 'ignorado',
      recommendations: [
        {
          title: ' Desacopla\ncon una cola ', pros: ['a', 7, '', 'b'], cons: 'no es una lista', snippetLanguage: 'Terraform', snippet: ' resource {} ',
          additions: [
            { code: 'queue', name: 'ignorado', role: ' Reintentos ', connectFrom: 'api', onclick: 'x' },
            { code: 'no-existe' }, { code: 'custom', name: 'IPFS' }, { code: 'custom', name: '<img src=x onerror=alert(1)>' }, { code: 'custom' }, null,
          ],
        },
        { title: '', pros: ['sin título'] },
        { title: 'Con script', snippetLanguage: 'javascript', snippet: 'alert(1)', additions: 'no' },
        { title: 'Tercera' }, { title: 'Sobra' },
      ],
    }, SERVICE_CATALOG);

    expect(advice.answer).toBe('Añade una cola.');
    expect(advice.recommendations.map((item) => item.title)).toEqual(['Desacopla con una cola', 'Con script']);
    expect(advice.recommendations[0]).toEqual({
      title: 'Desacopla con una cola', pros: ['a', 'b'], cons: [], snippetLanguage: 'terraform', snippet: 'resource {}',
      additions: [{ code: 'queue', role: 'Reintentos', connectFrom: 'api' }, { code: 'custom', name: 'IPFS' }],
    });
    expect(advice.recommendations[1].snippet).toBeUndefined();
    expect(advice.recommendations[1].additions).toEqual([]);
    expect(cleanAdvice(null, SERVICE_CATALOG)).toEqual({ answer: '', recommendations: [] });
    expect(cleanAdvice('texto', SERVICE_CATALOG)).toEqual({ answer: '', recommendations: [] });
  });

  it('names the proposed pieces in the selected cloud and prices them from the catalog, never from the model', () => {
    const additions: CopilotAddition[] = [{ code: 'queue' }, { code: 'streaming' }, { code: 'custom', name: 'Polygon L2' }];

    expect(additions.map((addition) => additionName(addition, SERVICE_CATALOG, 'aws'))).toEqual(['SQS', 'MSK (Kafka)', 'Polygon L2']);
    expect(additionName(additions[0], SERVICE_CATALOG, 'azure')).toBe('Service Bus');
    expect(additionsCost(additions, SERVICE_CATALOG, 'aws')).toEqual({ usd: 71, unknown: 1 });
    expect(additionsCost(additions, SERVICE_CATALOG, 'azure')).toEqual({ usd: 32, unknown: 1 });
    // Los costes que sirve el backend mandan.
    expect(additionsCost(additions, SERVICE_CATALOG, 'aws', { queue: { aws: 9 } })).toEqual({ usd: 79, unknown: 1 });
    expect(additionsCost([], SERVICE_CATALOG, 'aws')).toEqual({ usd: 0, unknown: 0 });
  });

  it('simulates answers in demo mode that always pass its own validation', () => {
    for (const prompt of ['¿más resiliente?', 'optimiza los costes', 'añade Polygon e IPFS para web3', 'cualquier otra cosa']) {
      const mocked = mockCopilotAdvice(prompt, CLOUD_NODES);
      expect(cleanAdvice(mocked, SERVICE_CATALOG)).withContext(prompt).toEqual(mocked);
      expect(mocked.recommendations[0].pros.length).withContext(prompt).toBeGreaterThan(0);
      expect(mocked.recommendations[0].cons.length).withContext(prompt).toBeGreaterThan(0);
    }
    expect(mockCopilotAdvice('web3', CLOUD_NODES).recommendations[0].additions.map((addition) => addition.name)).toEqual(['Polygon L2', 'IPFS']);
    expect(mockCopilotAdvice('web3', CLOUD_NODES).recommendations[0].snippetLanguage).toBe('solidity');
    // Sin API en el lienzo no propone conectarse a ella; con Redis ya puesto no lo vuelve a proponer.
    expect(mockCopilotAdvice('resiliente', []).recommendations[0].additions[0].connectFrom).toBeUndefined();
    expect(mockCopilotAdvice('resiliente', CLOUD_NODES).recommendations.length).toBe(1);
    expect(mockCopilotAdvice('resiliente', []).recommendations.length).toBe(2);
  });
});

describe('ArchitectureCopilotComponent', () => {
  beforeEach(() => {
    resetMockApi();
    localStorage.removeItem('architecture-studio-project');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), provideApi(environment.apiBaseUrl)],
    });
  });
  afterEach(() => {
    document.querySelectorAll('[id^="root"]').forEach((element) => element.remove());
    localStorage.removeItem('architecture-studio-project');
  });

  function panel() {
    const fixture = TestBed.createComponent(ArchitectureCopilotComponent);
    fixture.componentRef.setInput('project', referenceProject());
    fixture.componentRef.setInput('catalog', SERVICE_CATALOG);
    const requests: CopilotAddition[][] = [];
    fixture.componentInstance.applied.subscribe(({ additions, done }) => {
      requests.push(additions);
      done(additions.length);
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const ask = (question: string) => {
      element.querySelector<HTMLTextAreaElement>('textarea')!.value = question;
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    };
    return { fixture, element, ask, requests };
  }

  it('sends the question with the diagram and shows the trade-offs, the cost impact and an example', fakeAsync(() => {
    const api = TestBed.inject(AppliedAIRAGService);
    const post = spyOn(api, 'aiArchitectureCopilotPost').and.callThrough();
    const { fixture, element, ask } = panel();
    expect(element.querySelectorAll('ul button').length).toBe(3);

    ask('¿Cómo hago esta arquitectura más resiliente?');
    expect(element.textContent).toContain('Analizando el diagrama');
    expect(element.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    const sent = post.calls.mostRecent().args[0];
    expect(sent.prompt).toBe('¿Cómo hago esta arquitectura más resiliente?');
    expect(sent.cloudProvider).toBe('aws');
    expect(sent.nodes.length).toBe(12);
    expect(sent.connections.length).toBe(8);

    tick(400);
    fixture.detectChanges();
    expect(element.querySelector('app-markdown strong')!.textContent).toBe('desacoplar');
    expect(element.querySelector('h5')!.textContent).toBe('Desacopla el trabajo lento con una cola');
    expect(element.textContent).toContain('Puntos fuertes');
    expect(element.textContent).toContain('Riesgos y costes');
    expect(element.querySelector('[data-finops]')!.textContent).toContain('≈ +$1/mes (estimación orientativa del catálogo)');
    expect(element.querySelector('figcaption')!.textContent).toContain('java · ejemplo ilustrativo, sin verificar');
    expect(element.querySelector('pre')!.textContent).toContain('@CircuitBreaker');
    expect(element.querySelector('[aria-label="Piezas que añadiría"]')!.textContent).toContain('+ SQS');
    expect(element.textContent).toContain('respuestas simuladas (modo demo)');
  }));

  it('applies a recommendation only when asked, once, and says what could not be priced', fakeAsync(() => {
    const { fixture, element, ask, requests } = panel();
    ask('Añade una capa L2 de Polygon e IPFS para Web3');
    tick(400);
    fixture.detectChanges();

    expect(requests).toEqual([]);
    expect(element.querySelector('[data-finops]')!.textContent).toContain('2 piezas fuera del catálogo, sin estimación');
    expect(element.textContent).toContain('fuera del catálogo');
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => candidate.textContent!.includes('Aplicar cambios al lienzo'))!;
    button.click();
    fixture.detectChanges();

    expect(requests.length).toBe(1);
    expect(requests[0].map((addition) => addition.name)).toEqual(['Polygon L2', 'IPFS']);
    expect(button.disabled).toBeTrue();
    expect(button.textContent).toContain('Aplicado · 2 piezas');
  }));

  it('explains a failure or a rate limit and ignores empty questions', fakeAsync(() => {
    const api = TestBed.inject(AppliedAIRAGService);
    const post = spyOn(api, 'aiArchitectureCopilotPost').and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 503, error: { detail: 'El motor de IA no está disponible' } })));
    const { fixture, element, ask } = panel();

    ask('   ');
    expect(post).not.toHaveBeenCalled();
    ask('¿Más resiliente?');
    tick();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')!.textContent).toContain('El copiloto no está disponible ahora: El motor de IA no está disponible');
    expect(element.querySelector('h5')).toBeNull();
  }));
});

describe('copilot in the studio', () => {
  beforeEach(() => {
    resetMockApi();
    localStorage.removeItem('architecture-studio-project');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor])), provideApi(environment.apiBaseUrl)],
    });
  });
  afterEach(() => {
    document.querySelectorAll('[id^="root"]').forEach((element) => element.remove());
    localStorage.removeItem('architecture-studio-project');
  });

  function studio() {
    const fixture = TestBed.createComponent(CloudInfraComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (text: string) => Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => candidate.textContent!.includes(text))!;
    return { fixture, element, component: fixture.componentInstance, button };
  }

  it('opens from the toolbar, closing the audit, and injects the suggested pieces into the canvas', fakeAsync(() => {
    const { fixture, element, component, button } = studio();
    tick(400);
    button('Auditar topología con IA').click();
    tick(400);
    fixture.detectChanges();
    button('Co-piloto IA').click();
    fixture.detectChanges();
    expect(element.querySelector('app-architecture-copilot')).not.toBeNull();
    expect(element.querySelector('app-audit-card')).toBeNull();

    button('¿Cómo hago esta arquitectura más resiliente?').click();
    tick(400);
    fixture.detectChanges();
    button('Aplicar cambios al lienzo').click();
    fixture.detectChanges();

    // La cola entra en su zona, con su icono oficial, cableada desde la API, y el coste lo recoge FinOps.
    const queue = component.nodes().find((node) => node.type === 'queue')!;
    expect(queue.zone).toBe('managed');
    expect(queue.role).toBe('Reintentos y trabajo diferido');
    expect(component.wires().some((wire) => wire.from === 'api' && wire.to === queue.id)).toBeTrue();
    expect(element.querySelector(`[data-node-id="${queue.id}"] image`)!.getAttribute('href')).toBe('cloud-icons/aws/sqs.svg');
    expect(element.querySelector('app-cost-badge button')!.textContent).toContain('$139');
    expect(component.mainTf()).toContain('resource "aws_sqs_queue"');
    expect(button('Aplicado · 1 pieza').disabled).toBeTrue();

    // Un solo paso de historial.
    element.querySelector<HTMLButtonElement>('button[aria-label="Deshacer"]')!.click();
    fixture.detectChanges();
    expect(component.nodes().length).toBe(12);
  }));

  it('adds technologies outside the catalog as external pieces without icon or Terraform, and ignores unknown codes', () => {
    const { component } = studio();

    const placed = component.applyAdditions([
      { code: 'custom', name: 'Polygon L2', role: 'Contratos', connectFrom: 'api' },
      { code: 'custom', name: 'IPFS', connectFrom: 'fantasma' },
      { code: 'no-existe' }, { code: 'custom' },
    ]);

    expect(placed).toBe(2);
    const [polygon, ipfs] = component.nodes().slice(-2);
    expect([polygon.type, polygon.zone, polygon.icon, polygon.terraform, polygon.service]).toEqual(['custom', 'external', null, null, 'Polygon L2']);
    expect(ipfs.role).toBe('Tecnología externa');
    expect([polygon.x, polygon.y]).not.toEqual([ipfs.x, ipfs.y]);
    expect(component.wires().some((wire) => wire.from === 'api' && wire.to === polygon.id)).toBeTrue();
    expect(component.wires().some((wire) => wire.to === ipfs.id)).toBeFalse();
    expect(component.mainTf()).toContain('Polygon L2, IPFS');
    expect(component.applyAdditions([{ code: 'no-existe' }])).toBe(0);
  });
});
