import { describe, it, expect } from "bun:test";
import { StateMachine, State } from "../../channel/state";

describe("StateMachine", () => {
  it("starts in RUNNING state", () => {
    const sm = new StateMachine();
    expect(sm.current).toBe(State.RUNNING);
  });

  it("transitions RUNNING → SPEAKING", () => {
    const sm = new StateMachine();
    sm.transition(State.SPEAKING);
    expect(sm.current).toBe(State.SPEAKING);
  });

  it("transitions SPEAKING → LISTENING", () => {
    const sm = new StateMachine();
    sm.transition(State.SPEAKING);
    sm.transition(State.LISTENING);
    expect(sm.current).toBe(State.LISTENING);
  });

  it("transitions LISTENING → CAPTURING", () => {
    const sm = new StateMachine();
    sm.transition(State.SPEAKING);
    sm.transition(State.LISTENING);
    sm.transition(State.CAPTURING);
    expect(sm.current).toBe(State.CAPTURING);
  });

  it("blocks CAPTURING while SPEAKING", () => {
    const sm = new StateMachine();
    sm.transition(State.SPEAKING);
    expect(() => sm.transition(State.CAPTURING)).toThrow("Cannot CAPTURING while SPEAKING");
  });

  it("blocks SPEAKING while CAPTURING", () => {
    const sm = new StateMachine();
    sm.transition(State.SPEAKING);
    sm.transition(State.LISTENING);
    sm.transition(State.CAPTURING);
    expect(() => sm.transition(State.SPEAKING)).toThrow("Cannot SPEAKING while CAPTURING");
  });

  it("calls onTransition callback", () => {
    const transitions: State[] = [];
    const sm = new StateMachine((s) => transitions.push(s));
    sm.transition(State.SPEAKING);
    sm.transition(State.LISTENING);
    expect(transitions).toEqual([State.SPEAKING, State.LISTENING]);
  });
});
