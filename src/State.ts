import isEqual from "./equality";

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
const ROOT_KEY = Symbol("root");

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
	#dependencies = new Set<() => void>();
	public _isActive = true;
	#isRunning = false;

	constructor(public fn: () => void) {}

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
			this.#isRunning ||
			updateDepth >= MAX_UPDATE_DEPTH
		)
			return;

		this.#isRunning = true;
		updateStack.add(this);
		updateDepth++;

		this.#dependencies.forEach((cleanup) => cleanup());
		this.#dependencies.clear();

		const prevEffect = currentEffect;
		currentEffect = this;
		try {
			this.fn();
		} finally {
			currentEffect = prevEffect;
			this.#isRunning = false;
			updateStack.delete(this);
			updateDepth--;
		}
	}

	_addDependency(cleanup: () => void) {
		this.#dependencies.add(cleanup);
	}

	_stop() {
		this._isActive = false;
		this.#dependencies.forEach((cleanup) => cleanup());
		this.#dependencies.clear();
	}
}

export class State<T = unknown> {
	public name: string;
	#value: T;
	#reactive: T;
	#derive?: () => T;
	#granularEffects = new Map<string | symbol, Set<Effect>>();
	#effectToLastKey = new Map<Effect, string | symbol>();

	static #reg = new Map<string, State<unknown>>();

	constructor(value: T, name?: string) {
		this.name = name ?? Math.random().toString(36).substring(2, 15);
		this.#value = value;
		this.#reactive = this._createProxy(value);
	}

	// Internal constructor for computed states
	static _createComputed<T>(deriveFn: () => T, name?: string): State<T> {
		const state = Object.create(State.prototype) as State<T>;
		state.name = name ?? Math.random().toString(36).substring(2, 15);
		state.#derive = deriveFn;
		state.#value = undefined as any;
		state.#reactive = undefined as any;
		state.#granularEffects = new Map<string | symbol, Set<Effect>>();
		state.#effectToLastKey = new Map<Effect, string | symbol>();

		new Effect(() => state._updateValue())._runImmediate();
		return state;
	}

	static get<T>(name?: string): State<T> | undefined {
		return name ? (this.#reg.get(name) as State<T> | undefined) : undefined;
	}

	static register<T>(name: string, state: State<T>): void {
		this.#reg.set(name, state);
	}

	_updateValue() {
		const newValue = this.#derive ? this.#derive() : this.#value;
		if (!isEqual(this.#value, newValue)) {
			const oldValue = this.#value;
			this.#value = newValue;
			this.#reactive = this._createProxy(newValue);
			this._triggerEffects(oldValue);
		}
	}

	_createProxy(
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
								if (this.#granularEffects.get("length"))
									for (const effect of this.#granularEffects.get(
										"length"
									)!)
										if (effect._isActive)
											effectsToProcess.add(effect);
							} else {
								for (let i = 0; i < target.length; i++) {
									const effects = this.#granularEffects.get(
										String(i)
									);
									if (effects)
										for (const effect of effects)
											if (effect._isActive)
												effectsToProcess.add(effect);
								}
							}

							if (parent) {
								const effects =
									parent.state.#granularEffects.get(
										parent.key
									);
								if (effects)
									for (const effect of effects)
										if (effect._isActive)
											effectsToProcess.add(effect);
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

	_track(key: string | symbol) {
		const effect = currentEffect;
		if (!effect) return;

		this.#effectToLastKey.set(effect, key);

		let granularEffects = this.#granularEffects.get(key);
		if (!granularEffects) {
			granularEffects = new Set();
			this.#granularEffects.set(key, granularEffects);
		}

		if (!granularEffects.has(effect)) {
			granularEffects.add(effect);

			effect._addDependency(() => {
				granularEffects!.delete(effect);
				if (granularEffects!.size === 0) {
					this.#granularEffects.delete(key);
				}
				this.#effectToLastKey.delete(effect);
			});
		}
	}

	_triggerEffects(oldValue: T) {
		reusableTriggeredSet.clear();

		// Only trigger granular effects for properties that have actually changed
		if (
			oldValue &&
			typeof oldValue === "object" &&
			this.#value &&
			typeof this.#value === "object"
		) {
			for (const [key, effects] of this.#granularEffects.entries()) {
				const oldPropValue = (oldValue as any)[key];
				const newPropValue = (this.#value as any)[key];
				if (!isEqual(oldPropValue, newPropValue)) {
					for (const effect of effects)
						if (effect._isActive) reusableTriggeredSet.add(effect);
				}
			}
		} else {
			// If not objects, trigger all granular effects
			for (const effects of this.#granularEffects.values()) {
				for (const effect of effects)
					if (effect._isActive) reusableTriggeredSet.add(effect);
			}
		}

		for (const effect of reusableTriggeredSet) pendingEffects.add(effect);
		processEffectsBatched();
	}

	_triggerGranularEffects(key: string | symbol) {
		const granularEffects = this.#granularEffects.get(key);
		if (granularEffects) {
			granularEffects.forEach((effect) => {
				if (
					effect._isActive &&
					this.#effectToLastKey.get(effect) === key
				) {
					pendingEffects.add(effect);
				}
			});
		}
		processEffectsBatched();
	}

	get value(): T {
		const effect = currentEffect;
		if (effect) {
			this._track(ROOT_KEY);
		}
		return this.#reactive;
	}

	set value(newValue: T) {
		if (this.#derive) return;
		if (!isEqual(this.#value, newValue)) {
			const oldValue = this.#value;
			this.#value = newValue;
			this.#reactive = this._createProxy(newValue);
			this._triggerEffects(oldValue);
		}
	}

	effect(fn: () => void) {
		const effect = new Effect(fn);
		effect._runImmediate();
		return () => effect._stop();
	}
}
