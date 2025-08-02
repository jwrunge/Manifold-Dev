import { State, computed } from "./State";
import { MANIFOLD_ATTRIBUTES, RegEl } from "./registry-interpolation";

export { State, computed };
export { RegEl } from "./registry-interpolation";

const init = (
	container: HTMLElement | SVGElement | MathMLElement | Document = document
) => {
	// Find all elements with data attributes
	for (const el of Array.from(
		container.querySelectorAll(
			MANIFOLD_ATTRIBUTES.map((attr) => `[data-${attr}]`).join(", ")
		)
	))
		RegEl.register(el as HTMLElement | SVGElement | MathMLElement);
};

// Factory function for creating reactive state
function watch<T>(deriveFn: () => T): State<T>;
function watch<T>(value: T): State<T>;
function watch<T>(value: T | (() => T)): State<T> {
	if (typeof value === "function") {
		return computed(value as () => T);
	}
	return new State(value as T);
}

export default {
	State,
	watch,
	init,
};
