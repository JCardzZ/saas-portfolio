/** Historial de deshacer y rehacer: guarda copias del estado anterior a cada cambio. */
export class History<T> {
  private readonly past: T[] = [];
  private readonly future: T[] = [];

  constructor(private readonly limit = 50) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Antes de un cambio: guarda el estado que se va a perder. Un cambio nuevo invalida lo rehacible. */
  record(before: T): void {
    this.past.push(structuredClone(before));
    if (this.past.length > this.limit) {
      this.past.shift();
    }
    this.future.length = 0;
  }

  /** @return el estado al que volver, o `null` si no hay nada que deshacer */
  undo(current: T): T | null {
    const previous = this.past.pop();
    if (previous === undefined) {
      return null;
    }
    this.future.push(structuredClone(current));
    return previous;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) {
      return null;
    }
    this.past.push(structuredClone(current));
    return next;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}
