import { isEqual } from "./equality";

const arrayMutatingMethods = new Set([
	"push",
	"pop",
	"shift",
	"unshift",
	"splice",
	"sort",
	"reverse",
]);
let currentEffect: Effect | null = null;
const MAX_UPDATE_DEPTH = 100;
const updateStack = new Set<Effect>();
let updateDepth = 0;
let isFlushingEffects = false;
let pendingEffects = new Set<Effect>();
let batchDepth = 0;
let isProcessingBatch = false;
const reusableTriggeredSet = new Set<Effect>();

const flushPendingEffects = () => {
	if (isFlushingEffects || pendingEffects.size === 0) return;
	isFlushingEffects = true;
	try {
		while (pendingEffects.size > 0 && batchDepth < 10) {
			``;
			batchDepth++;
			const effectsToRun = new Set(pendingEffects);
			pendingEffects.clear();
			for (const effect of effectsToRun) {
				if (effect._isActive) effect._runImmediate();
			}
		}
		if (batchDepth >= 10) pendingEffects.clear();
	} finally {
		isFlushingEffects = false;
		batchDepth = 0;
		isProcessingBatch = false;
	}
};

const processEffectsBatched = () => {
	if (pendingEffects.size === 0 || isProcessingBatch) return;
	isProcessingBatch = true;
	flushPendingEffects();
};

class Effect {
	private _dependencies = new Set<() => void>();
	public _isActive = true;
	private _isRunning = false;

	constructor(private fn: () => void) {}

	_run() {
		if (!this._isActive) return;
		if (isFlushingEffects) {
			pendingEffects.add(this);
			return;
		}
		this._runImmediate();
	}

	_runImmediate() {
		if (
			!this._isActive ||
			updateStack.has(this) ||
			this._isRunning ||
			updateDepth >= MAX_UPDATE_DEPTH
		)
			return;

		this._isRunning = true;
		updateStack.add(this);
		updateDepth++;

		this._dependencies.forEach((cleanup) => cleanup());
		this._dependencies.clear();

		const prevEffect = currentEffect;
		currentEffect = this;
		try {
			this.fn();
		} finally {
			currentEffect = prevEffect;
			this._isRunning = false;
			updateStack.delete(this);
			updateDepth--;
		}
	}

	_addDependency(cleanup: () => void) {
		this._dependencies.add(cleanup);
	}

	_stop() {
		this._isActive = false;
		this._dependencies.forEach((cleanup) => cleanup());
		this._dependencies.clear();
	}
}

export class State<T = unknown> {
	public name: string;
	private _value: T;
	private _reactive: T;
	private _derive?: () => T;
	private _effects = new Set<Effect>();
	private _granularEffects = new Map<string | symbol, Set<Effect>>();
	private _effectToKeys = new Map<Effect, Set<string | symbol>>();
	private _effectToLastKey = new Map<Effect, string | symbol>();

	private static reg = new Map<string, State<unknown>>();

	constructor(value: T, name?: string) {
		this.name = name ?? Math.random().toString(36).substring(2, 15);
		this._value = value;
		this._reactive = this._createProxy(value);
	}

	// Internal constructor for computed states
	static _createComputed<T>(deriveFn: () => T, name?: string): State<T> {
		const state = Object.create(State.prototype) as State<T>;
		state.name = name ?? Math.random().toString(36).substring(2, 15);
		state._derive = deriveFn;
		state._value = undefined as any;
		state._reactive = undefined as any;
		state._effects = new Set<Effect>();
		state._granularEffects = new Map<string | symbol, Set<Effect>>();
		state._effectToKeys = new Map<Effect, Set<string | symbol>>();
		state._effectToLastKey = new Map<Effect, string | symbol>();

		new Effect(() => state._updateValue())._runImmediate();
		return state;
	}

	static get<T>(name?: string): State<T> | undefined {
		return name ? (this.reg.get(name) as State<T> | undefined) : undefined;
	}

	static register<T>(name: string, state: State<T>): void {
		this.reg.set(name, state);
	}

	private _updateValue() {
		const newValue = this._derive ? this._derive() : this._value;
		if (!isEqual(this._value, newValue)) {
			const oldValue = this._value;
			this._value = newValue;
			this._reactive = this._createProxy(newValue);
			this._triggerEffects(oldValue);
		}
	}

