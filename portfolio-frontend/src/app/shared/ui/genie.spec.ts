import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SystemEventsService } from '../../features/public/data/system-events.service';
import { TraceInspectorService } from '../../features/public/data/trace-inspector.service';
import { TraceInspectorComponent } from '../../features/public/widgets/trace-inspector.component';
import { GENIE_DURATION_MS, GENIE_EASING, GENIE_KEYFRAMES, ghostOf, playGenie } from './genie';

describe('genie effect', () => {
  function box(): HTMLElement {
    const element = document.createElement('div');
    Object.assign(element.style, { position: 'fixed', left: '100px', top: '50px', width: '400px', height: '200px' });
    element.innerHTML = '<p id="dentro" role="log">contenido</p>';
    document.body.appendChild(element);
    return element;
  }

  afterEach(() => document.querySelectorAll('body > div[style*="fixed"]').forEach((element) => element.remove()));

  it('is short and snappy, and narrows before it flattens, like going through a funnel', () => {
    expect(GENIE_DURATION_MS).toBeGreaterThanOrEqual(280);
    expect(GENIE_DURATION_MS).toBeLessThanOrEqual(320);
    expect(GENIE_EASING).toBe('cubic-bezier(0.25, 1, 0.5, 1)');
    expect(GENIE_KEYFRAMES.map((frame) => frame['transform'])).toEqual([
      'translate3d(0, 0, 0) scale(1, 1)', 'translate3d(0, 0, 0) scale(0.5, 0.8)', 'translate3d(0, 0, 0) scale(0.05, 0.03)',
    ]);
    // Nada que obligue a repintar: ni recortes ni filtros.
    expect(GENIE_KEYFRAMES.every((frame) => Object.keys(frame).sort().join() === 'offset,opacity,transform')).toBeTrue();
  });

  it('animates only compositor properties, converging on the target, and cleans up after itself', async () => {
    const element = box();

    const animation = playGenie(element, { x: 420, y: 230 }, true)!;

    expect(element.style.transformOrigin).toBe('320px 180px');
    expect(element.style.willChange).toBe('transform, opacity');
    const timing = animation.effect!.getComputedTiming();
    expect([timing.duration, timing.easing, timing.direction]).toEqual([GENIE_DURATION_MS, GENIE_EASING, 'normal']);
    expect(Object.keys((animation.effect as KeyframeEffect).getKeyframes()[0]).filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key)).sort())
      .toEqual(['opacity', 'transform']);

    animation.finish();
    await animation.finished;
    await Promise.resolve();
    expect(element.style.willChange).toBe('');
  });

  it('plays backwards to unfold from the target, leaving the window untouched at the end', async () => {
    const element = box();
    const animation = playGenie(element, { x: 420, y: 230 }, false)!;
    expect(animation.effect!.getComputedTiming().direction).toBe('reverse');

    animation.finish();
    await animation.finished.catch(() => undefined);
    await Promise.resolve();
    expect(element.getAnimations().length).toBe(0);
    expect(getComputedStyle(element).transform).toBe('none');
    expect(element.style.transformOrigin).toBe('');
  });

  it('does nothing for an element that is not on screen', () => {
    expect(playGenie(document.createElement('div'), { x: 0, y: 0 }, true)).toBeNull();
  });

  it('makes an inert copy pinned where the original was', () => {
    const ghost = ghostOf(box());

    expect([ghost.style.position, ghost.style.left, ghost.style.top, ghost.style.width, ghost.style.height]).toEqual(['fixed', '100px', '50px', '400px', '200px']);
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    expect(ghost.hasAttribute('inert')).toBeTrue();
    expect(ghost.style.pointerEvents).toBe('none');
    // En su propia capa de composición y sin el desenfoque de fondo del original.
    expect(ghost.style.transform).toBe('translateZ(0px)');
    expect(ghost.style.backfaceVisibility).toBe('hidden');
    expect(ghost.style.backdropFilter).toBe('none');
    // Sin ids duplicados en el documento.
    expect(ghost.querySelector('[id]')).toBeNull();
    expect(ghost.textContent).toBe('contenido');
  });
});

