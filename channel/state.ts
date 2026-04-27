export enum State {
  RUNNING = "RUNNING",
  SPEAKING = "SPEAKING",
  LISTENING = "LISTENING",
  CAPTURING = "CAPTURING",
}

// Which transitions are blocked by current state
const GUARDS: Partial<Record<State, State[]>> = {
  [State.SPEAKING]: [State.CAPTURING],
  [State.CAPTURING]: [State.SPEAKING],
};

export class StateMachine {
  current: State = State.RUNNING;
  private onTransition?: (state: State) => void;

  constructor(onTransition?: (state: State) => void) {
    this.onTransition = onTransition;
  }

  transition(next: State): void {
    const blocked = GUARDS[this.current] ?? [];
    if (blocked.includes(next)) {
      throw new Error(`Cannot ${next} while ${this.current}`);
    }
    this.current = next;
    this.onTransition?.(next);
  }

  is(state: State): boolean {
    return this.current === state;
  }
}
