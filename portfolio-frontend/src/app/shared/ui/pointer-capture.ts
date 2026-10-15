/**
 * Captura el puntero sin romper el gesto si no se puede (puntero ya liberado, eventos sintéticos de
 * pruebas o navegadores que lo rechazan): la captura solo mejora el arrastre, no es imprescindible.
 */
export function capturePointer(target: EventTarget | null, pointerId: number): void {
  try {
    (target as Element | null)?.setPointerCapture?.(pointerId);
  } catch {
    // Sin captura, el arrastre sigue funcionando mientras el puntero esté sobre el elemento.
  }
}
