// Enhanced State system with View Transitions integration
import { ManifoldTransitions } from "./transition-router.js";

export class State<T> {
	private _value: T;
	private _effects: (() => void)[] = [];

	constructor(initialValue: T) {
		this._value = initialValue;
	}

	get value(): T {
		return this._value;
	}

	set value(newValue: T) {
		const oldValue = this._value;
		this._value = newValue;

		// Enhanced: Run effects with optional View Transitions
		this._runEffectsWithTransitions(oldValue, newValue);
	}

	effect(callback: () => void) {
		this._effects.push(callback);
		callback(); // Run immediately
	}

	private _runEffectsWithTransitions(oldValue: T, newValue: T) {
		// Find elements that might be affected by this state change
		const affectedElements = this._findAffectedElements();

		if (affectedElements.length > 0) {
			// Use View Transitions API if available
			ManifoldTransitions.stateEffect(() => {
				this._effects.forEach((effect) => effect());
			}, affectedElements[0]); // Pass first affected element
		} else {
			// No affected elements, just run effects normally
			this._effects.forEach((effect) => effect());
		}
	}

	private _findAffectedElements(): Element[] {
		// This would be enhanced to track which elements
		// are bound to this state instance
		// For now, return elements with view-transition-name
		return Array.from(
			document.querySelectorAll('[style*="view-transition-name"]')
		);
	}

	// Static helper for creating computed states with transitions
	static createComputed<T>(computeFn: () => T): State<T> {
		const state = new State(computeFn());

		// Re-compute and update with transitions when dependencies change
		// (This would be more sophisticated in real implementation)
		return state;
	}
}

// Enhanced registry integration
export class RegEl {
	// ... existing code ...

	#setProp = (prop: string, value: unknown, element?: Element) => {
		// Check if this property change should use View Transitions
		const shouldTransition =
			element &&
			element.style.viewTransitionName &&
			element.style.viewTransitionName !== "none";

		if (shouldTransition) {
			ManifoldTransitions.stateEffect(() => {
				this._applyProperty(prop, value);
			}, element);
		} else {
			// Apply classes for users who prefer class-based transitions
			if (element) {
				element.classList.add("mf-transitioning");
				setTimeout(() => {
					element.classList.remove("mf-transitioning");
				}, ManifoldTransitions.getTransitionDuration());
			}

			this._applyProperty(prop, value);
		}
	};

	private _applyProperty(prop: string, value: unknown) {
		if (prop in this.#element) {
			(this.#element as any)[prop] = value;
		} else {
			this.#element.setAttribute(prop, String(value ?? ""));
		}
	}
}
