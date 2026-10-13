import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CLOUD_LINKS, CLOUD_NODES, CloudProviderId } from './cloud-topology.data';
import { CardContext, ServiceCard, buildServiceCard } from './service-card';
import { SHEET_DISMISS_PX, ServiceInfoCardComponent } from './service-info-card.component';
import { BASE_ZONES, placed } from './studio-project';

describe('ServiceInfoCardComponent', () => {
  let fixture: ComponentFixture<ServiceInfoCardComponent>;
  let element: HTMLElement;

  function cardFor(id: string, provider: CloudProviderId, extra: Partial<CardContext> = {}): ServiceCard {
    const nodes = [...structuredClone(CLOUD_NODES), placed('workflow', 'wf', 880, 300)];
    return buildServiceCard(nodes.find((node) => node.id === id)!, {
      nodes, links: structuredClone(CLOUD_LINKS), zones: structuredClone(BASE_ZONES), provider, providers: ['aws', 'gcp', 'azure', 'oci'], ...extra,
    });
  }

  function show(card: ServiceCard, variant: 'popover' | 'sheet' = 'popover'): void {
    fixture = TestBed.createComponent(ServiceInfoCardComponent);
    fixture.componentRef.setInput('card', card);
    fixture.componentRef.setInput('variant', variant);
    fixture.detectChanges();
    element = fixture.nativeElement;
  }

  const text = (): string => element.textContent!.replace(/\s+/g, ' ');

  it('is a dialog titled with the node name and shows the official name below', () => {
    show(cardFor('postgres', 'aws'));
    const dialog = element.querySelector('[role="dialog"]')!;
    const title = element.querySelector('h3')!;

    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(title.textContent).toBe('RDS PostgreSQL');
    expect(text()).toContain('Amazon RDS for PostgreSQL');
    // Anclada junto al nodo no es modal: el diagrama sigue disponible.
    expect(dialog.getAttribute('aria-modal')).toBeNull();
  });

  it('shows what it is, what it is used for, its place in the diagram and its cost label', () => {
    show(cardFor('api', 'gcp', { costs: new Map([['api', { label: '$32/mes', live: false }]]) }));

    expect(text()).toContain('Qué esEjecuta contenedores sin que tengas que crear ni mantener las máquinas donde corren.');
    expect(element.querySelectorAll('ul.list-disc li').length).toBe(2);
    expect(text()).toContain('Recibe deCloud Load Balancing');
    expect(text()).toContain('Envía aCloud SQL, Memorystore, Gemini API');
    expect(text()).toContain('ZonaSubred privada · aplicación');
    expect(text()).toContain('$32/mes');
    expect(element.querySelector('[data-testid="card-cost-tag"]')!.textContent).toBe('Cifra orientativa');
  });

  it('marks a list price and a missing estimate differently', () => {
    show(cardFor('postgres', 'azure', { costs: new Map([['postgres', { label: '$13/mes', live: true }]]) }));
    expect(element.querySelector('[data-testid="card-cost-tag"]')!.textContent).toBe('Precio de lista');

    show(cardFor('users', 'azure'));
    expect(element.querySelector('[data-testid="card-cost-tag"]')!.textContent).toBe('Sin estimación');
    expect(text()).toContain('Recibe deNadie');
  });

  it('links to the official documentation in a new tab', () => {
    show(cardFor('postgres', 'oci'));
    const link = element.querySelector<HTMLAnchorElement>('footer a')!;

    expect(link.href).toBe('https://docs.oracle.com/en-us/iaas/Content/postgresql/home.htm');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(link.textContent).toContain('docs.oracle.com');
  });

  it('offers the other clouds as chips and tells which one was chosen', () => {
    show(cardFor('postgres', 'aws'));
    const chosen: CloudProviderId[] = [];
    fixture.componentInstance.providerChosen.subscribe((provider) => chosen.push(provider));
    const chips = Array.from(element.querySelectorAll<HTMLButtonElement>('[data-provider]'));

    expect(chips.map((chip) => chip.dataset['provider'])).toEqual(['gcp', 'azure', 'oci']);
    expect(Array.from(chips[0].querySelectorAll('span')).map((span) => span.textContent)).toEqual(['GCP', 'Cloud SQL for PostgreSQL']);
    chips[1].click();
    expect(chosen).toEqual(['azure']);
  });

  it('warns when the active cloud has no direct equivalent and marks the chips of the clouds that lack one', () => {
    show(cardFor('wf', 'oci'));
    expect(element.querySelector('[data-testid="card-no-equivalent"]')!.textContent).toContain('Sin equivalente directo');

    show(cardFor('wf', 'aws'));
    expect(element.querySelector('[data-testid="card-no-equivalent"]')).toBeNull();
    expect(element.querySelector('[data-provider="oci"]')!.getAttribute('aria-label')).toContain('sin equivalente directo');
    expect(element.querySelector('[data-provider="gcp"]')!.getAttribute('aria-label')).not.toContain('sin equivalente');
  });

  it('lists the graph warnings of the node', () => {
    show(cardFor('postgres', 'aws', { warnings: new Map([['postgres', ['La base de datos queda expuesta']]]) }));

    expect(element.querySelector('[data-testid="card-warnings"]')!.textContent).toContain('La base de datos queda expuesta');
  });

  it('says a cloud-agnostic product is the same everywhere instead of offering chips', () => {
    show(cardFor('edge', 'aws'));

    expect(element.querySelector('[data-provider]')).toBeNull();
    expect(text()).toContain('Es el mismo producto en cualquier nube.');
  });

  it('closes with its button and with Escape', () => {
    show(cardFor('postgres', 'aws'));
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    element.querySelector<HTMLButtonElement>('[data-testid="card-close"]')!.click();
    element.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(closed).toBe(2);
  });

  it('points its arrow at the node on the side it was placed', () => {
    show(cardFor('postgres', 'aws'));
    fixture.componentRef.setInput('side', 'left');
    fixture.componentRef.setInput('arrow', 120);
    fixture.detectChanges();
    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;

    expect(dialog.dataset['side']).toBe('left');
    expect(dialog.style.getPropertyValue('--arrow')).toBe('120px');
    expect(element.querySelector('.service-card-arrow')).not.toBeNull();
  });

  it('as a bottom sheet is modal, has no arrow and closes when dragged down far enough', () => {
    show(cardFor('postgres', 'aws'), 'sheet');
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    const handle = element.querySelector<HTMLElement>('[data-testid="sheet-handle"]')!;
    const drag = (distance: number): void => {
      handle.dispatchEvent(new PointerEvent('pointerdown', { clientY: 400, pointerId: 1, bubbles: true }));
      handle.dispatchEvent(new PointerEvent('pointermove', { clientY: 400 + distance, pointerId: 1, bubbles: true }));
      handle.dispatchEvent(new PointerEvent('pointerup', { clientY: 400 + distance, pointerId: 1, bubbles: true }));
    };

    expect(element.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    expect(element.querySelector('.service-card-arrow')).toBeNull();

    drag(SHEET_DISMISS_PX - 10);
    expect(closed).withContext('un arrastre corto no la cierra').toBe(0);
    expect(element.style.transform).withContext('vuelve a su sitio').toBe('');

    drag(SHEET_DISMISS_PX + 10);
    expect(closed).toBe(1);
  });
});
