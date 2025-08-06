import { State, effect } from "./State";
import { RegEl } from "./registry";
import _isEqual from "./equality";

export const register = (container: HTMLElement | SVGElement | MathMLElement) =>
	RegEl.register(container);

export const state = <T>(value: T, name?: string): State<T> =>
	new State(value, name);
export const derived = <T>(deriveFn: () => T, name?: string): State<T> =>
	State.createComputed(deriveFn, name);

export { effect };
export { State };
