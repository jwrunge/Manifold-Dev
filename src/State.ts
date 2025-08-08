import _isEqual from "./equality";

let _currentEffect: Effect | null = null;
let _pending = new Set<Effect>();
const MAX_UPDATE_DEPTH = 100;

const _runningEffects = new Set<Effect>(); // Track currently running effects
const _updateDepths = new Map<Effect, number>(); // Track update depths per effect

const _deps = new Map<string, Set<Effect>>(),
	_S = String,
	_objStr = "object";

const _track = (path: string) => {
	if (!_currentEffect) return;
	let set = _deps.get(path);
	if (!set) _deps.set(path, (set = new Set()));
	set.add(_currentEffect);
	_currentEffect._deps.add(() => set!.delete(_currentEffect!));
};

const _trigger = (path: string) => {
	const set = _deps.get(path);
	if (!set) return;
	for (const effect of set) _pending.add(effect);
	_flush();
};

const _flush = () => {
	if (!_pending.size) return;
	const effects = [..._pending];
	_pending.clear();

	for (const effect of effects) {
		// Check for circular dependencies using the running effects set
		if (_runningEffects.has(effect)) {
			console.warn(
				"Circular dependency detected, skipping effect to prevent infinite loop"
			);
			continue;
		}

		// Check update depth per effect
		const currentDepth = (_updateDepths.get(effect) || 0) + 1;
		_updateDepths.set(effect, currentDepth);

		if (currentDepth > MAX_UPDATE_DEPTH) {
			console.warn(
				`Effect exceeded maximum update depth (${MAX_UPDATE_DEPTH}), stopping to prevent infinite loop`
			);
			_updateDepths.delete(effect);
			continue;
		}

		// Mark effect as running before execution
		_runningEffects.add(effect);

		try {
			effect._run();
		} finally {
			// Always remove from running effects, even if error occurs
			_runningEffects.delete(effect);
		}

		// Reset depth after successful run if effect is not pending again
		if (!_pending.has(effect)) {
			_updateDepths.delete(effect);
		}
	}
};

const _proxy = (obj: any, prefix = ""): any => {
	if (!obj || typeof obj !== _objStr) return obj;
	return new Proxy(obj, {
		get(t, k) {
			const path = prefix ? `${prefix}.${_S(k)}` : _S(k);
			_track(path);
			const v = t[k];
			return typeof v === _objStr && v ? _proxy(v, path) : v;
		},
		set(t, k, v) {
			const path = prefix ? `${prefix}.${_S(k)}` : _S(k);
			if (_isEqual(t[k], v)) return true;
			t[k] = v;
			_trigger(path);
			return true;
		},
	});
};

export const _effect = (fn: () => void) => {
	const eff = new Effect(fn);
	eff._run();
	return () => eff._stop();
};

export const effect = (fn: () => void) => {
	const eff = new Effect(fn);
	eff._run();
	return () => eff._stop();
};

class Effect {
	_deps = new Set<() => void>();
	_active = true;

	constructor(public fn: () => void) {}

	_run() {
		if (!this._active) return;

		// Clear previous dependencies
		this._deps.forEach((cleanup) => cleanup());
		this._deps.clear();

		// Set current effect and run function
		const prev = _currentEffect;
		_currentEffect = this;
		try {
			this.fn();
		} finally {
			_currentEffect = prev;
		}
	}

	_stop() {
		this._active = false;
		this._deps.forEach((cleanup) => cleanup());
		this._deps.clear();
	}
}

// Global reactive store for all State instances
const _globalStore = _proxy({ _states: {} });

// State class that uses the new reactive store internally
export class State<T = unknown> {
	_name: string;
	#derive?: () => T;
	#cachedValue?: T;
	#isComputed = false;

	static #registry = new Map<string, State<unknown>>();

	constructor(value: T, name?: string) {
		this._name = name ?? Math.random().toString(36).substring(2, 15);
		_globalStore._states[this._name] = value;
		State.#registry.set(this._name, this);
	}

	static createComputed<T>(deriveFn: () => T, name?: string): State<T> {
		const state = new State(undefined as any, name);
		state.#derive = deriveFn;
		state.#isComputed = true;

		effect(() => {
			const newValue = deriveFn();
			if (!_isEqual(_globalStore._states[state._name], newValue)) {
				_globalStore._states[state._name] = newValue;
			}
		});

		return state;
	}

	static get<T>(name?: string): State<T> | undefined {
		return name
			? (this.#registry.get(name) as State<T> | undefined)
			: undefined;
	}

	get value(): T {
		_track(`states.${this._name}`);
		return _globalStore._states[this._name];
	}

	set value(newValue: T) {
		if (this.#derive) return;
		_globalStore._states[this._name] = newValue;
	}

	effect(fn: () => void) {
		return effect(fn);
	}
}
