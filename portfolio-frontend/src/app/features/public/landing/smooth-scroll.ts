/**
 * Desplazamiento con inercia para la rueda del ratón y el trackpad: la página se desliza hacia su
 * destino con una curva suave en lugar de saltar. Solo con puntero fino y sin «reducir movimiento»;
 * en táctil manda el desplazamiento nativo, que ya es suave. No toca nada que tenga su propio
 * desplazamiento (paneles, diálogos, lienzos con zoom), ni Ctrl/⌘ + rueda (zoom del navegador),
 * ni el teclado, las anclas o la barra de desplazamiento: si la página se mueve por otra vía, la
 * inercia se reajusta a esa posición.
 *
 * Además, «la manita»: con el ratón, el fondo de la página (no las tarjetas, textos ni controles)
 * se puede agarrar y arrastrar para desplazarse, y al soltar sigue con la inercia del gesto.
 */
export function startSmoothScroll(): () => void {
  const fine = matchMedia('(pointer: fine)').matches;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || still) return () => undefined;

  let target = scrollY;
  let current = scrollY;
  let raf = 0;
  let animating = false;

  const max = () => document.documentElement.scrollHeight - innerHeight;

  const scrollsItself = (start: EventTarget | null, deltaY: number): boolean => {
    for (let el = start as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
      if (el.closest?.('[role="dialog"], [data-no-smooth-scroll], canvas, svg, input, textarea, select')) return true;
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return true;
      }
    }
    return document.body.style.overflow === 'hidden';
  };

  const step = () => {
    current += (target - current) * 0.11;
    if (Math.abs(target - current) < 0.5) current = target;
    animating = true;
    scrollTo(0, current);
    animating = false;
    raf = current === target ? 0 : requestAnimationFrame(step);
  };

  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (scrollsItself(event.target, event.deltaY)) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? innerHeight : 1;
    if (!raf) current = scrollY;
    target = Math.max(0, Math.min(max(), target + event.deltaY * unit));
    if (!raf) raf = requestAnimationFrame(step);
  };

  // Teclado, anclas, barra de desplazamiento: se adopta su posición.
  const onScroll = () => {
    if (!animating && !raf) target = current = scrollY;
  };

  // ---- La manita --------------------------------------------------------------------------
  let drag: { y: number; lastY: number; lastT: number; velocity: number } | null = null;
  const isBackground = (target: EventTarget | null): boolean =>
    target instanceof Element && target.matches(BACKGROUND);
  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !isBackground(event.target)) return;
    event.preventDefault(); // sin selección de texto al arrastrar
    cancelAnimationFrame(raf);
    raf = 0;
    target = current = scrollY;
    drag = { y: event.clientY, lastY: event.clientY, lastT: performance.now(), velocity: 0 };
    document.documentElement.classList.add('page-grabbing');
  };
  const onMove = (event: PointerEvent) => {
    if (!drag) return;
    const now = performance.now();
    const dy = event.clientY - drag.lastY;
    drag.velocity = drag.velocity * 0.6 + (dy / Math.max(1, now - drag.lastT)) * 0.4;
    drag.lastY = event.clientY;
    drag.lastT = now;
    current = target = Math.max(0, Math.min(max(), current - dy));
    animating = true;
    scrollTo(0, current);
    animating = false;
  };
  const onUp = () => {
    if (!drag) return;
    // Al soltar, sigue con la inercia del gesto (px/ms × 280 ms aprox.).
    target = Math.max(0, Math.min(max(), current - drag.velocity * 280));
    drag = null;
    document.documentElement.classList.remove('page-grabbing');
    if (!raf) raf = requestAnimationFrame(step);
  };

  addEventListener('wheel', onWheel, { passive: false });
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  document.documentElement.classList.add('page-grab');
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener('wheel', onWheel);
    removeEventListener('scroll', onScroll);
    removeEventListener('pointerdown', onDown);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    document.documentElement.classList.remove('page-grab', 'page-grabbing');
  };
}

/** El «fondo» de la página: contenedores sin contenido propio (no tarjetas, textos ni controles). */
const BACKGROUND = '.dock-aware, .dock-aware > main, main > section, .bento-grid, main > section > div, app-galaxy-backdrop';
