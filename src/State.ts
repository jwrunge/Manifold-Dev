import _isEqual from "./equality";

let currentEffect: Effect | null = null;
let pending = new Set<Effect>();
const _deps = new Map<string, Set<Effect>>();

const track = (path: string) => {
	if (!currentEffect) return;
	let set = _deps.get(path);
	if (!set) _deps.set(path, (set = new Set()));
	set.add(currentEffect);
	currentEffect._deps.add(() => set!.delete(currentEffect!));
};

const trigger = (path: string) => {
	const set = _deps.get(path);
	if (!set) return;
	for (const effect of set) pending.add(effect);
	flush();
};

const flush = () => {
	if (!pending.size) return;
	const effects = [...pending];
	pending.clear();
	for (const effect of effects) effect.run();
};

const proxy = (obj: any, prefix = ""): any => {
	if (!obj || typeof obj !== "object") return obj;
	return new Proxy(obj, {
		get(t, k) {
			const path = prefix ? `${prefix}.${String(k)}` : String(k);
			track(path);
			const v = t[k];
			return typeof v === "object" && v ? proxy(v, path) : v;
		},
		set(t, k, v) {
			const path = prefix ? `${prefix}.${String(k)}` : String(k);
			if (_isEqual(t[k], v)) return true;
			t[k] = v;
			trigger(path);
			return true;
		},
	});
};

export const createReactiveStore = <T extends object>(initialState: T): T => {
	return proxy(initialState) as T;
};

export const effect = (fn: () => void) => {
	const eff = new Effect(fn);
	eff.run();
	return () => eff.stop();
};

class Effect {
	_deps = new Set<() => void>();
	active = true;

	constructor(public fn: () => void) {}

	run() {
		if (!this.active) return;
		this._deps.forEach((cleanup) => cleanup());
		this._deps.clear();
		const prev = currentEffect;
		currentEffect = this;
		try {
			this.fn();
		} finally {
			currentEffect = prev;
		}
	}

	stop() {
		this.active = false;
		this._deps.forEach((cleanup) => cleanup());
		this._deps.clear();
	}
}

// Global reactive store for all State instances
const globalStore = createReactiveStore({ _states: {} } as {
	_states: Record<string, any>;
});

// State class that uses the new reactive store internally
export class State<T = unknown> {
	public _name: string;
	#derive?: () => T;

	static #reg = new Map<string, State<unknown>>();

	constructor(value: T, name?: string) {
		this._name = name ?? Math.random().toString(36).substring(2, 15);
		globalStore._states[this._name] = value;
		State.#reg.set(this._name, this);
	}

	static _createComputed<T>(deriveFn: () => T, name?: string): State<T> {
		const state = new State(undefined as any, name);
		state.#derive = deriveFn;
		effect(() => {
			const newValue = deriveFn();
			if (!_isEqual(globalStore._states[state._name], newValue)) {
				globalStore._states[state._name] = newValue;
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
		track(`states.${this._name}`);
		return globalStore._states[this._name];
	}

	set value(newValue: T) {
		if (this.#derive) return;
		globalStore._states[this._name] = newValue;
	}

	effect(fn: () => void) {
		return effect(fn);
	}
}
