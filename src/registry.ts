import { evaluateExpression } from "./expression-parser";
import { State, computed } from "./State";
import { isEqual } from "./equality";

// Extend element interfaces to include mfRegister
declare global {
	interface HTMLElement {
		mfRegister?: () => RegEl;
	}
	interface SVGElement {
		mfRegister?: () => RegEl;
	}
	interface MathMLElement {
		mfRegister?: () => RegEl;
	}
}

export const MANIFOLD_ATTRIBUTES = [
	"if",
	"elseif",
	"else",
	"each",
	"scope",
	"await",
	"then",
	"catch",
	"process",
	"target",
	"bind",
	"sync",
] as const;

export class RegEl {
	private static _registry: WeakMap<Element | DocumentFragment, RegEl> =
		new WeakMap();

	// Debug method to access registry
	static getRegEl(element: Element | DocumentFragment): RegEl | undefined {
		return RegEl._registry.get(element);
	}

	private _cachedContent: Node | null = null;

	// Each loop state tracking for efficient updates
	private _previousEachArray: Array<unknown> = [];
	private _eachClones: Array<{
		element: HTMLElement;
		regEl: RegEl;
		value: unknown;
		index: number;
	}> = [];

	// Helper function to create context from props
	private static createContext(
		props: Record<string, State<unknown>>
	): Record<string, unknown> {
		const context: Record<string, unknown> = {};
		for (const [key, state] of Object.entries(props)) {
			context[key] = state.value;
		}
		return context;
	}

	// Helper function to set element property
	private static setElementProperty(
		element: HTMLElement | SVGElement | MathMLElement,
		property: string,
		value: unknown
	): void {
		if (property in element) {
			(element as any)[property] = value;
		} else {
			element.setAttribute(property, String(value ?? ""));
		}
	}

	// Helper function to parse property:expression binding
	private static parseBinding(
		binding: string
	): { property: string; expr: string } | null {
		// Split only on the first colon to handle expressions with colons in them
		const colonIndex = binding.indexOf(":");
		if (colonIndex === -1) return null;

		const property = binding.substring(0, colonIndex).trim();
		const expr = binding.substring(colonIndex + 1).trim();
		if (!property || !expr) return null;
		return { property, expr };
	}

	// Helper function to split bind expressions respecting quotes, parentheses, and braces
	private static splitBindExpressions(bindStr: string): string[] {
		const expressions: string[] = [];
		let current = "";
		let inQuotes = false;
		let quoteChar = "";
		let parenDepth = 0;
		let braceDepth = 0;

		for (let i = 0; i < bindStr.length; i++) {
			const char = bindStr[i];

			// Handle quotes
			if (
				(char === '"' || char === "'") &&
				(i === 0 || bindStr[i - 1] !== "\\")
			) {
				if (!inQuotes) {
					inQuotes = true;
					quoteChar = char;
				} else if (char === quoteChar) {
					inQuotes = false;
					quoteChar = "";
				}
			}

			// Handle parentheses and braces (only when not in quotes)
			if (!inQuotes) {
				if (char === "(") {
					parenDepth++;
				} else if (char === ")") {
					parenDepth--;
				} else if (char === "{") {
					braceDepth++;
				} else if (char === "}") {
					braceDepth--;
				}
			}

			// Split on comma only when not in quotes, parentheses, or braces
			if (
				char === "," &&
				!inQuotes &&
				parenDepth === 0 &&
				braceDepth === 0
			) {
				expressions.push(current.trim());
				current = "";
			} else {
				current += char;
			}
		}

		if (current.trim()) {
			expressions.push(current.trim());
		}

		return expressions;
	}

	// Helper function to parse event-based expressions (e.g., "await: fn1, onclick: fn2")
	private static parseEventMap(
		expr: string,
		props: Record<string, State<unknown>>
	): Record<string, Function> {
		const eventMap: Record<string, Function> = {};

		// Check if expression contains event labels (has colons)
		if (expr.includes(":")) {
			// Parse "event: function, event2: function2" format
			const eventExpressions = RegEl.splitBindExpressions(expr);
			for (const eventExpr of eventExpressions) {
				const parsed = RegEl.parseBinding(eventExpr);
				if (parsed) {
					const { property: event, expr: fnExpr } = parsed;

					// Check if this is a JavaScript arrow function or regular function
					if (
						fnExpr.includes("=>") ||
						fnExpr.startsWith("function")
					) {
						// Raw JavaScript function - create it directly
						try {
							console.log(
								`🔧 Creating function for ${event}:`,
								fnExpr
							);
							const functionString = "return (" + fnExpr + ")";
							console.log(`🔧 Function string:`, functionString);
							const func = new Function(functionString)();
							console.log(`🔧 Created function:`, func);
							eventMap[event] = func;
						} catch (error) {
							console.error(
								`❌ Failed to create event handler for ${event}:`,
								error
							);
							console.error(
								`❌ Function expression was:`,
								fnExpr
							);
							// Fallback to expression evaluation
							const { processedExpression } = RegEl.parseAliases(
								fnExpr,
								props,
								false
							);
							const evaluator =
								evaluateExpression(processedExpression);
							eventMap[event] = (result: unknown) => {
								const context = RegEl.createContext(props);
								const extendedContext = {
									...context,
									response: result,
								};
								return evaluator.fn(extendedContext);
							};
						}
					} else {
						// Manifold expression - evaluate normally
						const { processedExpression } = RegEl.parseAliases(
							fnExpr,
							props,
							false
						);
						const evaluator =
							evaluateExpression(processedExpression);
						eventMap[event] = (result: unknown) => {
							const context = RegEl.createContext(props);
							// Add the result as 'response' or similar context variable
							const extendedContext = {
								...context,
								response: result,
							};
							return evaluator.fn(extendedContext);
						};
					}
				}
			}
		} else {
			// Single function for default event (await)
			const { processedExpression } = RegEl.parseAliases(
				expr,
				props,
				false
			);
			const evaluator = evaluateExpression(processedExpression);
			eventMap["await"] = (result: unknown) => {
				const context = RegEl.createContext(props);
				const extendedContext = { ...context, response: result };
				return evaluator.fn(extendedContext);
			};
		}

		return eventMap;
	}

