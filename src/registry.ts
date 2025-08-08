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
	_cachedContent: RegisterableEl | null = null;

	static register(element: RegisterableEl) {
		console.log(
			`📝 Attempting to register element:`,
			element?.tagName,
			element?.outerHTML
		);

		if (!element) {
			console.warn("Cannot register undefined element");
			return;
		}

		const existing = RegEl.#registry.get(element);
		if (existing) {
			console.log(`♻️ Element already registered`);
			return existing;
		}

		console.log(`🆕 Creating new RegEl for element`);
		return new RegEl(element);
	}

	constructor(element: RegisterableEl) {
		console.log(
			`🏗️ Creating RegEl for element:`,
			element,
			element.tagName,
			element.outerHTML
		);

		if (!element) {
			throw new Error("RegEl constructor requires a valid element");
		}
		this.#element = element;
		this._cachedContent = element.cloneNode(true) as RegisterableEl;

		// Register this instance in the WeakMap FIRST to prevent recursion
		RegEl.#registry.set(element, this);

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
		const attributeStates = new Map<string, State<unknown>>(); // Cache states per attribute
		let conditionalFn: CtxFunction | undefined;
		let eachFn: CtxFunction | undefined;
		let asyncFn: CtxFunction | undefined;

		for (const attr of element.attributes) {
			// Handle onclick attributes specially, even without ${}
			if (attr.name === "onclick") {
				console.log(`🖱️ Found onclick attribute: ${attr.value}`);
				element.removeAttribute(attr.name);
				const handler = _evaluateExpression(attr.value);
				console.log(`Click handler evaluation result:`, handler);
				console.log(`Handler properties:`, Object.keys(handler));
				console.log(
					`_isArrowFunction value:`,
					handler._isArrowFunction
				);
				console.log(`b property value:`, handler.b);

				// Add debouncing to prevent rapid successive clicks
				let lastClickTime = 0;
				const debounceMs = 50; // Prevent clicks within 50ms of each other

				if (handler._isArrowFunction || handler.b) {
					console.log(`📎 Adding arrow function click listener`);
					element.addEventListener("click", (event) => {
						const now = Date.now();
						if (now - lastClickTime < debounceMs) {
							console.log(`🚫 Click debounced (too rapid)`);
							return;
						}
						lastClickTime = now;

						// Only process actual user clicks, not programmatic ones
						if (event.isTrusted === false) {
							console.log(`🚫 Ignoring programmatic click event`);
							return;
						}

						console.log(`🎯 Arrow function click triggered!`);
						const result = handler.fn({});
						console.log(`Arrow function result:`, result);
					});
				} else {
					console.log(`📎 Adding regular function click listener`);
					element.addEventListener("click", (event) => {
						const now = Date.now();
						if (now - lastClickTime < debounceMs) {
							console.log(`🚫 Click debounced (too rapid)`);
							return;
						}
						lastClickTime = now;

						// Only process actual user clicks, not programmatic ones
						if (event.isTrusted === false) {
							console.log(`🚫 Ignoring programmatic click event`);
							return;
						}

						console.log(`🎯 Regular function click triggered!`);
						const result = handler.fn({ event, ...this._props });
						console.log(`Regular function result:`, result);
					});
				}
				console.log(`✅ Click handler attached to element`);
				continue; // Skip the normal attribute processing for onclick
			}

			if (!attr.value[_startsWith]("${")) continue;

			const parts = attr.value.split(">>");
			const isEventHandler = attr.name[_startsWith]("on");
			let bindFn: CtxFunction | undefined;
			let syncFn: CtxFunction | undefined;

			// Process bind and sync expressions
			for (const [i, part] of parts.entries()) {
				const result = _evaluateExpression(part.slice(2, -1));
				const { fn, _stateRefs } = result || {};

				if (fn) {
					if (i === 0) bindFn = fn;
					else syncFn = fn;
				}

				if (_stateRefs) {
					for (const { _name: name, _state: state } of Array.from(
						_stateRefs
					)) {
						this._props[name] ??= state;
					}
				}
			}

			if ([`data-if`, `data-elseif`, `data-else`].includes(attr.name)) {
				conditionalFn = bindFn;
			} else if (attr.name === `data-each`) {
				eachFn = bindFn;
			} else if (
				[`data-await`, `data-then`, `data-catch`].includes(attr.name)
			) {
				asyncFn = bindFn;
			} else {
				// Create effects - but reuse states for same attribute expressions
				if (bindFn) {
					const stateKey = `${attr.name}:${attr.value}`;
					let bindState = attributeStates.get(stateKey);
					if (!bindState) {
						bindState = State.createComputed(() =>
							bindFn!(this._props)
						);
						attributeStates.set(stateKey, bindState);
					}

					pendingEffects.push(() => {
						bindState!.effect(() => {
							this.#setProp(attr.name, bindState!.value);
							syncFn?.(this._props);
						});
					});
				}

				if (isEventHandler && (bindFn || syncFn)) {
					element.removeAttribute(attr.name);
					const handlerFn = syncFn || bindFn; // Use syncFn if available, otherwise bindFn
					element.addEventListener(attr.name.slice(2), () =>
						handlerFn!(this._props)
					);
				}
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

		let showState: State<unknown> | undefined;
		if (conditionalFn) {
			if (isElse || isElseIf) {
				// Defer the conditional state creation to avoid circular dependencies
				// during the registration phase
				showState = State.createComputed(() => {
					const conditionalStates: State<unknown>[] = [];

					// Find all previous conditional elements (data-if, data-elseif) in this conditional chain
					let cond = element.previousElementSibling;
					while (cond) {
						const regEl = RegEl.#registry.get(cond as Element);
						const show = regEl?._show;
						if (
							show &&
							(cond.hasAttribute("data-if") ||
								cond.hasAttribute("data-elseif"))
						) {
							conditionalStates.unshift(show);
						} else {
							// Stop if we hit an element that's not part of the conditional chain
							break;
						}
						cond = cond.previousElementSibling;
					}

					return (
						!conditionalStates.some((s) => s.value) &&
						conditionalFn(this._props)
					);
				});
			} else {
				showState = State.createComputed(() =>
					conditionalFn(this._props)
				);
			}
		}

		// if (isAwait) {
		// 	const awaitState = derived(async () => {
		// 		try {
		// 			const promise = asyncFn?.(this._props);
		// 			if (promise instanceof Promise) {
		// 				return await promise;
		// 			}
		// 			return promise;
		// 		} catch (error) {
		// 			throw error;
		// 		}
		// 	});

		// 	awaitState.effect(async () => {
		// 		try {
		// 			const result = await awaitState.value;

		// 			// Execute data-then if available
		// 			if (thenExp) {
		// 				if (thenExp.at(1)) _warnOnExtraClause("then", _element);

		// 				// Pass the resolved value as a prop
		// 				const thenProps = { ...this.props, $result: result };
		// 				thenExp.at(0)?.(thenProps);
		// 			}
		// 		} catch (error) {
		// 			// Execute data-catch if available
		// 			if (catchExp) {
		// 				if (catchExp.at(1))
		// 					_warnOnExtraClause("catch", _element);

		// 				// Pass the error as a prop
		// 				const catchProps = { ...this.props, $error: error };
		// 				catchExp.at(0)?.(catchProps);
		// 			} else {
		// 				console.error(
		// 					"Unhandled async error:",
		// 					error,
		// 					_element
		// 				);
		// 			}
		// 		}
		// 	});
		// } else if (thenExp || catchExp) {
		// 	if (thenExp && !awaitExp) {
		// 		console.warn("data-then found without data-await", _element);
		// 	}
		// 	if (catchExp && !awaitExp && !thenExp) {
		// 		console.warn(
		// 			"data-catch found without data-await or data-then",
		// 			_element
		// 		);
		// 	}
		// }

		// Set up main display states
		this._show = showState;
		const showHide = () => {
			// Only hide elements if they have a conditional state that evaluates to false
			// Elements without conditions should always be visible
			if (this._show) {
				element.style.display = this._show.value ? "" : "none";
			} else {
				element.style.display = ""; // Show elements without conditions
			}
		};
		this._show?.effect(showHide);
		showHide();

		this._each = State.createComputed(
			() => eachFn?.(this._props) ?? []
		) as State<unknown[]>;

		this._each?.effect(() => {
			const intendedCount = this._each!.value.length ?? 0;

			let highestValidIndex = -1;
			let removeMode = false;

			for (const child of Array.from(element.childNodes)) {
				if (
					child.nodeType === Node.COMMENT_NODE &&
					child.textContent?.startsWith("#MFENDI-")
				) {
					const index = +(child.textContent.split("-")[1] ?? -1);

					if (index >= 0) {
						if (index >= intendedCount) {
							// Mark removal mode and remove this comment
							removeMode = true;
							element.removeChild(child);
						} else {
							// This is a valid comment node
							highestValidIndex = Math.max(
								highestValidIndex,
								index
							);
						}
					}
				} else if (removeMode) {
					element.removeChild(child);
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

				element.appendChild(fragment);
			}
		});

		for (const effect of pendingEffects) effect();
		this.#traverseNodes(element);
		// Note: element is already registered in WeakMap at start of constructor
	}

	#setProp = (prop: string, value: unknown) => {
		// Special handling for input elements to prevent browser parsing errors
		if (this.#element instanceof HTMLInputElement && prop === "value") {
			// For input elements, ensure the value is properly converted
			if (this.#element.type === "number") {
				const numValue = Number(value);
				if (!isNaN(numValue)) {
					this.#element.value = String(numValue);
				} else {
					this.#element.value = ""; // Clear invalid values
				}
				return;
			} else {
				this.#element.value = String(value ?? "");
				return;
			}
		}

		// For other properties and elements
		if (prop in this.#element) {
			(this.#element as any)[prop] = value;
		} else {
			this.#element.setAttribute(prop, String(value ?? ""));
		}
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
					// Use register method to avoid creating duplicate RegEl instances
					RegEl.register(element);
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
		const expressionStates = new Map<string, State<unknown>>(); // Cache states

		// Use matchAll to properly find all expressions
		const matches = Array.from(originalText.matchAll(/\$\{[^}]*\}/g));

		for (const match of matches) {
			const expression = match[0].slice(2, -1);
			let state = expressionStates.get(expression);

			if (!state) {
				const result = _evaluateExpression(expression);
				const { _stateRefs, fn } = result || {};

				if (_stateRefs) {
					for (const { _name: name, _state: st } of Array.from(
						_stateRefs
					)) {
						this._props[name] ??= st;
					}
				}

				if (fn) {
					state = State.createComputed(() => fn(this._props));
					expressionStates.set(expression, state);
				}
			}

			if (state) {
				expressions.push([match[0], state]);
			}
		}

		if (expressions.length) {
			// Create single effect that updates the text node
			const updateText = () => {
				let newText = originalText;
				for (const [matchStr, state] of expressions) {
					newText = newText.replaceAll(matchStr, `${state.value}`);
				}
				textNode.textContent = newText;
			};

			// Create effect for the combined update
			if (expressions.length > 0) {
				expressions[0][1].effect(updateText);
			}
		}
	}
}