	private _createProxy(
		obj: T,
		parent?: { state: State<any>; key: string | symbol }
	): T {
		if (!obj || typeof obj !== "object") return obj;

		// Don't proxy Promises - they have special native methods that break with proxies
		if (obj instanceof Promise) return obj;

		const commonProxyHandler: ProxyHandler<any> = {
			get: (target, key) => {
				this._track(key);
				const value = Reflect.get(target, key);
				return typeof value === "object" && value !== null
					? this._createProxy(value as any, { state: this, key })
					: value;
			},
			set: (target, key, value) => {
				if (isEqual(Reflect.get(target, key), value)) return true;
				const result = Reflect.set(target, key, value);
				if (result) {
					this._triggerGranularEffects(key);
					if (parent) {
						parent.state._triggerGranularEffects(parent.key);
					} else {
						// Trigger general effects (those that watch the whole state)
						// but exclude those that are already handled by granular effects
						const granularEffectsForKey =
							this._granularEffects.get(key);
						for (const effect of this._effects) {
							if (effect._isActive) {
								const effectKeys =
									this._effectToKeys.get(effect);
								// Only trigger if this effect has no granular dependencies
								// (i.e., it's a pure general effect watching the whole state)
								if (!effectKeys || effectKeys.size === 0) {
									// Skip if already triggered by granular effects
									if (
										!granularEffectsForKey ||
										!granularEffectsForKey.has(effect)
									) {
										pendingEffects.add(effect);
									}
								}
							}
						}
					}
					processEffectsBatched();
				}
				return result;
			},
		};

		if (obj instanceof Map || obj instanceof Set) {
			return new Proxy(obj, {
				...commonProxyHandler,
				get: (target, key) => {
					this._track(key);
					const value = Reflect.get(target, key);
					return typeof value === "function"
						? value.bind(target)
						: typeof value === "object" && value !== null
						? this._createProxy(value as any, { state: this, key })
						: value;
				},
			}) as T;
		}

		if (Array.isArray(obj)) {
			return new Proxy(obj, {
				...commonProxyHandler,
				get: (target, key) => {
					this._track(key); // Track both direct index access and method access
					const value = Reflect.get(target, key);
					if (
						typeof value === "function" &&
						arrayMutatingMethods.has(key as string)
					) {
						return (...args: any[]) => {
							const oldLength = target.length;
							const result = (value as Function).apply(
								target,
								args
							);
							const newLength = target.length;
							const effectsToProcess = new Set<Effect>();

							if (oldLength !== newLength) {
								this._addEffectsToSet(
									effectsToProcess,
									this._granularEffects.get("length")
								);
								this._addEffectsToSet(
									effectsToProcess,
									this._effects
								);
							} else {
								for (let i = 0; i < target.length; i++) {
									this._addEffectsToSet(
										effectsToProcess,
										this._granularEffects.get(String(i))
									);
								}
								this._addEffectsToSet(
									effectsToProcess,
									this._effects
								);
							}

							if (parent) {
								this._addEffectsToSet(
									effectsToProcess,
									parent.state._granularEffects.get(
										parent.key
									)
								);
							}

							effectsToProcess.forEach((effect) =>
								pendingEffects.add(effect)
							);
							processEffectsBatched();
							return result;
						};
					}
					return typeof value === "object" && value !== null
						? this._createProxy(value as any, { state: this, key })
						: value;
				},
			}) as T;
		}

		return new Proxy(obj, commonProxyHandler) as T;
	}

	private _addEffectsToSet(
		targetSet: Set<Effect>,
		sourceSet?: Set<Effect> | Iterable<Effect>
	) {
		if (!sourceSet) return;
		for (const effect of sourceSet) {
			if (effect._isActive) {
				targetSet.add(effect);
			}
		}
	}

	private _track(key: string | symbol) {
		const effect = currentEffect;
		if (!effect) return;

		this._effectToLastKey.set(effect, key);

		let granularEffects = this._granularEffects.get(key);
		if (!granularEffects) {
			granularEffects = new Set();
			this._granularEffects.set(key, granularEffects);
		}

		if (!granularEffects.has(effect)) {
			granularEffects.add(effect);

			if (!this._effectToKeys.has(effect)) {
				this._effectToKeys.set(effect, new Set());
			}
			this._effectToKeys.get(effect)!.add(key);

			effect._addDependency(() => {
				granularEffects!.delete(effect);
				const keySet = this._effectToKeys.get(effect);
				if (keySet) {
					keySet.delete(key);
					if (keySet.size === 0) {
						this._effectToKeys.delete(effect);
						this._effects.delete(effect); // Only delete from _effects if no more granular keys
					}
				}
				if (granularEffects!.size === 0) {
					this._granularEffects.delete(key);
				}
				this._effectToLastKey.delete(effect);
			});
		}
	}

	private _triggerEffects(oldValue: T) {
		reusableTriggeredSet.clear();
		this._addEffectsToSet(reusableTriggeredSet, this._effects);

		// Only trigger granular effects for properties that have actually changed
		if (
			oldValue &&
			typeof oldValue === "object" &&
			this._value &&
			typeof this._value === "object"
		) {
			for (const [key, effects] of this._granularEffects.entries()) {
				const oldPropValue = (oldValue as any)[key];
				const newPropValue = (this._value as any)[key];
				if (!isEqual(oldPropValue, newPropValue)) {
					this._addEffectsToSet(reusableTriggeredSet, effects);
				}
			}
		} else {
			// If not objects, trigger all granular effects
			for (const effects of this._granularEffects.values()) {
				this._addEffectsToSet(reusableTriggeredSet, effects);
			}
		}

		reusableTriggeredSet.forEach((effect) => pendingEffects.add(effect));
		processEffectsBatched();
	}

	private _triggerGranularEffects(key: string | symbol) {
		const granularEffects = this._granularEffects.get(key);
		if (granularEffects) {
			granularEffects.forEach((effect) => {
				if (
					effect._isActive &&
					this._effectToLastKey.get(effect) === key
				) {
					pendingEffects.add(effect);
				}
			});
		}
		processEffectsBatched();
	}

	get value(): T {
		const effect = currentEffect;
		if (effect && !this._effects.has(effect)) {
			this._effects.add(effect);
			effect._addDependency(() => this._effects.delete(effect));
		}
		return this._reactive;
	}

	set value(newValue: T) {
		if (this._derive) return;
		if (!isEqual(this._value, newValue)) {
			const oldValue = this._value;
			this._value = newValue;
			this._reactive = this._createProxy(newValue);
			this._triggerEffects(oldValue);
		}
	}

	effect(fn: () => void) {
		const effect = new Effect(fn);
		effect._runImmediate();
		return () => effect._stop();
	}
}