	// Helper function to parse event-based selectors (e.g., "onclick: #target, await: .content")
	private static parseEventSelectors(expr: string): Record<string, string> {
		const selectorMap: Record<string, string> = {};

		// Check if expression contains event labels (has colons)
		if (expr.includes(":")) {
			// Parse "event: selector, event2: selector2" format
			const eventExpressions = RegEl.splitBindExpressions(expr);
			for (const eventExpr of eventExpressions) {
				const parsed = RegEl.parseBinding(eventExpr);
				if (parsed) {
					const { property: event, expr: selector } = parsed;
					selectorMap[event] = selector;
				}
			}
		} else {
			// Single selector for default event (await)
			selectorMap["await"] = expr;
		}

		return selectorMap;
	}

	// Helper function to parse and create aliased states
	static parseAliases(
		text: string,
		props: Record<string, State<unknown>>,
		includeBaseStates: boolean
	): { processedExpression: string } {
		let processedExpression = text;

		// Parse aliases: "@counter as count" or "@user.name as name"
		const aliasRegex =
			/@([a-zA-Z_$][a-zA-Z0-9_.$]*)\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
		let match;

		while ((match = aliasRegex.exec(text)) !== null) {
			const [fullMatch, stateRef, aliasName] = match;
			if (!stateRef || !aliasName) continue;

			// Replace the alias expression with just the alias name
			processedExpression = processedExpression.replace(
				fullMatch,
				`@${aliasName}`
			);

			// Add the alias to props
			if (stateRef.includes(".")) {
				// Property path alias: "@user.name as name"
				const [stateName] = stateRef.split(".");
				const state = State.get<unknown>(stateName);
				if (state) {
					// Create a computed state for the property
					const computedState = computed(() => {
						const obj = state.value;
						const propPath = stateRef.split(".").slice(1);
						let current: any = obj;
						for (const prop of propPath) {
							if (current && typeof current === "object") {
								current = current[prop];
							} else {
								current = undefined;
								break;
							}
						}
						return current;
					});
					props[aliasName] = computedState;
				}
			} else {
				// Simple state alias: "@counter as count"
				const state = State.get<unknown>(stateRef);
				if (state) {
					props[aliasName] = state;
				}
			}

			// Add base state if needed
			if (includeBaseStates) {
				const [stateName] = stateRef.split(".");
				const baseState = State.get<unknown>(stateName);
				if (baseState && stateName && !props[stateName]) {
					props[stateName] = baseState;
				}
			}
		}

		return { processedExpression };
	} // Helper function to add simple state references (no aliasing)
	private static addSimpleStateRefs(
		expression: string,
		props: Record<string, State<unknown>>
	): void {
		// First, remove all aliasing patterns from the expression to avoid false matches
		const withoutAliases = expression.replace(
			/@([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
			""
		);

		const simpleStateRegex = /@([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
		let match;

		while ((match = simpleStateRegex.exec(withoutAliases)) !== null) {
			const [, stateName] = match;
			if (stateName && !props[stateName]) {
				const state = State.get<unknown>(stateName);
				if (state) {
					props[stateName] = state;
				}
			}
		}
	}

	static register(element: HTMLElement | SVGElement | MathMLElement) {
		element.mfRegister = () => RegEl.register(element);

		const props: Record<string, State<unknown>> = {};
		const attrState = new Map<string, State<unknown>>();

		// PHASE 1: Collect ALL props from ALL attributes (no evaluations yet)
		for (const attr of MANIFOLD_ATTRIBUTES) {
			const attrText = element.dataset[attr];
			if (!attrText) continue;

			if (attr === "scope") {
				// Parse scope declarations: "@user, @counter as count, @user.name as name"
				const scopeItems = attrText.split(",").map((s) => s.trim());
				for (const item of scopeItems) {
					// For scope, don't add base states for aliases - only the alias itself
					RegEl.parseAliases(item, props, false);
					RegEl.addSimpleStateRefs(item, props);
				}
			} else if (attr === "each") {
				// Skip data-each during props collection - it has special syntax and is handled separately
				continue;
			} else {
				// For all other attributes, collect aliases and add base states as needed
				RegEl.parseAliases(attrText, props, true);
			}
		}

		// Traverse ancestors to find inherited props
		let parent = element.parentElement;

		while (parent) {
			const regPar = RegEl._registry.get(parent);
			if (regPar) {
				for (const [key, state] of Object.entries(regPar.props)) {
					if (!props[key]) {
						props[key] = state;
					}
				}
			}
			parent = parent.parentElement;
		}

		// PHASE 2: Now evaluate all expressions with complete props context
		for (const attr of MANIFOLD_ATTRIBUTES) {
			const attrText = element.dataset[attr];
			if (!attrText) continue;
			if (attr === "scope") continue; // Already handled in phase 1

			// Parse aliases and get processed expression
			const { processedExpression } = RegEl.parseAliases(
				attrText,
				{}, // Empty props object since we already collected everything
				false // Don't add any more props
			);

			// Parse the processed expression
			const exprResult = evaluateExpression(processedExpression);

			// Add any remaining state dependencies that weren't caught by aliasing
			for (const stateRef of exprResult.stateRefs) {
				if (!props[stateRef]) {
					const state = State.get<unknown>(stateRef);
					if (state) {
						props[stateRef] = state;
					}
				}
			}

			// Store the expression result for this attribute
			// Always create a new state that evaluates the processed expression
			const evaluatedState = computed(() => {
				const context = RegEl.createContext(props);
				return exprResult.fn(context);
			});
			attrState.set(attr, evaluatedState);
		}

		// Handle conditionals
		const ifExpr = element.dataset["if"] ?? element.dataset["elseif"];
		const isElif = !!element.dataset["elseif"];
		const isElse = element.hasAttribute("data-else");
		const eachExpr = element.dataset["each"];

		// Create show State if conditional expression exists
		let showState: State<unknown> | undefined;

		if (ifExpr) {
			// Always parse the expression with aliases and use full props context
			const { processedExpression } = RegEl.parseAliases(
				ifExpr,
				{},
				false
			);
			const evaluator = evaluateExpression(processedExpression);
			showState = computed(() => {
				const context = RegEl.createContext(props);
				return evaluator.fn(context);
			});
		}

		if (isElif || isElse) {
			const conditionalStates: State<unknown>[] = [];

			// Find all previous conditional elements (data-if, data-elseif) in this conditional chain
			let cond = element.previousElementSibling;
			while (cond) {
				const ifCondition = (cond as HTMLElement).dataset?.["if"];
				const elifCondition = (cond as HTMLElement).dataset?.["elseif"];

				if (ifCondition || elifCondition) {
					const rl = RegEl._registry.get(cond as Element);
					if (rl?._show) {
						conditionalStates.unshift(rl._show); // Add to beginning to maintain order
					}
				}

				// Stop when we reach the initial if condition
				if (ifCondition) break;

				// Skip text nodes (whitespace) and continue
				cond = cond.previousElementSibling;
			}

			if (isElif) {
				// For elseif: show only if this condition is true AND all previous conditions are false
				const currentCondition = showState;
				showState = computed(() => {
					const previousConditionsTrue = conditionalStates.some(
						(s) => s.value
					);
					const currentConditionTrue =
						currentCondition?.value ?? false;
					return !previousConditionsTrue && currentConditionTrue;
				});
			} else if (isElse) {
				// For else: show only if all previous conditions are false
				showState = computed(() => {
					return !conditionalStates.some((s) => s.value);
				});
			}
		}

		// Handle async attributes first so they're available for bind handlers
		let awaitState: State<Promise<unknown>> | undefined;
		let processMap: Record<string, Function> | undefined;
		let targetMap: Record<string, string> | undefined;

		// Handle data-await
		const awaitExpr = element.dataset["await"];
		if (awaitExpr) {
			const { processedExpression } = RegEl.parseAliases(
				awaitExpr,
				{},
				false
			);
			const evaluator = evaluateExpression(processedExpression);
			awaitState = computed(() => {
				const context = RegEl.createContext(props);
				return evaluator.fn(context) as Promise<unknown>;
			});
		}

		// Handle data-then
		const thenVar = element.dataset["then"];

		// Handle data-catch
		const catchVar = element.dataset["catch"];

		// Handle data-process
		const processExpr = element.dataset["process"];
		if (processExpr) {
			processMap = RegEl.parseEventMap(processExpr, props);
		}

		// Handle data-target
		const targetExpr = element.dataset["target"];
		if (targetExpr) {
			targetMap = RegEl.parseEventSelectors(targetExpr);
		}

		// Handle bind
		element.dataset["bind"]?.split(/\s*,\s*/).forEach((binding) => {
			const parsed = RegEl.parseBinding(binding);
			if (!parsed) return;
			const { property, expr } = parsed;

			console.log(`🔗 Processing bind: ${property} = ${expr}`);

			// Special handling for event handlers (onclick, onchange, etc.)
			if (property.startsWith("on")) {
				console.log(`🎪 Detected event handler: ${property}`);

				// Parse the bind expression to handle aliases - pass current props for context
				const { processedExpression } = RegEl.parseAliases(
					expr,
					props,
					false
				);
				const exprResult = evaluateExpression(
					processedExpression,
					true
				); // true = isEventHandler

				// Create a state that evaluates the event handler expression with full props context
				const handlerState = computed(() => {
					const context = RegEl.createContext(props);
					return exprResult.fn(context);
				});

				// Set up the effect to update the event handler property
				handlerState?.effect(() => {
					const handlerFunction = handlerState.value;
					console.log(
						`📌 Setting up event handler for ${property}:`,
						handlerFunction
					);

					if (typeof handlerFunction === "function") {
						// Wrap event handler to support async operations
						const wrappedHandler = (event: Event) => {
							console.log(`🔥 ${property} handler triggered!`);
							const result = handlerFunction(event);

							// Check if result is a promise and we have async config
							if (
								result instanceof Promise &&
								(processMap || targetMap)
							) {
								// Use the full property name (e.g., 'onclick') for event type
								const eventType = property;

								// Handle the promise with async features
								const regEl = RegEl._registry.get(element);
								if (regEl) {
									regEl._handlePromise(result, eventType);
								}
							}

							return result;
						};

						RegEl.setElementProperty(
							element,
							property,
							wrappedHandler
						);
						console.log(
							`✅ Event handler ${property} set on element:`,
							element
						);
					} else {
						console.warn(
							`⚠️ Expected function for ${property} but got:`,
							typeof handlerFunction
						);
					}
				});

				// Trigger initial evaluation
				handlerState.value;

				return; // Skip normal expression processing for event handlers
			}

			// Parse the bind expression to handle aliases - pass current props for context
			const { processedExpression } = RegEl.parseAliases(
				expr,
				props,
				false
			);
			const exprResult = evaluateExpression(processedExpression, false); // false = not event handler

			// Create a state that evaluates the bind expression with full props context
			const newState = computed(() => {
				const context = RegEl.createContext(props);
				return exprResult.fn(context);
			});

			// Set up the effect to update the property
			newState?.effect(() => {
				const value = newState.value;
				console.log(`🎯 Setting ${property} to:`, value, typeof value);

				// Check if this is an event handler property
				if (property.startsWith("on") && typeof value === "function") {
					console.log(`📌 Setting up event handler for ${property}`);
					// Wrap event handler to support async operations
					const wrappedHandler = (event: Event) => {
						console.log(`🔥 ${property} handler triggered!`);
						const result = value(event);

						// Check if result is a promise and we have async config
						if (
							result instanceof Promise &&
							(processMap || targetMap)
						) {
							// Use the full property name (e.g., 'onclick') for event type
							const eventType = property;

							// Handle the promise with async features
							const regEl = RegEl._registry.get(element);
							if (regEl) {
								regEl._handlePromise(result, eventType);
							}
						}

						return result;
					};

					RegEl.setElementProperty(element, property, wrappedHandler);
					console.log(
						`✅ Event handler ${property} set on element:`,
						element
					);
				} else {
					RegEl.setElementProperty(element, property, value);
				}
			});

			// Trigger initial evaluation
			newState.value;
		});

		// Handle sync (two-way binding)
		element.dataset["sync"]?.split(/\s*,\s*/).forEach((binding) => {
			const parsed = RegEl.parseBinding(binding);
			if (!parsed) return;
			const { property, expr } = parsed;

			// Parse the sync expression to handle aliases using the current props context
			const { processedExpression } = RegEl.parseAliases(
				expr,
				props,
				false
			);
			const exprResult = evaluateExpression(processedExpression);

			// Create a state that evaluates the sync expression with full props context
			const newState = computed(() => {
				const context = RegEl.createContext(props);
				const result = exprResult.fn(context);
				return result;
			});

			// Set up the effect to update the property (state -> element)
			newState?.effect(() => {
				try {
					RegEl.setElementProperty(element, property, newState.value);
				} catch (error) {
					console.warn(`Failed to set ${property}:`, error);
				}
			});

			// Set up event listener for two-way binding (element -> state)
			let targetState: State<unknown> | undefined;
			let targetProperty: string | undefined;

			// For sync, we need to resolve the target state to update
			if (processedExpression.startsWith("@")) {
				const stateRef = processedExpression.slice(1); // Remove @

				if (stateRef.includes(".")) {
					// Property path: "@user.name"
					const [stateName, ...propPath] = stateRef.split(".");
					targetState = State.get<unknown>(stateName);
					targetProperty = propPath.join(".");
				} else {
					// Simple state or aliased state: "@counter" or "@count"
					// Check if it's an alias in props first
					if (props[stateRef]) {
						targetState = props[stateRef];
					} else {
						// Direct state reference
						targetState = State.get<unknown>(stateRef);
					}
				}
			}

			if (targetState) {
				// Determine the appropriate event type
				const eventType =
					property === "value" || property === "textContent"
						? "input"
						: property === "checked"
						? "change"
						: "input";

				element.addEventListener(eventType, () => {
					let newValue: unknown;
					if (property in element) {
						newValue = (element as any)[property];
					} else {
						newValue = element.getAttribute(property);
					}

					// Handle type conversion
					if (property === "checked") {
						newValue = Boolean(newValue);
					} else if (
						property === "value" &&
						element instanceof HTMLInputElement &&
						element.type === "number"
					) {
						const numValue = parseFloat(String(newValue));
						if (!isNaN(numValue)) {
							newValue = numValue;
						}
					}

					try {
						if (targetProperty) {
							// Update object property (e.g., user.name)
							const currentValue = targetState.value;
							if (
								typeof currentValue === "object" &&
								currentValue !== null
							) {
								const newStateValue = {
									...(currentValue as any),
								};
								const propPath = targetProperty.split(".");
								let current: any = newStateValue;
								for (let i = 0; i < propPath.length - 1; i++) {
									const propName = propPath[i];
									if (propName && current) {
										current = current[propName];
									}
								}
								const lastProp = propPath[propPath.length - 1];
								if (current && lastProp) {
									current[lastProp] = newValue;
									targetState.value = newStateValue;
								}
							}
						} else {
							// Update entire state
							targetState.value = newValue;
						}
					} catch (error) {
						console.warn(`Failed to update state:`, error);
					}
				});
			} else {
				console.warn(
					`[SYNC DEBUG] No target state found for ${processedExpression}`
				);
			}

			// Trigger initial evaluation
			newState.value;
		});

		// Create each State if each expression exists
		let eachState: State<Array<unknown>> | undefined;
		if (eachExpr) {
			// Parse data-each expression: "@items as item, index" or "@items as item"
			const eachMatch = eachExpr.match(
				/@([a-zA-Z_$][a-zA-Z0-9_.$]*)\s+as\s+(.+)/
			);
			if (eachMatch) {
				const [, stateRef] = eachMatch;
				// Get the array state directly
				const arrayState = State.get<Array<unknown>>(stateRef);
				if (arrayState) {
					eachState = arrayState;
				} else {
					console.warn(`State not found for: ${stateRef}`);
				}
			} else {
				console.warn(
					`Invalid data-each expression format: ${eachExpr}`
				);
			}
		}

		// Prepare async configuration
		const asyncConfig =
			awaitState || thenVar || catchVar || processMap || targetMap
				? {
						await: awaitState,
						then: thenVar,
						catch: catchVar,
						process: processMap,
						target: targetMap,
				  }
				: undefined;

		const regEl = new RegEl(
			element,
			props,
			showState,
			eachState,
			asyncConfig
		);

		// Process template interpolation for the element after RegEl creation
		RegEl.processTextInterpolation(element, props);

		return regEl;
	}

	// Getter for cached template content
	get cachedTemplateContent(): DocumentFragment | null {
		if (
			this._cachedContent &&
			this._cachedContent.nodeType === Node.DOCUMENT_FRAGMENT_NODE
		) {
			return this._cachedContent as DocumentFragment;
		} else if (this._cachedContent) {
			// Convert element to document fragment
			const fragment = document.createDocumentFragment();
			fragment.appendChild(this._cachedContent.cloneNode(true));
			return fragment;
		}
		return null;
	}

	// Getter for each state
	get each(): State<Array<unknown>> | undefined {
		return this._each;
	}

	// Getter for show state
	get show(): State<unknown> | undefined {
		return this._show;
	}

	// Async-related properties
	private _await?: State<Promise<unknown>>;
	private _then?: string;
	private _catch?: string;
	private _process?: Record<string, Function>;
	private _target?: Record<string, string>;
	private _awaitResults: Map<string, State<unknown>> = new Map(); // Store results by variable name

	constructor(
		private _element:
			| HTMLElement
			| SVGElement
			| MathMLElement
			| DocumentFragment,
		public props: Record<string, State<unknown>> = {},
		private _show?: State<unknown> | undefined,
		private _each?: State<Array<unknown>> | undefined,
		asyncConfig?: {
			await?: State<Promise<unknown>>;
			then?: string;
			catch?: string;
			process?: Record<string, Function>;
			target?: Record<string, string>;
		}
	) {
		const element = this._element as
			| HTMLElement
			| SVGElement
			| MathMLElement;
		this._cachedContent = element.cloneNode(true);

		// Initialize async properties
		this._await = asyncConfig?.await;
		this._then = asyncConfig?.then;
		this._catch = asyncConfig?.catch;
		this._process = asyncConfig?.process;
		this._target = asyncConfig?.target;

		// Initially hide all async elements (data-await, data-then, data-catch) except buttons
		// They will be shown/hidden appropriately when promises are set or resolve
		if (
			element.dataset["await"] &&
			(element as HTMLElement).tagName !== "BUTTON"
		) {
			console.log(
				"Initially hiding data-await element (will show when promise is active):",
				element
			);
			(element as HTMLElement).style.display = "none";
		}
		if (
			element.dataset["then"] &&
			!element.dataset["await"] &&
			(element as HTMLElement).tagName !== "BUTTON"
		) {
			console.log("Hiding data-then element:", element);
			(element as HTMLElement).style.display = "none";
			console.log(
				"✅ data-then element hidden, style:",
				(element as HTMLElement).style.display
			);
		}
		if (
			element.dataset["catch"] !== undefined &&
			!element.dataset["await"] &&
			(element as HTMLElement).tagName !== "BUTTON"
		) {
			console.log("Hiding data-catch element:", element);
			(element as HTMLElement).style.display = "none";
			console.log(
				"✅ data-catch element hidden, style:",
				(element as HTMLElement).style.display
			);
		}

		this._show?.effect(() => {
			(this._element as HTMLElement | SVGElement).style.display = this
				._show!.value
				? ""
				: "none";
		});

		// Trigger initial show effect by accessing the value
		if (this._show) {
			this._show.value;
		}

		// Handle each loop - element with data-each is the template that gets repeated
		this._each?.effect(() => {
			const eachArray = this._each!.value;
			if (!Array.isArray(eachArray)) {
				console.warn("Each value is not an array:", eachArray);
				return;
			}

			// Extract key and value names from data-each expression
			const eachExpr = (element as HTMLElement).dataset?.["each"] || "";
			const [, aliasExpr] = eachExpr.split(" as ");
			const aliases = aliasExpr?.split(",").map((s) => s.trim()) || [
				"item",
				"index",
			];
			const valName = aliases[0] || "item";
			const keyName = aliases[1] || "index";

			// Hide the original template element
			element.style.display = "none";

			// Efficiently update the DOM using diffing
			this._updateEachLoop(eachArray, valName, keyName, element);
		});

		// Trigger initial render by accessing the value
		if (this._each) {
			this._each.value;
		}

		// Handle async operations (data-await)
		if (this._await) {
			this._await.effect(() => {
				const promiseValue = this._await!.value;
				console.log(
					"🔍 Promise type check:",
					promiseValue,
					typeof promiseValue,
					promiseValue instanceof Promise
				);
				console.log(
					"🔍 Promise constructor:",
					promiseValue?.constructor?.name
				);
				console.log("🔍 Promise.then:", typeof promiseValue?.then);

				// If no promise is set, keep await elements hidden
				if (!promiseValue) {
					console.log(
						"⏸️ No promise set, keeping data-await element hidden"
					);
					(this._element as HTMLElement).style.display = "none";
					return;
				}

				// Extract the raw promise if it's wrapped in a proxy
				if (promiseValue instanceof Promise) {
					try {
						// Get the raw promise by checking if it has a target property (proxy indicator)
						const rawPromise =
							(promiseValue as any).__raw_promise__ ||
							promiseValue;

						// Create a new promise to avoid proxy issues
						const cleanPromise = new Promise((resolve, reject) => {
							// Use Promise.prototype.then directly to avoid proxy interference
							const thenMethod = Promise.prototype.then;
							const catchMethod = Promise.prototype.catch;

							thenMethod.call(rawPromise, resolve);
							catchMethod.call(rawPromise, reject);
						});
						console.log("✅ Created clean promise wrapper");
						this._handlePromise(cleanPromise, "await");
					} catch (error) {
						console.warn("⚠️ Error accessing promise:", error);
						// Fallback: try to handle the original promise directly
						try {
							this._handlePromise(promiseValue, "await");
						} catch (fallbackError) {
							console.error(
								"⚠️ Fallback also failed:",
								fallbackError
							);
						}
					}
				} else {
					console.warn("⚠️ Expected Promise but got:", promiseValue);
				}
			});

			// Trigger initial async effect
			this._await.value;
		}

		RegEl._registry.set(element, this);
	}

	/**
	 * Hide all async-related elements (then and catch) to prepare for new promise
	 */
	private _hideAllAsyncElements(): void {
		// Hide data-then elements
		if (this._then) {
			const thenElement = this._findThenElement();
			if (thenElement) {
				console.log(
					"🙈 Hiding previous data-then element:",
					thenElement
				);
				thenElement.style.display = "none";
			}
		}

		// Hide data-catch elements
		if (this._catch) {
			const catchElement = this._findCatchElement();
			if (catchElement) {
				console.log(
					"🙈 Hiding previous data-catch element:",
					catchElement
				);
				catchElement.style.display = "none";
			}
		}
	}

	/**
	 * Handle promise resolution for async operations
	 */
	private async _handlePromise(
		promise: Promise<unknown>,
		eventType: string = "await"
	): Promise<void> {
		const element = this._element as
			| HTMLElement
			| SVGElement
			| MathMLElement;

		console.log(
			`🔄 Starting promise handling for ${eventType}, element:`,
			element
		);
		console.log(
			"🔍 Received promise:",
			promise,
			typeof promise,
			promise instanceof Promise
		);

		try {
			// Hide all related async elements first (clean slate)
			this._hideAllAsyncElements();

			// Show await content (loading state)
			if (eventType === "await" && this._await) {
				console.log("📋 Showing loading content:", element);
				// The element with data-await shows its content during loading
				// Use 'block' to ensure it shows even if hidden by inline styles
				element.style.display = "block";
			}

			// Wait for promise to resolve
			console.log("⏳ Waiting for promise to resolve...");

			// Create a new promise to avoid proxy issues
			const cleanPromise = new Promise((resolve, reject) => {
				// Use Promise.prototype methods directly to avoid proxy interference
				try {
					const thenMethod = Promise.prototype.then;
					const catchMethod = Promise.prototype.catch;

					thenMethod.call(promise, resolve);
					catchMethod.call(promise, reject);
				} catch (proxyError) {
					console.warn(
						"⚠️ Proxy issue, trying fallback:",
						proxyError
					);
					// Fallback: try to extract raw promise or use directly
					try {
						promise.then(resolve).catch(reject);
					} catch (fallbackError) {
						const errorMessage =
							fallbackError instanceof Error
								? fallbackError.message
								: String(fallbackError);
						reject(
							new Error(
								`Promise handling failed: ${errorMessage}`
							)
						);
					}
				}
			});

			console.log("🔄 Using clean promise wrapper:", cleanPromise);

			let result = await cleanPromise;
			console.log("✅ Promise resolved with result:", result);

			// Apply processing function if it exists for this event type
			if (this._process && this._process[eventType]) {
				console.log(`🔧 Processing result with ${eventType} processor`);
				result = await this._process[eventType](result);
				console.log("🔧 Processed result:", result);
			}

			// Hide await content
			if (eventType === "await" && this._await) {
				console.log("🙈 Hiding loading content:", element);
				element.style.display = "none";
			}

			// Handle data-then by creating a state for the result
			if (this._then) {
				console.log(
					`🎯 Handling data-then with variable: ${this._then}`
				);
				const resultState = new State(result);
				this._awaitResults.set(this._then, resultState);

				// Check if the current element has data-then (same element)
				const currentElement = element as HTMLElement;
				const hasThenOnSelf =
					currentElement.dataset["then"] === this._then;

				console.log(
					`🔍 hasThenOnSelf: ${hasThenOnSelf} (current element has data-then="${currentElement.dataset["then"]}")`
				);

				// Always try to find a separate data-then element first
				const separateThenElement = this._findThenElement();

				// Use separate element if found, otherwise fall back to current element if it has data-then
				const thenElement =
					separateThenElement ||
					(hasThenOnSelf ? currentElement : null);

				console.log("🔍 Found data-then element:", thenElement);
				console.log(
					"🔍 Is separate element:",
					separateThenElement !== null
				);

				if (thenElement) {
					// Show the then element (always show separate elements, skip for same element)
					const isSeparateElement = separateThenElement !== null;
					if (isSeparateElement) {
						console.log(
							"👁️ Showing separate data-then element:",
							thenElement
						);
						console.log(
							`👁️ Before: display="${thenElement.style.display}"`
						);
						// Use 'block' to override any inline display:none styles
						thenElement.style.display = "block";
						console.log(
							`👁️ After: display="${thenElement.style.display}"`
						);
					} else {
						console.log(
							"⏩ Skipping display change for same element (no separate element found)"
						);
					}

					// Add the result state to props for the then element
					const thenRegEl = RegEl._registry.get(thenElement);
					if (thenRegEl) {
						console.log("🔗 Adding result to existing RegEl props");
						thenRegEl.props[this._then] = resultState;
						// Process template interpolation directly instead of re-registering
						RegEl.processTextInterpolation(
							thenElement,
							thenRegEl.props
						);
					} else {
						// If no RegEl exists, create one with the result state
						console.log(
							"🆕 Creating new RegEl for data-then element"
						);
						const props: Record<string, State<unknown>> = {};
						props[this._then] = resultState;
						new RegEl(thenElement, props);
						// Process template interpolation for the new element
						RegEl.processTextInterpolation(thenElement, props);
					}
				} else {
					console.warn(
						"⚠️ No data-then element found for variable:",
						this._then
					);
				}
			}

			// Handle data-target
			if (this._target && this._target[eventType]) {
				const targetSelector = this._target[eventType];
				const targetElement = document.querySelector(
					targetSelector
				) as HTMLElement;
				if (targetElement) {
					this._updateTargetElement(targetElement, result);
				}
			}
		} catch (error) {
			console.error("❌ Promise rejected with error:", error);

			// Hide loading content if it exists
			if (eventType === "await" && this._await) {
				console.log("🔒 Hiding loading element on error:", element);
				element.style.display = "none";
			}

			// Handle data-catch by creating a state for the error
			if (this._catch) {
				console.log(
					`🎯 Handling data-catch with variable: ${this._catch}`
				);
				const errorState = new State(error);
				this._awaitResults.set(this._catch, errorState);

				// Find data-catch element
				const catchElement = this._findCatchElement();
				console.log("🔍 Found data-catch element:", catchElement);
				if (catchElement) {
					// Show the catch element
					console.log("👁️ Showing data-catch element:", catchElement);
					// Use 'block' to override any inline display:none styles
					catchElement.style.display = "block";

					// Add the error state to props for the catch element
					const catchRegEl = RegEl._registry.get(catchElement);
					if (catchRegEl) {
						console.log("🔗 Adding error to existing RegEl props");
						catchRegEl.props[this._catch] = errorState;
						// Process template interpolation directly instead of re-registering
						RegEl.processTextInterpolation(
							catchElement,
							catchRegEl.props
						);
					} else {
						// If no RegEl exists, create one with the error state
						console.log(
							"🆕 Creating new RegEl for data-catch element"
						);
						const props: Record<string, State<unknown>> = {};
						props[this._catch] = errorState;
						new RegEl(catchElement, props);
						// Process template interpolation for the new element
						RegEl.processTextInterpolation(catchElement, props);
					}
				} else {
					console.warn(
						"⚠️ No data-catch element found for variable:",
						this._catch
					);
				}
			}
		}
	}

	/**
	 * Find the data-then element with matching variable name (but not data-await)
	 */
	private _findThenElement(): HTMLElement | null {
		if (!this._then) return null;

		const element = this._element as HTMLElement;
		let sibling = element.nextElementSibling;

		console.log(
			`🔍 Looking for data-then="${this._then}" element starting from:`,
			element
		);

		while (sibling) {
			const siblingElement = sibling as HTMLElement;
			const siblingThen = siblingElement.dataset["then"];
			const siblingAwait = siblingElement.dataset["await"];

			console.log(
				`🔍 Checking sibling:`,
				siblingElement,
				`data-then="${siblingThen}", data-await="${siblingAwait}"`
			);

			// Find data-then element that matches our variable but doesn't have data-await
			if (siblingThen === this._then && !siblingAwait) {
				console.log(
					`✅ Found matching data-then element:`,
					siblingElement
				);
				return siblingElement;
			}
			sibling = sibling.nextElementSibling;
		}

		console.log(
			`❌ No matching data-then element found for variable: ${this._then}`
		);
		return null;
	}

	/**
	 * Find the data-catch element with matching variable name (but not data-await)
	 */
	private _findCatchElement(): HTMLElement | null {
		if (!this._catch) return null;

		const element = this._element as HTMLElement;
		let sibling = element.nextElementSibling;

		while (sibling) {
			const siblingElement = sibling as HTMLElement;
			const siblingCatch = siblingElement.dataset["catch"];
			const siblingAwait = siblingElement.dataset["await"];

			// Find data-catch element that matches our variable but doesn't have data-await
			if (siblingCatch === this._catch && !siblingAwait) {
				return siblingElement;
			}
			sibling = sibling.nextElementSibling;
		}

		return null;
	}

	/**
	 * Update target element with the result
	 */
	private _updateTargetElement(
		targetElement: HTMLElement,
		result: unknown
	): void {
		console.log(
			"🎯 Updating target element:",
			targetElement,
			"with result:",
			result
		);

		// Check if target element has data-bind="innerHTML: variableName"
		const bindAttr = targetElement.dataset["bind"];
		if (bindAttr && bindAttr.includes("innerHTML:")) {
			// Direct HTML insertion
			console.log("📝 Using innerHTML update");
			targetElement.innerHTML = String(result || "");
		} else {
			// Simple text content update
			console.log("📝 Using textContent update");
			targetElement.textContent = String(result || "");

			// Alternative: Try to register as normal Manifold element with the result
			// const targetRegEl = RegEl._registry.get(targetElement);
			// if (targetRegEl && this._then) {
			// 	targetRegEl.props[this._then] = new State(result);
			// 	RegEl.processTextInterpolation(targetElement, targetRegEl.props);
			// }
		}
	}

	/**
	 * Efficiently update the each loop DOM by comparing the new array with the previous one
	 * Only updates elements that have actually changed
	 */
	private _updateEachLoop(
		newArray: Array<unknown>,
		valName: string,
		keyName: string,
		templateElement: HTMLElement | SVGElement | MathMLElement
	): void {
		const parent = templateElement.parentElement;
		if (!parent) return;

		// If it's the first render or the array lengths differ significantly, do a full rebuild
		if (
			this._eachClones.length === 0 ||
			Math.abs(newArray.length - this._previousEachArray.length) >
				newArray.length / 2
		) {
			this._fullRebuildEachLoop(
				newArray,
				valName,
				keyName,
				templateElement
			);
			return;
		}

		// Perform efficient diffing
		const oldArray = this._previousEachArray;
		const changes: Array<{
			type: "keep" | "update" | "add" | "remove";
			oldIndex?: number;
			newIndex: number;
			value: unknown;
		}> = [];

		// Find what changed using a simple diff algorithm
		for (let newIndex = 0; newIndex < newArray.length; newIndex++) {
			const newValue = newArray[newIndex];
			let foundIndex = -1;

			// Look for this value in the old array
			for (let oldIndex = 0; oldIndex < oldArray.length; oldIndex++) {
				if (isEqual(oldArray[oldIndex], newValue)) {
					foundIndex = oldIndex;
					break;
				}
			}

			if (foundIndex !== -1) {
				// Found the same value - check if it moved
				const existingClone = this._eachClones[foundIndex];
				if (existingClone && foundIndex === newIndex) {
					// Same position, just update index
					changes.push({
						type: "keep",
						oldIndex: foundIndex,
						newIndex,
						value: newValue,
					});
				} else {
					// Moved or different position, update it
					changes.push({
						type: "update",
						oldIndex: foundIndex,
						newIndex,
						value: newValue,
					});
				}
			} else {
				// New item
				changes.push({ type: "add", newIndex, value: newValue });
			}
		}

		// Handle removals (items in old array but not in new array)
		for (let oldIndex = 0; oldIndex < oldArray.length; oldIndex++) {
			const oldValue = oldArray[oldIndex];
			let found = false;
			for (const newValue of newArray) {
				if (isEqual(oldValue, newValue)) {
					found = true;
					break;
				}
			}
			if (!found) {
				changes.push({
					type: "remove",
					oldIndex,
					newIndex: -1,
					value: oldValue,
				});
			}
		}

		// Apply changes efficiently
		const newClones: Array<
			| {
					element: HTMLElement;
					regEl: RegEl;
					value: unknown;
					index: number;
			  }
			| undefined
		> = new Array(newArray.length);
		const elementsToRemove: HTMLElement[] = [];

		// Process removes first
		for (const change of changes) {
			if (change.type === "remove" && change.oldIndex !== undefined) {
				const clone = this._eachClones[change.oldIndex];
				if (clone) {
					elementsToRemove.push(clone.element);
				}
			}
		}

		// Remove elements from DOM
		elementsToRemove.forEach((element) => element.remove());

		// Process keeps and updates first (preserve existing elements)
		for (const change of changes) {
			if (change.type === "keep" && change.oldIndex !== undefined) {
				// Just update the index
				const clone = this._eachClones[change.oldIndex];
				if (clone) {
					this._updateCloneIndex(clone, change.newIndex);
					newClones[change.newIndex] = {
						...clone,
						index: change.newIndex,
					};
				}
			} else if (
				change.type === "update" &&
				change.oldIndex !== undefined
			) {
				// Update value and index
				const clone = this._eachClones[change.oldIndex];
				if (clone) {
					this._updateCloneValue(
						clone,
						change.value,
						change.newIndex
					);
					newClones[change.newIndex] = {
						...clone,
						value: change.value,
						index: change.newIndex,
					};
				}
			}
		}

		// Now process adds in order from 0 to newArray.length-1
		const addChanges = changes
			.filter((c) => c.type === "add")
			.sort((a, b) => a.newIndex - b.newIndex);
		for (const change of addChanges) {
			// Create new element
			const newClone = this._createCloneForValue(
				change.value,
				change.newIndex,
				valName,
				keyName,
				templateElement
			);
			if (newClone) {
				newClones[change.newIndex] = newClone;
			}
		}

		// Now reinsert all elements in the correct order
		for (let i = 0; i < newClones.length; i++) {
			const clone = newClones[i];
			if (clone) {
				// Find the position to insert this element
				const insertReferenceNode = this._findInsertPosition(
					i,
					newClones,
					templateElement
				);

				// Check if element is already in the DOM at the correct position
				const isAlreadyInCorrectPosition =
					clone.element.parentNode &&
					clone.element.nextSibling === insertReferenceNode;

				// Only insert if it's not already in the right position
				if (!isAlreadyInCorrectPosition) {
					if (insertReferenceNode) {
						parent.insertBefore(clone.element, insertReferenceNode);
					} else {
						parent.appendChild(clone.element);
					}
				}
			}
		}

		// Update our tracking arrays
		this._eachClones = newClones.filter(
			(
				clone
			): clone is {
				element: HTMLElement;
				regEl: RegEl;
				value: unknown;
				index: number;
			} => clone !== undefined
		);
		this._previousEachArray = [...newArray]; // Copy the array
	}

	/**
	 * Full rebuild of the each loop when diffing is not efficient
	 */
	private _fullRebuildEachLoop(
		newArray: Array<unknown>,
		valName: string,
		keyName: string,
		templateElement: HTMLElement | SVGElement | MathMLElement
	): void {
		const parent = templateElement.parentElement;
		if (!parent) return;

		// Remove all existing clones
		this._eachClones.forEach((clone) => clone.element.remove());
		this._eachClones = [];

		if (newArray.length === 0) {
			this._previousEachArray = [];
			return;
		}

		// Create new clones for each item
		let insertReferenceNode = templateElement.nextSibling;
		for (let i = 0; i < newArray.length; i++) {
			const value = newArray[i];
			const clone = this._createCloneForValue(
				value,
				i,
				valName,
				keyName,
				templateElement
			);
			if (clone) {
				parent.insertBefore(clone.element, insertReferenceNode);
				// Update the reference node to insert the next element after this one
				insertReferenceNode = clone.element.nextSibling;
				this._eachClones.push(clone);
			}
		}

		this._previousEachArray = [...newArray];
	}

	/**
	 * Create a new cloned element for a specific array value
	 */
	private _createCloneForValue(
		value: unknown,
		index: number,
		valName: string,
		keyName: string,
		templateElement: HTMLElement | SVGElement | MathMLElement
	): {
		element: HTMLElement;
		regEl: RegEl;
		value: unknown;
		index: number;
	} | null {
		// Clone the template element
		const clonedElement = templateElement.cloneNode(true) as HTMLElement;

		// Mark as clone and remove the data-each attribute to prevent recursive processing
		clonedElement.setAttribute("data-mf-each-clone", "true");
		clonedElement.removeAttribute("data-each");
		clonedElement.style.display = ""; // Ensure clone is visible

		// Create props for this iteration
		const iterationProps: Record<string, State<unknown>> = {};

		// Only inherit props that don't conflict with iteration aliases
		for (const [key, state] of Object.entries(this.props)) {
			if (key !== keyName && key !== valName) {
				iterationProps[key] = state;
			}
		}

		// Add iteration-specific props
		iterationProps[keyName] = new State(index);
		iterationProps[valName] = new State(value);

		// Create a RegEl for the cloned element with iteration props
		const cloneRegEl = new RegEl(clonedElement, iterationProps);

		// Set up data-bind expressions for the cloned element
		this._setupCloneBindings(clonedElement, iterationProps);

		return {
			element: clonedElement,
			regEl: cloneRegEl,
			value,
			index,
		};
	}

	/**
	 * Update the index of an existing clone
	 */
	private _updateCloneIndex(
		clone: {
			element: HTMLElement;
			regEl: RegEl;
			value: unknown;
			index: number;
		},
		newIndex: number
	): void {
		// Find the keyName from the clone's regEl props
		for (const [, state] of Object.entries(clone.regEl.props)) {
			if (
				typeof state.value === "number" &&
				state.value === clone.index
			) {
				// This is likely the index state
				state.value = newIndex;
				break;
			}
		}
	}

	/**
	 * Update both value and index of an existing clone
	 */
	private _updateCloneValue(
		clone: {
			element: HTMLElement;
			regEl: RegEl;
			value: unknown;
			index: number;
		},
		newValue: unknown,
		newIndex: number
	): void {
		// Update both value and index states
		for (const [, state] of Object.entries(clone.regEl.props)) {
			if (
				typeof state.value === "number" &&
				state.value === clone.index
			) {
				// This is the index state
				state.value = newIndex;
			} else if (isEqual(state.value, clone.value)) {
				// This is the value state
				state.value = newValue;
			}
		}
	}

	/**
	 * Find the correct insertion position for a new element
	 */
	private _findInsertPosition(
		targetIndex: number,
		clones: Array<
			| {
					element: HTMLElement;
					regEl: RegEl;
					value: unknown;
					index: number;
			  }
			| undefined
		>,
		templateElement: HTMLElement | SVGElement | MathMLElement
	): Node | null {
		// If inserting at the beginning, insert after the template
		if (targetIndex === 0) {
			return templateElement.nextSibling;
		}

		// Look for the previous existing element before this position
		for (let i = targetIndex - 1; i >= 0; i--) {
			if (clones[i]) {
				return clones[i]!.element.nextSibling;
			}
		}

		// If no element found before, insert after template
		return templateElement.nextSibling;
	}

	/**
	 * Process template interpolation in element text content
	 */
	private static processTextInterpolation(
		element: HTMLElement | SVGElement | MathMLElement,
		props: Record<string, State<unknown>>
	): void {
		console.log("🔤 Processing text interpolation for element:", element);
		console.log("🔤 Available props:", Object.keys(props), props);

		// Process text content for template interpolation
		const processTextContent = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE && node.textContent) {
				// Store original template if not already stored
				if (!(node as any)._originalTemplate) {
					(node as any)._originalTemplate = node.textContent;
				}

				const originalText = (node as any)._originalTemplate;
				console.log("🔤 Processing text node:", originalText);

				if (originalText.includes("${")) {
					// Create a state that updates the text content based on interpolated variables
					const updateText = () => {
						const context = RegEl.createContext(props);
						console.log("🔤 Context for interpolation:", context);
						let newText = originalText;

						// Replace all interpolations
						newText = newText.replace(
							/\$\{([^}]+)\}/g,
							(match: string, expression: string) => {
								console.log(
									`🔤 Evaluating expression: "${expression}"`
								);
								try {
									const evaluator = evaluateExpression(
										expression.trim()
									);
									const result = evaluator.fn(context);
									console.log(
										`🔤 Expression result:`,
										result
									);
									return String(result ?? "");
								} catch (error) {
									console.warn(
										`Template interpolation error for "${expression}":`,
										error
									);
									return match; // Return original if error
								}
							}
						);

						console.log(`🔤 Final text: "${newText}"`);
						node.textContent = newText;
					};

					// Create states for all referenced variables and set up effects
					const referencedVars = new Set<string>();
					let match;
					const regex = /\$\{([^}]+)\}/g;
					while ((match = regex.exec(originalText)) !== null) {
						const expression = match[1]?.trim();
						if (expression) {
							try {
								const evaluator =
									evaluateExpression(expression);
								evaluator.stateRefs.forEach((ref) =>
									referencedVars.add(ref)
								);
							} catch (error) {
								// Ignore parsing errors for now
							}
						}
					}

					// Set up effects for all referenced states
					referencedVars.forEach((varName) => {
						const state = props[varName];
						if (state) {
							state.effect(() => {
								updateText();
							});
						}
					});

					// Initial update
					updateText();
				}
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				// Recursively process child nodes
				Array.from(node.childNodes).forEach((child) =>
					processTextContent(child)
				);
			}
		};

		processTextContent(element);
	}