describe('TraceInspectorComponent genie minimisation', () => {
  const clearStorage = () => ['trace-inspector-mode', 'trace-inspector-height'].forEach((key) => localStorage.removeItem(key));
  const ghosts = () => Array.from(document.querySelectorAll<HTMLElement>('body > section[aria-hidden="true"]'));

  beforeEach(() => {
    clearStorage();
    // Otros tests minimizan sin dejar correr la animación: sus copias no deben contarse aquí.
    ghosts().forEach((ghost) => ghost.remove());
  });
  afterEach(() => {
    clearStorage();
    ghosts().forEach((ghost) => ghost.remove());
    document.querySelectorAll('[id^="root"]').forEach((element) => element.remove());
  });

  function open() {
    const fixture = TestBed.createComponent(TraceInspectorComponent);
    document.body.appendChild(fixture.nativeElement);
    const inspector = TestBed.inject(TraceInspectorService);
    inspector.viewportWidth.set(1280);
    TestBed.inject(SystemEventsService).emit('ok', 'CacheHit Redis', 'GET /public/projects');
    inspector.select('redis');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    // Como en la aplicación: tras cada cambio se ejecutan también los ganchos de después del render.
    const render = () => {
      fixture.detectChanges();
      TestBed.inject(ApplicationRef).tick();
    };
    return { fixture, element, inspector, render };
  }

  it('minimises at once, so the pill answers clicks while a copy of the window is sucked into it', async () => {
    const { element, inspector, render } = open();

    element.querySelector<HTMLButtonElement>('button[aria-label="Minimizar a píldora"]')!.click();
    render();

    // El estado ya es el minimizado: la píldora existe y se puede pulsar.
    expect(inspector.mode()).toBe('pill');
    const pill = element.querySelector<HTMLButtonElement>('[data-pill] button')!;
    expect(pill.textContent).toContain('Inspector de traza · Redis');
    expect(element.querySelector('section')).toBeNull();

    // Lo que se anima es una copia inerte, que no estorba a los clics.
    expect(ghosts().length).toBe(1);
    const [ghost] = ghosts();
    expect(ghost.hasAttribute('inert')).toBeTrue();
    expect(ghost.textContent).toContain('CacheHit Redis');
    const [animation] = ghost.getAnimations();
    expect(animation.effect!.getComputedTiming().direction).toBe('normal');
    // Converge hacia el centro de la píldora.
    const pillBox = element.querySelector('[data-pill]')!.getBoundingClientRect();
    const ghostBox = { left: parseFloat(ghost.style.left), top: parseFloat(ghost.style.top) };
    const [originX, originY] = ghost.style.transformOrigin.split(' ').map(parseFloat);
    expect(ghostBox.left + originX).toBeCloseTo(pillBox.left + pillBox.width / 2, 0);
    expect(ghostBox.top + originY).toBeCloseTo(pillBox.top + pillBox.height / 2, 0);

    animation.finish();
    await animation.finished;
    await Promise.resolve();
    expect(ghosts().length).toBe(0);
  });

  it('unfolds the window out of the pill when restored, and can be minimised again mid-way', async () => {
    const { element, inspector, render } = open();
    element.querySelector<HTMLButtonElement>('button[aria-label="Minimizar a píldora"]')!.click();
    render();
    ghosts().forEach((ghost) => ghost.getAnimations().forEach((animation) => animation.finish()));

    element.querySelector<HTMLButtonElement>('[data-pill] button')!.click();
    render();

    expect(inspector.mode()).toBe('bottom');
    const section = element.querySelector<HTMLElement>('section')!;
    const unfolding = section.getAnimations().find((animation) => animation.effect!.getComputedTiming().direction === 'reverse')!;
    expect(unfolding).toBeDefined();
    // La ventana ya es la de verdad: sus controles responden aunque siga desplegándose.
    element.querySelector<HTMLButtonElement>('button[aria-label="Minimizar a píldora"]')!.click();
    render();
    expect(inspector.mode()).toBe('pill');
    expect(element.querySelector('[data-pill] button')).not.toBeNull();
  });
});
