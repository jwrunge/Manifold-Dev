import _evaluateExpression from "./expression-parser";
import { State } from "./State";

const _childNodes = "childNodes",
	_startsWith = "startsWith",
	_hasAttr = "hasAttribute";

type RegisterableEl = HTMLElement | SVGElement | MathMLElement;
type Props = Record<string, unknown>;
export type CtxFunction = (props?: Props) => unknown;

export class RegEl {
	static #registry = new WeakMap<Element, RegEl>();
	#element: RegisterableEl;
	_props: Props = {};
	_show: State<unknown> | undefined;
	_each: State<unknown[]> | undefined;

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
			Object.assign(this._props, rl._props);
			parent = parent.parentElement;
		}

		// Process attributes
		const pendingEffects: (() => void)[] = [];

		for (const attr of element.attributes) {
			if (!attr.value[_startsWith]("${")) continue;

			const parts = attr.value.split(">>");
			const isEventHandler = attr.name[_startsWith]("on");
			let bindFn: CtxFunction | undefined;
			let syncFn: CtxFunction | undefined;

			// Process bind and sync expressions
			for (const [i, part] of parts.entries()) {
				const { fn, _stateRefs } = _evaluateExpression(
					part.slice(2, -1)
				); // Remove ${ and }

				if (fn) {
					if (i === 0) bindFn = fn;
					else syncFn = fn;
				}

				for (const { _name: name, _state: state } of _stateRefs) {
					this._props[name] ??= state;
				}
			}

			// Create effects
			if (bindFn) {
				const bindState = State._createComputed(() =>
					bindFn!(this._props)
				);
				pendingEffects.push(() => {
					bindState.effect(() => {
						this.#setProp(attr.name, bindState.value);
						syncFn?.(this._props);
					});
				});
			}

			if (isEventHandler && syncFn) {
				element.removeAttribute(attr.name);
				element.addEventListener(attr.name.slice(2), () =>
					syncFn!(this._props)
				);
			}
		}

		const isIf = element[_hasAttr]("data-if"),
			isElseIf = element[_hasAttr]("data-elseif"),
			isElse = element[_hasAttr]("data-else"),
			isAwait = element[_hasAttr]("data-await"),
			isThen = element[_hasAttr]("data-then"),
			isCatch = element[_hasAttr]("data-catch"),
			isEach = element[_hasAttr]("data-each");

		// Warn if multiconditional
		if ([isIf, isElseIf, isElse].filter(Boolean).length > 1) {
			console.warn(
				`Multiple conditional attributes; using "if"`,
				element
			);
		}

		if ([isAwait, isThen, isCatch].filter(Boolean).length > 1) {
			console.warn(`Multiple async attributes; using "await"`, element);
		}

		// Warn if orphan conditionals
		if (isElseIf || isElse) {
			let hasConditionalChain = false;
			let prev = element.previousElementSibling;
			while (
				prev &&
				(prev[_hasAttr]("data-if") || prev[_hasAttr]("data-elseif"))
			) {
				hasConditionalChain = true;
				if (prev[_hasAttr]("data-if")) break;
				prev = prev.previousElementSibling;
			}
			if (!hasConditionalChain) {
				console.warn(
					`Orphan ${
						isElse ? "data-else" : "data-elseif"
					} without preceding data-if`,
					element
				);
			}
		}

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
						const show = RegEl.#registry.get(
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
			if (thenExp && !awaitExp) {
				console.warn("data-then found without data-await", _element);
			}
			if (catchExp && !awaitExp && !thenExp) {
				console.warn(
					"data-catch found without data-await or data-then",
					_element
				);
			}
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

				if (element[_hasAttr]("data-mf-ignore")) continue;

				// Check for binding attributes
				let hasBinding = false;
				for (const attr of element.attributes) {
					if (attr.value[_startsWith]("${")) {
						hasBinding = true;
						break;
					}
				}

				if (hasBinding) {
					new RegEl(element);
					continue;
				}

				// Add children to stack (in reverse order to maintain traversal order)
				for (let i = element[_childNodes].length - 1; i >= 0; i--) {
					stack.push(element[_childNodes][i]!);
				}
			} else if (current.nodeType === Node.TEXT_NODE) {
				this.#processTextNode(current as Text);
			} else {
				for (let i = current[_childNodes].length - 1; i >= 0; i--) {
					stack.push(current[_childNodes][i]!);
				}
			}
		}
	}

	#processTextNode(textNode: Text) {
		const originalText = textNode.textContent || "";
		const expressions: Array<[string, State<unknown>]> = [];

		let match;
		while ((match = /\$\{[^}]*\}/g.exec(originalText))) {
			const { _stateRefs, fn } = _evaluateExpression(
				match[0].slice(2, -1)
			);

			for (const { _name: name, _state: state } of _stateRefs) {
				this._props[name] ??= state;
			}

			if (fn) {
				const state = State._createComputed(() => fn(this._props));
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