	/**
	 * Set up data-bind expressions for a cloned element
	 */
	private _setupCloneBindings(
		clonedElement: HTMLElement,
		iterationProps: Record<string, State<unknown>>
	): void {
		// Handle data-bind expressions for the cloned element and all its descendants
		const elementsWithBind = [
			clonedElement,
			...Array.from(clonedElement.querySelectorAll("[data-bind]")),
		];

		elementsWithBind.forEach((element) => {
			const bindAttr = (element as HTMLElement).dataset?.["bind"];
			if (!bindAttr) return;

			const bindExpressions = RegEl.splitBindExpressions(bindAttr);

			bindExpressions.forEach((binding) => {
				const parsed = RegEl.parseBinding(binding);
				if (!parsed) return;
				const { property, expr } = parsed;

				const processedExpr = expr;

				const exprResult = evaluateExpression(processedExpr);

				// Create a state that evaluates the bind expression with iteration props context
				const newState = computed(() => {
					const context = RegEl.createContext(iterationProps);
					const result = exprResult.fn(context);
					return result;
				});

				// Set up the effect to update the property
				newState?.effect(() => {
					RegEl.setElementProperty(
						element as HTMLElement,
						property,
						newState.value
					);
				});

				// Trigger initial evaluation
				newState.value;
			});
		});
	}
}
