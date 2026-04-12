const DEFAULT_MAX_STACK_SIZE = 50;

export class LocalStateCache<TEvent> {
  private undoStack: TEvent[] = [];
  private redoStack: TEvent[] = [];

  constructor(private maxStackSize: number = DEFAULT_MAX_STACK_SIZE) {
    this.maxStackSize = maxStackSize;
  }

  logEvent(event: TEvent) {
    this.undoStack.push(event);
    this.trimStack();

    this.redoStack = []; // clear redo stack on new event
  }

  peekUndo(): TEvent | undefined {
    const entry = this.undoStack[this.undoStack.length - 1];
    return entry;
  }

  popUndo(): TEvent | undefined {
    const event = this.undoStack.pop();
    if (event){ 
      this.redoStack.push(event);
      return event;
    }
    return undefined;
  }


  peekRedo(): TEvent | undefined {
    const entry = this.redoStack[this.redoStack.length - 1];
    return entry;
  }

  popRedo(): TEvent | undefined {
    const event = this.redoStack.pop();
    if (event) {
      this.redoStack.push(event);
      return event;
    }
    return undefined;
  }


  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get undo/redo state for UI
   */
  getUndoRedoState() {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
    };
  }

  private trimStack(): void {
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack = this.undoStack.slice(-this.maxStackSize);
    }
  }
}
