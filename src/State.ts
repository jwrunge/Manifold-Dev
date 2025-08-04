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

// Global reactive system for path-based tracking
const granularEffects = new Map<string, Set<Effect>>();
const effectToLastPath = new Map<Effect, string>();

const track = (path: string) => {
	const effect = currentEffect;
	if (!effect) return;

	effectToLastPath.set(effect, path);

	let effects = granularEffects.get(path);
	if (!effects) {
		effects = new Set();
		granularEffects.set(path, effects);
	}

	if (!effects.has(effect)) {
		effects.add(effect);

		effect._addDependency(() => {
			effects!.delete(effect);
			if (effects!.size === 0) {
				granularEffects.delete(path);
			}
			effectToLastPath.delete(effect);
		});
	}
};

const triggerEffects = (path: string) => {
	const effects = granularEffects.get(path);
	if (effects) {
		for (const effect of effects) {
			if (effect._isActive && effectToLastPath.get(effect) === path) {
				pendingEffects.add(effect);
			}
		}
	}
	processEffectsBatched();
};

const createProxy = (obj: any, pathPrefix = ""): any => {
	if (!obj || typeof obj !== "object") return obj;

	// Don't proxy Promises - they have special native methods that break with proxies
	if (obj instanceof Promise) return obj;

	const commonProxyHandler: ProxyHandler<any> = {
		get: (target, key) => {
			const fullPath = pathPrefix
				? `${pathPrefix}.${String(key)}`
				: String(key);
			track(fullPath);
			const value = Reflect.get(target, key);
			return typeof value === "object" && value !== null
				? createProxy(value, fullPath)
				: value;
		},
		set: (target, key, value) => {
			const fullPath = pathPrefix
				? `${pathPrefix}.${String(key)}`
				: String(key);
			if (isEqual(Reflect.get(target, key), value)) return true;
			const result = Reflect.set(target, key, value);
			if (result) {
				triggerEffects(fullPath);
			}
			return result;
		},
	};

	if (obj instanceof Map || obj instanceof Set) {
		return new Proxy(obj, {
			...commonProxyHandler,
			get: (target, key) => {
				const fullPath = pathPrefix
					? `${pathPrefix}.${String(key)}`
					: String(key);
				track(fullPath);
				const value = Reflect.get(target, key);
				return typeof value === "function"
					? value.bind(target)
					: typeof value === "object" && value !== null
					? createProxy(value, fullPath)
					: value;
			},
		});
	}

	if (Array.isArray(obj)) {
		return new Proxy(obj, {
			...commonProxyHandler,
			get: (target, key) => {
				const fullPath = pathPrefix
					? `${pathPrefix}.${String(key)}`
					: String(key);
				track(fullPath);
				const value = Reflect.get(target, key);
				if (
					typeof value === "function" &&
					arrayMutatingMethods.has(key as string)
				) {
					return (...args: any[]) => {
						const oldLength = target.length;
						const result = (value as Function).apply(target, args);
						const newLength = target.length;

						if (oldLength !== newLength) {
							triggerEffects(`${fullPath}.length`);
						} else {
							for (let i = 0; i < target.length; i++) {
								triggerEffects(`${fullPath}.${i}`);
							}
						}
						return result;
					};
				}
				return typeof value === "object" && value !== null
					? createProxy(value, fullPath)
					: value;
			},
		});
	}

	return new Proxy(obj, commonProxyHandler);
};

export const createReactiveStore = <T extends object>(initialState: T): T => {
	return createProxy(initialState) as T;
};

export const effect = (fn: () => void) => {
	const effect = new Effect(fn);
	effect._runImmediate();
	return () => effect._stop();
};

const flushPendingEffects = () => {
	if (isFlushingEffects || pendingEffects.size === 0) return;
	isFlushingEffects = true;
	try {
		while (pendingEffects.size > 0 && batchDepth < 10) {
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

// Global reactive store for all State instances
const globalReactiveStore = createReactiveStore({} as Record<string, any>);

// State class that uses the new reactive store internally
export class State<T = unknown> {
	public name: string;
	#path: string;
	#derive?: () => T;

	static #reg = new Map<string, State<unknown>>();

	constructor(value: T, name?: string) {
		this.name = name ?? Math.random().toString(36).substring(2, 15);
		this.#path = `states.${this.name}`;

		// Ensure states object exists
		if (!(globalReactiveStore as any).states) {
			(globalReactiveStore as any).states = {};
		}

		// Initialize value in global store
		if (!(this.name in (globalReactiveStore as any).states)) {
			(globalReactiveStore as any).states[this.name] = value;
		}

		State.#reg.set(this.name, this);
	}

	static _createComputed<T>(deriveFn: () => T, name?: string): State<T> {
		const state = new State(undefined as any, name);
		state.#derive = deriveFn;

		// Set up computed reactivity using the new effect system
		effect(() => {
			const newValue = deriveFn();
			if (
				!isEqual(
					(globalReactiveStore as any).states[state.name],
					newValue
				)
			) {
				(globalReactiveStore as any).states[state.name] = newValue;
			}
		});

		return state;
	}

	static get<T>(name?: string): State<T> | undefined {
		return name ? (this.#reg.get(name) as State<T> | undefined) : undefined;
	}

	static register<T>(name: string, state: State<T>): void {
		this.#reg.set(name, state);
	}

	get value(): T {
		// Track access to this specific state path
		track(this.#path);
		return (globalReactiveStore as any).states?.[this.name];
	}

	set value(newValue: T) {
		if (this.#derive) return; // Can't set computed states

		// Ensure states object exists
		if (!(globalReactiveStore as any).states) {
			(globalReactiveStore as any).states = {};
		}

		// Set value in global store, which will trigger path-based effects
		(globalReactiveStore as any).states[this.name] = newValue;
	}

	effect(fn: () => void) {
		return effect(fn);
	}
}
