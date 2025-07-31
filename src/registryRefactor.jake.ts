import { evaluateExpression } from "./expression-parser";
import { State, computed } from "./State";

type RegisterableEl = HTMLElement | SVGElement | MathMLElement;
type Props = Record<string, unknown>;
export type CtxFunction = (props?: Props) => unknown;

const attrs = [
	"if",
	"elseif",
	"each",
	"scope",
	"await",
	"then",
	"catch",
	"target",
];

const _warnOnExtraClause = (attr: string, element: RegisterableEl) => {
	console.warn(`Ignoring processing clause on ${attr}`, element);
};

const _setProp = (element: RegisterableEl, prop: string, value: unknown) => {
	if (prop in element) (element as any)[prop] = value;
	else element.setAttribute(prop, String(value ?? ""));
};

const _handleSelectorInsert = (
	selectorExp: string,
	element: RegEl,
	fn?: CtxFunction
): CtxFunction | undefined => {
	const parts = selectorExp.split("(");
	const selector = parts.pop()?.replace(")", "").trim();
	const method = parts.at(0)?.trim() ?? "replace";

	if (!selector) {
		console.warn(
			"Selector is empty in selector clause",
			selectorExp,
			element
		);
		return;
	}

	return () => {
		const target = document.querySelector(selector);
		if (!target) {
			console.warn(`Target element not found for selector: ${selector}`);
			return;
		}

		const content = fn?.(element.props);
		if (content == null) return; // Skip if null or undefined

		let nodes: Node[];
		if (typeof content === "string") {
			const temp = document.createElement("div");
			temp.innerHTML = content;
			nodes = Array.from(temp.childNodes);
		} else if (content instanceof Node) {
			nodes = [content];
		} else if (content instanceof NodeList || Array.isArray(content)) {
			nodes = Array.from(content as NodeList | Node[]);
		} else {
			const textNode = document.createTextNode(String(content));
			nodes = [textNode];
		}

		switch (method) {
			case "replace":
				target.replaceChildren(...nodes);
				break;
			case "append":
				target.append(...nodes);
				break;
			case "prepend":
				target.prepend(...nodes);
				break;
			case "swap":
				if (target.parentNode) {
					const fragment = document.createDocumentFragment();
					fragment.append(...nodes);
					target.parentNode.replaceChild(fragment, target);
				}
				break;
			default:
				console.warn(`Unknown insertion method: ${method}`, element);
		}
	};
};

export class RegEl {
	private static _registry = new WeakMap<Element, RegEl>();
	private readonly _cachedContent: RegisterableEl | null = null;
	private _show?: State<unknown>;
	private _each?: State<unknown[]>;
	public props: Props = {};

