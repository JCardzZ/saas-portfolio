export const GENIE_DURATION_MS = 300;
export const GENIE_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)';

/**
 * Efecto «genio» de macOS: la ventana se encoge hacia un punto (primero pierde anchura, después
 * se escurre entera) o sale de él al revés. Anima solo `transform` y `opacity`, las dos
 * propiedades que el navegador compone en la GPU sin volver a pintar ni a maquetar; por eso no
 * deforma la silueta con `clip-path`, que obligaría a repintar en cada fotograma.
 *
 * @param target  punto de la pantalla hacia el que se minimiza; es el origen de la transformación
 * @param minimize `true` para encoger hacia el punto; `false` para desplegar desde él
 * @return la animación, o `null` si no se anima (movimiento reducido o navegador sin soporte)
 */
export function playGenie(element: HTMLElement, target: { x: number; y: number }, minimize: boolean): Animation | null {
  if (typeof element.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }
  element.style.transformOrigin = `${target.x - rect.left}px ${target.y - rect.top}px`;
  // Solo mientras dura: una capa de composición permanente gastaría memoria de vídeo para nada.
  element.style.willChange = 'transform, opacity';
  const animation = element.animate(GENIE_KEYFRAMES, {
    duration: GENIE_DURATION_MS, easing: GENIE_EASING, direction: minimize ? 'normal' : 'reverse', fill: 'both',
  });
  const cleanUp = () => {
    element.style.willChange = '';
    element.style.transformOrigin = '';
    if (!minimize) {
      animation.cancel();
    }
  };
  animation.finished.then(cleanUp, cleanUp);
  return animation;
}

/** De la ventana entera a un punto: se estrecha antes de lo que se aplasta, como al pasar por un embudo. */
export const GENIE_KEYFRAMES: Keyframe[] = [
  { offset: 0, transform: 'translate3d(0, 0, 0) scale(1, 1)', opacity: 1 },
  { offset: 0.4, transform: 'translate3d(0, 0, 0) scale(0.5, 0.8)', opacity: 1 },
  { offset: 1, transform: 'translate3d(0, 0, 0) scale(0.05, 0.03)', opacity: 0 },
];

/**
 * Copia inerte de un elemento, fija en el mismo sitio de la pantalla y en su propia capa de
 * composición, para animarla mientras el original desaparece. Quien la crea debe quitarla cuando acabe.
 */
export function ghostOf(element: HTMLElement): HTMLElement {
  const rect = element.getBoundingClientRect();
  const ghost = element.cloneNode(true) as HTMLElement;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.removeAttribute('role');
  ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  Object.assign(ghost.style, {
    position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, right: 'auto', bottom: 'auto',
    width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none', animation: 'none', zIndex: '47',
    // Capa de composición propia, y sin el desenfoque de fondo del original: recalcularlo en
    // cada fotograma es justo lo que haría dar tirones a la animación.
    transform: 'translateZ(0)', backfaceVisibility: 'hidden', backdropFilter: 'none', transition: 'none',
  });
  ghost.style.setProperty('-webkit-backdrop-filter', 'none');
  return ghost;
}
