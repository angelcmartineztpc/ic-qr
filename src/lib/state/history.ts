import type { EditorSnapshot } from "./project";

const MAX_DEPTH = 100;

/**
 * Deshacer/rehacer del editor visual. Guarda instantáneas del diseño (posiciones,
 * plantilla y opciones del PDF) y NO de los datos de las piezas, que tienen su
 * propio [Deshacer] (borrados). Cada confirmación del usuario (soltar el ratón,
 * Enter, una flecha) es una sola entrada.
 */
export class EditorHistory {
  private past: EditorSnapshot[] = [];
  private future: EditorSnapshot[] = [];
  private readonly listeners = new Set<() => void>();

  /** Llamar con el estado ANTERIOR al cambio. */
  push(previous: EditorSnapshot): void {
    this.past.push(previous);
    if (this.past.length > MAX_DEPTH) this.past.shift();
    this.future = [];
    this.emit();
  }

  /** Devuelve lo que hay que restaurar y guarda `current` para rehacer. */
  undo(current: EditorSnapshot): EditorSnapshot | null {
    const target = this.past.pop();
    if (!target) return null;
    this.future.push(current);
    this.emit();
    return target;
  }

  redo(current: EditorSnapshot): EditorSnapshot | null {
    const target = this.future.pop();
    if (!target) return null;
    this.past.push(current);
    this.emit();
    return target;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.emit();
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
