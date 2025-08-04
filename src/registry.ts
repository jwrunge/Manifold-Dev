import { evaluateExpression, ExpressionResult } from "./expression-parser";
import { State } from "./State";

type RegisterableEl = HTMLElement | SVGElement | MathMLElement;
type Props = Record<string, unknown>;
export type CtxFunction = (props?: Props) => unknown;

export class RegEl {
	private static _registry = new WeakMap<Element, RegEl>();
	public props: Props = {};

	static register(element: RegisterableEl) {
		const rl = RegEl._registry.get(element);
		if (rl) return rl;
		return new RegEl(element);
	}

	constructor(private _element: RegisterableEl) {
		const exps = new Map<
			Attr,
			{
				bind?: CtxFunction;
				sync?: CtxFunction;
				isEventHandler?: boolean;
				isNodeEditor?: boolean;
			}
		>();

		// Traverse ancestors to find inherited props
		let parent = _element.parentElement;
		while (parent) {
			const rl = RegEl._registry.get(parent);
			if (!rl) break;

			for (const [key, state] of Object.entries(rl.props))
				this.props[key] = state;
			parent = parent.parentElement;
		}

		// Loop through attributes to set bind/sync
		for (const attr of Array.from(_element.attributes)) {
			if (!attr.value.startsWith("${")) {
				const [bindResult, syncResult] =
					_element
						.getAttribute(attr.name)
						?.split(">>")
						.map((val) =>
							evaluateExpression(
								val.replaceAll(/(^\$\{|\}$)/g, "")
							)
						) ?? [];

				for (const [sync, { fn, stateRefs }] of [
					[false, bindResult ?? {}] as [
						boolean,
						Partial<ExpressionResult>
					],
					[true, syncResult ?? {}] as [
						boolean,
						Partial<ExpressionResult>
					],
				]) {
					if (fn) {
						if (!exps.has(attr)) exps.set(attr, {});
						const Exp = exps.get(attr)!;
						const isEventHandler = attr.name.startsWith("on");

						Exp[sync || isEventHandler ? "sync" : "bind"] = fn;
						Exp.isEventHandler = isEventHandler;
					}
					for (const { name, state } of [...(stateRefs ?? [])])
						this.props[name] ??= state;
				}
			}
		}

		// Handle prop bindings
		for (const [attr, { bind, sync, isEventHandler }] of exps.entries()) {
			const bindState = bind
				? State._createComputed(() => bind(this.props))
				: null;

			if (bindState) {
				bindState.effect(() => {
					this._setProp(attr.name, bindState!.value);
					sync?.(this.props);
				});
			}

			if (isEventHandler) {
				_element.removeAttribute(attr.name);
				_element.addEventListener(attr.name.replace(/^on/, ""), () =>
					sync?.(this.props)
				);
			}
		}

		// Traverse children and handle registration and text node bindings
		for (const child of Array.from(_element.childNodes)) {
			this.traverseNodes(child);
		}

		RegEl._registry.set(_element, this);
	}

	_setProp = (prop: string, value: unknown) => {
		if (prop in this._element) (this._element as any)[prop] = value;
		else this._element.setAttribute(prop, String(value ?? ""));
	};

	traverseNodes(node: Node) {
		// Stop traversal if this is an element with data-mf-ignore
		if (node.nodeType === Node.ELEMENT_NODE) {
			const element = node as HTMLElement;
			if (element.hasAttribute("data-mf-ignore")) {
				return;
			}

			const hasBindingAttribute = Array.from(element.attributes).some(
				(attr) => attr.value.startsWith("${")
			);

			if (hasBindingAttribute) {
				new RegEl(element);
				return;
			}
		} else if (node.nodeType === Node.TEXT_NODE) {
			const originalText = (node as Text).textContent || "";

			// Find all ${...} blocks in the text
			const matches = originalText.match(/\$\{[^}]*\}/g);

			if (matches) {
				const expressions = new Map<
					string,
					{ state: State<unknown>; expression: string }
				>();

				for (const match of matches) {
					const expression = match.slice(2, -1);
					const { stateRefs, fn } = evaluateExpression(expression);

					for (const { name, state } of stateRefs) {
						this.props[name] ??= state;
					}

					if (fn) {
						const state = State._createComputed(() =>
							fn(this.props)
						);
						expressions.set(match, { state, expression });
					}
				}

				const updateText = () => {
					let newText = originalText;
					for (const [match, { state }] of expressions ?? []) {
						newText = newText.replaceAll(
							match,
							String(state.value)
						);
					}
					node.textContent = newText;
				};

				// Set up effects for all states
				for (const { state } of expressions.values()) {
					state.effect(updateText);
				}
			}
		}

		// Recursively traverse children
		for (const child of Array.from(node.childNodes)) {
			this.traverseNodes(child);
		}
	}
}
