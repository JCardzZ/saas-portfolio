import { TestBed } from '@angular/core/testing';

import { IconPopService } from '../../../shared/ui/icon-pop.service';
import { SystemEventsService } from '../data/system-events.service';
import { TraceInspectorService } from '../data/trace-inspector.service';
import { ArchitectureCanvasComponent } from './architecture-canvas.component';
import { TraceInspectorComponent } from './trace-inspector.component';

describe('TraceInspectorComponent', () => {
  const clearStorage = () => ['trace-inspector-mode', 'trace-inspector-height'].forEach((key) => localStorage.removeItem(key));
  beforeEach(clearStorage);
  afterEach(clearStorage);

  describe('demo notice with the inspector closed', () => {
    const root = document.documentElement.style;
    function closed(viewportWidth: number, viewportHeight = 900) {
      const fixture = TestBed.createComponent(TraceInspectorComponent);
      const inspector = TestBed.inject(TraceInspectorService);
      inspector.viewportWidth.set(viewportWidth);
      inspector.viewportHeight.set(viewportHeight);
      inspector.close();
      fixture.detectChanges();
      return { fixture, element: fixture.nativeElement as HTMLElement };
    }

    it('is a segment of the inspector bar on a phone, docked at the bottom, and the page leaves it room', () => {
      const { element } = closed(440);
      const bar = element.querySelector<HTMLElement>('[data-demo-bar]')!;

      expect(bar).not.toBeNull();
      expect(element.querySelector('[data-demo-pill]')).toBeNull();
      expect(bar.textContent).toContain('Inspector de traza');
      expect(bar.querySelector('[data-testid="demo-notice"]')!.textContent).toContain('Modo demo');
      // De lado a lado y pegada abajo, sobre la zona segura: no flota encima del contenido.
      expect(bar.className).toContain('inset-x-0');
      expect(bar.className).toContain('bottom-0');
      expect(bar.className).toContain('pb-[env(safe-area-inset-bottom)]');
      expect(root.getPropertyValue('--dock-bottom')).toContain('2.25rem');
      expect(root.getPropertyValue('--dock-bottom')).toContain('safe-area-inset-bottom');
      expect(root.getPropertyValue('--pill-space')).toBe('0px');
    });

    it('is also the bar on a phone held sideways', () => {
      const { element } = closed(956, 440);
      expect(element.querySelector('[data-demo-bar]')).not.toBeNull();
    });

    it('stays as the corner pill where there is room', () => {
      const { element } = closed(1280);

      expect(element.querySelector('[data-demo-bar]')).toBeNull();
      expect(element.querySelector('[data-demo-pill]')).not.toBeNull();
      expect(root.getPropertyValue('--dock-bottom')).toBe('0px');
      expect(root.getPropertyValue('--pill-space')).not.toBe('0px');
    });

    it('gives the room back to the open inspector', () => {
      const { fixture, element } = closed(440);
      TestBed.inject(TraceInspectorService).select('redis');
      fixture.detectChanges();

      expect(element.querySelector('[data-demo-bar]')).toBeNull();
      expect(element.querySelector('section')!.dataset['layout']).toBe('sheet');
      expect(root.getPropertyValue('--dock-bottom')).not.toContain('2.25rem');
    });
  });

  describe('docking', () => {
    const root = document.documentElement.style;
    function open(viewportWidth = 1280) {
      const fixture = TestBed.createComponent(TraceInspectorComponent);
      const inspector = TestBed.inject(TraceInspectorService);
      inspector.viewportWidth.set(viewportWidth);
      // Alto de sobra: la ventana del runner es baja y, con poco alto, el panel pasa a ser una hoja.
      inspector.viewportHeight.set(900);
      inspector.select('redis');
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const press = (label: string) => {
        element.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`)!.click();
        fixture.detectChanges();
      };
      return { fixture, element, inspector, press, panel: () => element.querySelector<HTMLElement>('section') };
    }

    it('opens docked at the bottom and makes the page leave it room, so it never covers the diagram', () => {
      const { panel, press, fixture, inspector } = open();

      expect(panel()!.dataset['layout']).toBe('bottom');
      expect(panel()!.style.height).toBe('280px');
      expect(root.getPropertyValue('--dock-bottom')).toBe('280px');
      expect(root.getPropertyValue('--dock-right')).toBe('0px');

      press('Maximizar el inspector');
      expect(root.getPropertyValue('--dock-bottom')).toBe('50dvh');
      press('Restaurar la altura');
      expect(root.getPropertyValue('--dock-bottom')).toBe('280px');

      // Al cerrarlo la página recupera todo el espacio.
      inspector.close();
      fixture.detectChanges();
      expect(root.getPropertyValue('--dock-bottom')).toBe('0px');
    });

    it('docks to the right, narrowing the page instead of overlapping it', () => {
      const { panel, press, element } = open();
      press('Acoplar a la derecha');

      expect(panel()!.dataset['layout']).toBe('right');
      expect(panel()!.style.width).toBe('22rem');
      expect(root.getPropertyValue('--dock-right')).toBe('22rem');
      expect(root.getPropertyValue('--dock-bottom')).toBe('0px');
      expect(element.querySelector('button[aria-label="Acoplar a la derecha"]')!.getAttribute('aria-pressed')).toBe('true');
      expect(localStorage.getItem('trace-inspector-mode')).toBe('right');
    });

    it('floats without reserving space and can be dragged or moved with the keyboard, staying on screen', () => {
      const { panel, press, element, fixture } = open();
      press('Flotante');

      expect(panel()!.dataset['layout']).toBe('floating');
      expect(root.getPropertyValue('--dock-right')).toBe('0px');
      expect(root.getPropertyValue('--dock-bottom')).toBe('0px');
      const start = { x: parseFloat(panel()!.style.left), y: parseFloat(panel()!.style.top) };

      const header = element.querySelector('header')!;
      header.dispatchEvent(new PointerEvent('pointerdown', { clientX: start.x + 40, clientY: start.y + 10, bubbles: true }));
      header.dispatchEvent(new PointerEvent('pointermove', { clientX: start.x - 60, clientY: start.y - 40, bubbles: true }));
      header.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      fixture.detectChanges();
      expect([parseFloat(panel()!.style.left), parseFloat(panel()!.style.top)]).toEqual([start.x - 100, start.y - 50]);

      const handle = element.querySelector<HTMLButtonElement>('button[aria-label^="Mover el inspector"]')!;
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      fixture.detectChanges();
      expect(parseFloat(panel()!.style.left)).toBe(start.x - 76);

      // No se puede sacar de la ventana.
      for (let index = 0; index < 100; index++) {
        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      }
      fixture.detectChanges();
      expect(parseFloat(panel()!.style.top)).toBe(8);
    });

    it('minimises to a pill with the event count and restores to where it was', () => {
      const { panel, press, element, inspector, fixture } = open();
      TestBed.inject(SystemEventsService).emit('ok', 'CacheHit Redis', 'GET /public/projects');
      press('Acoplar a la derecha');
      press('Minimizar a píldora');

      expect(panel()).toBeNull();
      expect(root.getPropertyValue('--dock-right')).toBe('0px');
      const pill = element.querySelector<HTMLButtonElement>('button[aria-label^="Desplegar el inspector"]')!;
      expect(pill.textContent!.replace(/\s+/g, ' ').trim()).toBe('Inspector de traza · Redis (1 evento)');

      // Sigue la selección aunque esté minimizado.
      inspector.select('gemini');
      fixture.detectChanges();
      expect(element.querySelector('button[aria-label^="Desplegar el inspector"]')!.textContent).toContain('Inspector de traza · Google Gemini');

      press('Desplegar el inspector');
      expect(panel()!.dataset['layout']).toBe('right');
    });

    it('is also a bottom sheet on a phone held sideways: wide enough to dock, too short for it', () => {
      const { panel, inspector, fixture } = open(915);
      expect(panel()!.dataset['layout']).toBe('bottom');

      inspector.viewportHeight.set(412);
      fixture.detectChanges();

      expect(panel()!.dataset['layout']).toBe('sheet');
      expect(panel()!.style.height).toBe('38dvh');
    });

    it('becomes a bottom sheet on small screens, without a backdrop that would block the canvas', () => {
      const { panel, element, inspector, fixture, press } = open(390);

      expect(panel()!.dataset['layout']).toBe('sheet');
      expect(panel()!.style.height).toBe('38dvh');
      // La página gana ese espacio al final para poder desplazar el lienzo por encima de la hoja.
      expect(root.getPropertyValue('--dock-bottom')).toBe('38dvh');
      expect(element.querySelector('[aria-modal], .backdrop')).toBeNull();
      expect(element.querySelector('[aria-label="Posición del inspector"] button')).toBeNull();
      press('Maximizar el inspector');
      expect(root.getPropertyValue('--dock-bottom')).toBe('70dvh');
      press('Restaurar la altura');

      // Aunque el visitante hubiera elegido otra posición en escritorio.
      inspector.setMode('right');
      fixture.detectChanges();
      expect(panel()!.dataset['layout']).toBe('sheet');

      press('Minimizar a píldora');
      expect(panel()).toBeNull();
      expect(root.getPropertyValue('--dock-bottom')).toBe('0px');
    });

    it('keeps the three window controls, neutral until the header is hovered or one has focus', () => {
      const { element, press, panel, inspector } = open();
      const lights = Array.from(element.querySelectorAll<HTMLButtonElement>('header [aria-label="Ventana del inspector"] button'));
      expect(lights.map((light) => light.getAttribute('aria-label'))).toEqual([
        'Cerrar el inspector de traza', 'Minimizar a píldora', 'Maximizar el inspector',
      ]);
      const colours = () => lights.map((light) => getComputedStyle(light.querySelector('span')!).backgroundColor);
      expect(colours()).toEqual(['rgb(58, 63, 74)', 'rgb(58, 63, 74)', 'rgb(58, 63, 74)']);
      // El color de cada uno (rojo, ámbar, verde) llega por CSS al pasar el cursor por la cabecera o con foco.
      expect(lights.map((light) => light.querySelector('span')!.className)).toEqual(['traffic-close', 'traffic-minimize', 'traffic-maximize']);
      expect(getComputedStyle(element.querySelector('h3')!).fontFamily).toContain('monospace');

      // Desde flotante, el verde lo acopla abajo ya ampliado.
      press('Flotante');
      press('Maximizar el inspector');
      expect(panel()!.dataset['layout']).toBe('bottom');
      expect(root.getPropertyValue('--dock-bottom')).toBe('50dvh');

      press('Minimizar a píldora');
      expect(inspector.mode()).toBe('pill');
      press('Cerrar el inspector de traza');
      expect(inspector.selected()).toBeNull();
    });

    it('turns translucent while floating over a diagram in use and solid again when the console is hovered', () => {
      const { fixture, press, panel } = open();
      const card = document.createElement('div');
      card.className = 'theater-card';
      card.appendChild(document.createElement('span'));
      document.body.append(card);
      const over = (target: Element) => {
        target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
        fixture.detectChanges();
      };

      // Acoplada no tapa nada: no se atenúa.
      over(card.firstElementChild!);
      expect(panel()!.classList).not.toContain('inspector-dimmed');

      press('Flotante');
      over(card.firstElementChild!);
      expect(panel()!.classList).toContain('inspector-dimmed');
      expect(getComputedStyle(panel()!).backdropFilter).toBe('none');

      panel()!.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      expect(panel()!.classList).not.toContain('inspector-dimmed');

      panel()!.dispatchEvent(new MouseEvent('mouseleave'));
      over(document.body);
      expect(panel()!.classList).not.toContain('inspector-dimmed');
      card.remove();
    });

    describe('resizing the bottom dock', () => {
      const handle = (element: HTMLElement) => element.querySelector<HTMLElement>('[role="separator"]')!;
      function drag(fixture: { detectChanges(): void }, element: HTMLElement, fromY: number, toY: number) {
        const target = handle(element);
        target.dispatchEvent(new PointerEvent('pointerdown', { clientY: fromY, bubbles: true, cancelable: true }));
        target.dispatchEvent(new PointerEvent('pointermove', { clientY: toY, bubbles: true }));
        fixture.detectChanges();
      }
      const release = (fixture: { detectChanges(): void }, element: HTMLElement) => {
        handle(element).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        fixture.detectChanges();
      };

      it('follows the pointer in real time, and the page follows the panel', () => {
        const { fixture, element, panel } = open();
        expect(getComputedStyle(handle(element)).cursor).toBe('ns-resize');

        // Arrastrar hacia arriba agranda el panel.
        // (La ventana de los tests es baja: un arrastre corto para no topar con el máximo.)
        drag(fixture, element, 500, 470);
        expect(panel()!.style.height).toBe('310px');
        expect(root.getPropertyValue('--dock-bottom')).toBe('310px');
        // Mientras se arrastra, sin la transición con la que la página se acopla.
        expect(document.documentElement.classList).toContain('dock-resizing');
        expect(handle(element).classList).toContain('resizing');

        handle(element).dispatchEvent(new PointerEvent('pointermove', { clientY: 560, bubbles: true }));
        fixture.detectChanges();
        expect(root.getPropertyValue('--dock-bottom')).toBe('220px');

        release(fixture, element);
        expect(document.documentElement.classList).not.toContain('dock-resizing');
        expect(localStorage.getItem('trace-inspector-height')).toBe('220');
        // Suelto, el puntero ya no lo mueve.
        handle(element).dispatchEvent(new PointerEvent('pointermove', { clientY: 100, bubbles: true }));
        fixture.detectChanges();
        expect(panel()!.style.height).toBe('220px');
      });

      it('stays between 120 px and 80 % of the viewport, and resets to 280 px on double click', () => {
        const { fixture, element, panel } = open();
        const max = Math.round(window.innerHeight * 0.8);

        drag(fixture, element, 500, 5000);
        expect(panel()!.style.height).toBe('120px');
        handle(element).dispatchEvent(new PointerEvent('pointermove', { clientY: -5000, bubbles: true }));
        fixture.detectChanges();
        expect(panel()!.style.height).toBe(`${max}px`);
        release(fixture, element);
        expect(handle(element).getAttribute('aria-valuemin')).toBe('120');
        expect(handle(element).getAttribute('aria-valuemax')).toBe(String(max));
        expect(handle(element).getAttribute('aria-valuenow')).toBe(String(max));

        handle(element).dispatchEvent(new MouseEvent('dblclick'));
        fixture.detectChanges();
        expect(panel()!.style.height).toBe('280px');
        expect(localStorage.getItem('trace-inspector-height')).toBe('280');
      });

      it('can be resized with the keyboard and remembers the height on the next visit', () => {
        const first = open();
        const key = (name: string) => {
          handle(first.element).dispatchEvent(new KeyboardEvent('keydown', { key: name }));
          first.fixture.detectChanges();
        };
        key('ArrowUp');
        key('ArrowUp');
        expect(first.panel()!.style.height).toBe('328px');
        key('ArrowDown');
        expect(first.panel()!.style.height).toBe('304px');
        key('Home');
        expect(first.panel()!.style.height).toBe('120px');
        key('ArrowUp');
        first.fixture.destroy();

        const second = open();
        expect(second.panel()!.style.height).toBe('144px');
      });

      it('works together with the green button and only exists while docked at the bottom', () => {
        const { fixture, element, panel, press } = open();
        press('Maximizar el inspector');
        expect(root.getPropertyValue('--dock-bottom')).toBe('50dvh');

        // Arrastrar desde el estado ampliado parte de la altura que se ve y lo deja en píxeles.
        const shown = Math.round(window.innerHeight / 2);
        drag(fixture, element, 300, 320);
        release(fixture, element);
        expect(panel()!.style.height).toBe(`${shown - 20}px`);
        expect(element.querySelector('button[aria-label="Maximizar el inspector"]')).not.toBeNull();

        press('Acoplar a la derecha');
        expect(handle(element)).toBeNull();
        press('Flotante');
        expect(handle(element)).toBeNull();
      });
    });

    it('falls back to the bottom dock when there is no room to dock right', () => {
      const { panel, inspector, fixture } = open(800);
      inspector.setMode('right');
      fixture.detectChanges();
      expect(panel()!.dataset['layout']).toBe('bottom');

      inspector.viewportWidth.set(1280);
      inspector.viewportHeight.set(900);
      fixture.detectChanges();
      expect(panel()!.dataset['layout']).toBe('right');
    });
  });

  function create() {
    const fixture = TestBed.createComponent(TraceInspectorComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('stays hidden until a technology is selected', () => {
    expect(create().element.querySelector('section')).toBeNull();
  });

  it('opens with a neutral header that names the technology and lists only its events', () => {
    const { fixture, element } = create();
    const events = TestBed.inject(SystemEventsService);
    events.emit('ok', '200 OK CacheHit Redis', 'GET /public/projects · 1 ms');
    events.emit('ai', 'GeminiFlash 120 tokens/sec', 'generateContent');

    TestBed.inject(TraceInspectorService).select('redis');
    fixture.detectChanges();

    expect(element.querySelector('h3')?.textContent).toContain('Inspector de traza · Redis');
    expect(element.querySelector('h3')?.textContent).toContain('simulación');
    // La tecnología se indica con su icono y su nombre; la cabecera no se tiñe.
    expect(element.querySelector<HTMLElement>('header')!.style.background).toBe('');
    expect(element.querySelector('header app-tech-icon')).not.toBeNull();
    const lines = Array.from(element.querySelectorAll('[role="log"] p')).map((line) => line.textContent);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('[200 OK CacheHit Redis]');
    expect(lines[0]).toContain('GET /public/projects · 1 ms');
  });

  it('titles the window with the inspected piece and shows only its events plus those of the technology it hosts', () => {
    const { fixture, element } = create();
    const events = TestBed.inject(SystemEventsService);
    events.emit('ok', 'pgvector CosineDistance', 'evento de la plataforma');
    events.emitFromUser([['ok', 'Transaction Committed', 'UPSERT']], 'postgres');
    events.emitFromUser([['ok', 'Message Acked', 'de otro nodo']], 'rabbitmq-1');

    TestBed.inject(TraceInspectorService).inspectComponent({ id: 'postgres', label: 'RDS PostgreSQL', icon: 'awsRds', tech: 'postgresql' });
    fixture.detectChanges();

    expect(element.querySelector('h3')?.textContent).toContain('Inspector de traza · RDS PostgreSQL');
    expect(element.querySelector('header app-tech-icon img')!.getAttribute('src')).toBe('cloud-icons/aws/rds.svg');
    expect(Array.from(element.querySelectorAll('[role="log"] p')).map((line) => line.textContent)).toEqual([
      jasmine.stringContaining('[pgvector CosineDistance]'), jasmine.stringContaining('[Transaction Committed]'),
    ]);

    // Al inspeccionar una tecnología vuelve su nombre y deja de verse lo que era solo de un nodo.
    TestBed.inject(TraceInspectorService).select('postgresql');
    fixture.detectChanges();
    expect(element.querySelector('h3')?.textContent).toContain('Inspector de traza · PostgreSQL');
  });

  it('explains itself when the technology has no events yet, and can be closed', () => {
    const { fixture, element } = create();
    TestBed.inject(TraceInspectorService).select('jwt');
    fixture.detectChanges();

    expect(element.textContent).toContain('Aún no hay eventos de JSON Web Tokens');

    element.querySelector<HTMLButtonElement>('button[aria-label="Cerrar el inspector de traza"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('section')).toBeNull();
  });

  it('follows the node hovered in the architecture diagram', () => {
    const diagram = TestBed.createComponent(ArchitectureCanvasComponent);
    diagram.detectChanges();
    const inspector = TestBed.inject(TraceInspectorService);
    const node = (label: string) => Array.from((diagram.nativeElement as HTMLElement).querySelectorAll<SVGGElement>('g.node'))
      .find((candidate) => candidate.textContent?.includes(label))!;

    node('Redis').dispatchEvent(new MouseEvent('mouseenter'));
    expect(inspector.selected()).toBe('redis');

    node('Spring Boot 3').dispatchEvent(new MouseEvent('mouseenter'));
    expect(inspector.selected()).toBe('spring');
  });

  it('detaches the logo and opens its trace when a node is clicked', () => {
    const diagram = TestBed.createComponent(ArchitectureCanvasComponent);
    document.body.appendChild(diagram.nativeElement);
    diagram.detectChanges();
    const redis = Array.from((diagram.nativeElement as HTMLElement).querySelectorAll<SVGGElement>('g.node'))
      .find((candidate) => candidate.textContent?.includes('Redis'))!;
    const iconPop = TestBed.inject(IconPopService);

    redis.dispatchEvent(new MouseEvent('click'));

    expect(iconPop.current()?.icon.title).toBe('Redis');
    expect(redis.querySelector('.node-icon')!.classList).toContain('icon-detached');
    expect(TestBed.inject(TraceInspectorService).selected()).toBe('redis');

    iconPop.release();
    diagram.nativeElement.remove();
  });
});