	constructor(private _element: RegisterableEl) {
		this._cachedContent = _element.cloneNode(true) as RegisterableEl;

		const bindExps = new Map<string, CtxFunction[]>();
		const syncExps = new Map<string, CtxFunction[]>();
		const syncStates = new Map<string, State<unknown>>();
		const eventExps = new Map<string, CtxFunction[]>();
		const exps = new Map<string, CtxFunction[]>();

		// Traverse ancestors to find inherited props
		let parent = _element.parentElement;
		while (parent) {
			for (const [key, state] of Object.entries(
				RegEl._registry.get(parent)?.props ?? {}
			)) {
				this.props[key] = state;
			}
			parent = parent.parentElement;
		}

		// Get State props, set up expression funcs
		for (const [attr, value] of Object.entries(_element.dataset)) {
			const isSync = attr.startsWith("sync.");
			const expTarget = attr.startsWith("bind.")
				? bindExps
				: isSync
				? syncExps
				: attr.startsWith("on")
				? eventExps
				: null;

			if (!expTarget && !attrs.includes(attr)) continue;

			const expressions = value?.split(">>") ?? [];
			const selectorExp = expressions.at(3)?.trim();
			const fns: CtxFunction[] = [];
			const states: State<unknown>[] = [];

			for (const exp of expressions.slice(0, 2)) {
				const { fn, stateRefs } = evaluateExpression(exp);
				fns.push(fn);
				for (const { name, state } of [...stateRefs]) {
					this.props[name] = state;
					states.push(state);
				}
			}

			if (selectorExp) {
				const selectorFn = _handleSelectorInsert(
					selectorExp,
					this,
					fns.at(1)
				);
				if (selectorFn) fns.push(selectorFn);
			}

			if (expTarget) {
				const attrName = attr.replace(/(bind|sync)\./, "");
				expTarget.set(attrName, fns);
				if (isSync && states.length === 1)
					syncStates.set(attrName, states[0]!);
			} else exps.set(attr, fns);
		}

		// Handle property bindings
		for (const [prop, fns] of bindExps) {
			if (fns.at(1)) _warnOnExtraClause(prop, _element);
			_setProp(_element, prop, fns.at(0)?.(this.props));
		}

		// Handle property syncs
		for (const [prop, [bind, sync]] of syncExps) {
			if (bind) {
				const propState = computed(() => bind(this.props));

				propState.effect(() => {
					const newValue = propState.value;
					_setProp(_element, prop, newValue);

					if (sync) {
						sync(this.props);
					} else {
						const state = syncStates.get(prop);
						if (state) state.value = newValue;
					}
				});

				// Initial sync
				_setProp(_element, prop, propState.value);
			}
		}

		// Warn if multiconditional
		if (
			[exps.has("if"), exps.has("elseif"), exps.has("else")].filter(
				Boolean
			).length > 1
		) {
			console.warn(
				`Multiple conditional attributes; using "if"`,
				_element
			);
		}

		// Handle conditional rendering
		const isElse = _element.hasAttribute("data-else");
		const isElseOrElseIf = exps.has("elseif") ?? isElse;

		const [conditional, processing] =
			exps.get("if") ?? exps.get("elseif") ?? isElse
				? [(_props: Props) => true, null]
				: [];
		let showState: State<unknown> | undefined;

		// Warn if processing clause
		if (processing) _warnOnExtraClause("conditional", _element);

		if (conditional) {
			if (isElseOrElseIf) {
				const conditionalStates: State<unknown>[] = [];

				// Find all previous conditional elements (data-if, data-elseif) in this conditional chain
				let cond = _element.previousElementSibling;
				const hasIf = _element.dataset?.["if"];
				while (cond) {
					if (hasIf || isElseOrElseIf) {
						const show = RegEl._registry.get(
							cond as Element
						)?._show;
						if (show) {
							conditionalStates.unshift(show);
						}
					} else break;
					if (hasIf) break;
					cond = cond.previousElementSibling;
				}

				showState = computed(
					() =>
						!conditionalStates.some((s) => s.value) &&
						conditional(this.props)
				);
			} else showState = computed(() => conditional(this.props));
		}

		// Handle async operations
		const awaitExp = exps.get("await");
		const thenExp = exps.get("then");
		const catchExp = exps.get("catch");

		if (awaitExp) {
			// Warn if processing clause for await
			if (awaitExp.at(1)) _warnOnExtraClause("await", _element);

			const awaitState = computed(async () => {
				try {
					const promise = awaitExp.at(0)?.(this.props);
					if (promise instanceof Promise) {
						return await promise;
					}
					return promise;
				} catch (error) {
					throw error;
				}
			});

			awaitState.effect(async () => {
				try {
					const result = await awaitState.value;

					// Execute data-then if available
					if (thenExp) {
						if (thenExp.at(1)) _warnOnExtraClause("then", _element);

						// Pass the resolved value as a prop
						const thenProps = { ...this.props, $result: result };
						thenExp.at(0)?.(thenProps);
					}
				} catch (error) {
					// Execute data-catch if available
					if (catchExp) {
						if (catchExp.at(1))
							_warnOnExtraClause("catch", _element);

						// Pass the error as a prop
						const catchProps = { ...this.props, $error: error };
						catchExp.at(0)?.(catchProps);
					} else {
						console.error(
							"Unhandled async error:",
							error,
							_element
						);
					}
				}
			});
		} else if (thenExp || catchExp) {
			console.warn(
				"data-then or data-catch found without data-await",
				_element
			);
		}

		// Set up main display states
		this._show = showState;
		const showHide = () => {
			this._element.style.display = this._show?.value ? "" : "none";
		};
		this._show?.effect(showHide);
		showHide();

		this._each = computed(
			() => exps.get("each")?.[0]?.(this.props) ?? []
		) as State<unknown[]>;

		this._each?.effect(() => {
			const intendedCount = this._each!.value.length ?? 0;

			let highestValidIndex = -1;
			let removeMode = false;

			for (const child of Array.from(_element.childNodes)) {
				if (
					child.nodeType === Node.COMMENT_NODE &&
					child.textContent?.startsWith("#MFENDI-")
				) {
					const index = +(child.textContent.split("-")[1] ?? -1);

					if (index >= 0) {
						if (index >= intendedCount) {
							// Mark removal mode and remove this comment
							removeMode = true;
							_element.removeChild(child);
						} else {
							// This is a valid comment node
							highestValidIndex = Math.max(
								highestValidIndex,
								index
							);
						}
					}
				} else if (removeMode) {
					_element.removeChild(child);
				}
			}

			// Add missing items if needed
			if (highestValidIndex < intendedCount - 1) {
				const fragment = document.createDocumentFragment();

				for (let i = highestValidIndex + 1; i < intendedCount; i++) {
					if (this._cachedContent) {
						const clonedElement = this._cachedContent.cloneNode(
							true
						) as RegisterableEl;
						new RegEl(fragment.appendChild(clonedElement)); // Register the new element
					}

					const commentNode = document.createComment(`#MFENDI-${i}`);
					fragment.appendChild(commentNode);
				}

				_element.appendChild(fragment);
			}
		});

		RegEl._registry.set(_element, this);
	}
}
