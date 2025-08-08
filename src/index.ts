import { State, effect } from "./State";
import { RegEl } from "./registry";
import _isEqual from "./equality";

export const register = (
	container?: HTMLElement | SVGElement | MathMLElement
) => {
	if (container) {
		return RegEl.register(container);
	} else {
		// Register all elements with data-mf-register attribute
		document.querySelectorAll("[data-mf-register]").forEach((element) => {
			RegEl.register(element as HTMLElement | SVGElement | MathMLElement);
		});
	}
};

export const state = <T>(value: T, name?: string): State<T> =>
	new State(value, name);
export const derived = <T>(deriveFn: () => T, name?: string): State<T> =>
	State.createComputed(deriveFn, name);

export { effect };
export { State };
