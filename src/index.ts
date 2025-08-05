import { State, _effect } from "./State";
import { RegEl } from "./registry";
import _isEqual from "./equality";

const register = (container: HTMLElement | SVGElement | MathMLElement) =>
	RegEl.register(container);

// Classic State API (now using new reactive store internally)
const state = <T>(value: T, name?: string): State<T> => new State(value, name);
const derived = <T>(deriveFn: () => T, name?: string): State<T> =>
	State._createComputed(deriveFn, name);

export default {
	State,
	state,
	derived,
	effect: _effect,
	register,
};
