import { evaluateExpression } from "./expression-parser";
import { State } from "./State";

type RegisterableEl = HTMLElement | SVGElement | MathMLElement;
type Props = Record<string, unknown>;
export type CtxFunction = (props?: Props) => unknown;

export class RegEl {
	static #registry = new WeakMap<Element, RegEl>();
	#element: RegisterableEl;
	public props: Props = {};

	static register(element: RegisterableEl) {
		return RegEl.#registry.get(element) ?? new RegEl(element);
	}

	constructor(element: RegisterableEl) {
		this.#element = element;

		// Traverse ancestors to find inherited props
		let parent = this.#element.parentElement;
		while (parent) {
			const rl = RegEl.#registry.get(parent);
			if (!rl) break;
			Object.assign(this.props, rl.props);
			parent = parent.parentElement;
		}

		// Process attributes
		const pendingEffects: (() => void)[] = [];

		for (const attr of element.attributes) {
			if (!attr.value.startsWith("${")) continue;

			const parts = attr.value.split(">>");
			const isEventHandler = attr.name.startsWith("on");
			let bindFn: CtxFunction | undefined;
			let syncFn: CtxFunction | undefined;

			// Process bind and sync expressions
			for (const [i, part] of parts.entries()) {
				const { fn, _stateRefs } = evaluateExpression(
					part.slice(2, -1)
				); // Remove ${ and }

				if (fn) {
					if (i === 0) bindFn = fn;
					else syncFn = fn;
				}

				for (const { name, state } of _stateRefs) {
					this.props[name] ??= state;
				}
			}

			// Create effects
			if (bindFn) {
				const bindState = State._createComputed(() =>
					bindFn!(this.props)
				);
				pendingEffects.push(() => {
					bindState.effect(() => {
						this.#setProp(attr.name, bindState.value);
						syncFn?.(this.props);
					});
				});
			}

			if (isEventHandler && syncFn) {
				element.removeAttribute(attr.name);
				element.addEventListener(attr.name.slice(2), () =>
					syncFn!(this.props)
				);
			}
		}

		for (const effect of pendingEffects) effect();
		this.#traverseNodes(element);
		RegEl.#registry.set(element, this);
	}

	#setProp = (prop: string, value: unknown) => {
		if (prop in this.#element) (this.#element as any)[prop] = value;
		else this.#element.setAttribute(prop, String(value ?? ""));
	};

	#traverseNodes(node: Node) {
		const stack = [node];

		while (stack.length) {
			const current = stack.pop()!;

			if (current.nodeType === Node.ELEMENT_NODE) {
				const element = current as HTMLElement;

				if (element.hasAttribute("data-mf-ignore")) continue;

				// Check for binding attributes
				let hasBinding = false;
				for (const attr of element.attributes) {
					if (attr.value.startsWith("${")) {
						hasBinding = true;
						break;
					}
				}

				if (hasBinding) {
					new RegEl(element);
					continue;
				}

				// Add children to stack (in reverse order to maintain traversal order)
				for (let i = element.childNodes.length - 1; i >= 0; i--) {
					stack.push(element.childNodes[i]!);
				}
			} else if (current.nodeType === Node.TEXT_NODE) {
				this.#processTextNode(current as Text);
			} else {
				for (let i = current.childNodes.length - 1; i >= 0; i--) {
					stack.push(current.childNodes[i]!);
				}
			}
		}
	}

	#processTextNode(textNode: Text) {
		const originalText = textNode.textContent || "";
		const expressions: Array<[string, State<unknown>]> = [];

		let match;
		while ((match = /\$\{[^}]*\}/g.exec(originalText))) {
			const { _stateRefs, fn } = evaluateExpression(
				match[0].slice(2, -1)
			);

			for (const { name, state } of _stateRefs) {
				this.props[name] ??= state;
			}

			if (fn) {
				const state = State._createComputed(() => fn(this.props));
				expressions.push([match[0], state]);
			}
		}

		if (expressions.length) {
			for (const [, state] of expressions) {
				state.effect(() => {
					let newText = originalText;
					for (const [matchStr, state] of expressions) {
						newText = newText.replaceAll(
							matchStr,
							`${state.value}`
						);
					}
					textNode.textContent = newText;
				});
			}
		}
	}
}
