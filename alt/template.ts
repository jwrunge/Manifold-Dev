import { State } from "../src/State";

const _warnOnExtraClause = (attr: string, element: RegisterableEl) => {
	console.warn(`Ignoring processing clause on ${attr}`, element);
};

export class RegEl {
	static #registry = new WeakMap<Element, RegEl>();
	readonly _cachedContent: RegisterableEl | null = null;
	_show?: State<unknown>;
	_each?: State<unknown[]>;
	public props: Props = {};

	constructor(private _element: RegisterableEl) {

// Warn if multiconditional
if (
	[exps.has("if"), exps.has("elseif"), exps.has("else")].filter(Boolean)
		.length > 1
) {
	console.warn(`Multiple conditional attributes; using "if"`, _element);
}

// Handle conditional rendering
const isElse = _element.hasAttribute("data-else");

// Warn if orphan conditionals
if (exps.has("elseif") || isElse) {
	let hasConditionalChain = false;
	let prev = _element.previousElementSibling;
	while (
		prev &&
		(prev.hasAttribute("data-if") || prev.hasAttribute("data-elseif"))
	) {
		hasConditionalChain = true;
		if (prev.hasAttribute("data-if")) break;
		prev = prev.previousElementSibling;
	}
	if (!hasConditionalChain) {
		console.warn(
			`Orphan ${
				isElse ? "data-else" : "data-elseif"
			} without preceding data-if`,
			_element
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
				const show = RegEl.#registry.get(cond as Element)?._show;
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
				if (catchExp.at(1)) _warnOnExtraClause("catch", _element);

				// Pass the error as a prop
				const catchProps = { ...this.props, $error: error };
				catchExp.at(0)?.(catchProps);
			} else {
				console.error("Unhandled async error:", error, _element);
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

this._each = computed(() => exps.get("each")?.[0]?.(this.props) ?? []) as State<
	unknown[]
>;

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
					highestValidIndex = Math.max(highestValidIndex, index);
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
