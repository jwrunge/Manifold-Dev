import _isEqual from "./equality";

let currentEffect: Effect | null = null;
let pending = new Set<Effect>();
const deps = new Map<string, Set<Effect>>();

const track = (path: string) => {
	if (!currentEffect) return;
	let set = deps.get(path);
	if (!set) deps.set(path, (set = new Set()));
	set.add(currentEffect);
	currentEffect.deps.add(() => set!.delete(currentEffect!));
};

const trigger = (path: string) => {
	const set = deps.get(path);
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
	deps = new Set<() => void>();
	active = true;

	constructor(public fn: () => void) {}

	run() {
		if (!this.active) return;
		this.deps.forEach((cleanup) => cleanup());
		this.deps.clear();
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
		this.deps.forEach((cleanup) => cleanup());
		this.deps.clear();
	}
}

// Global reactive store for all State instances
const globalStore = createReactiveStore({ states: {} } as {
	states: Record<string, any>;
});

// State class that uses the new reactive store internally
export class State<T = unknown> {
	public name: string;
	#derive?: () => T;

	static #reg = new Map<string, State<unknown>>();

	constructor(value: T, name?: string) {
		this.name = name ?? Math.random().toString(36).substring(2, 15);
		globalStore.states[this.name] = value;
		State.#reg.set(this.name, this);
	}

	static _createComputed<T>(deriveFn: () => T, name?: string): State<T> {
		const state = new State(undefined as any, name);
		state.#derive = deriveFn;
		effect(() => {
			const newValue = deriveFn();
			if (!_isEqual(globalStore.states[state.name], newValue)) {
				globalStore.states[state.name] = newValue;
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
		track(`states.${this.name}`);
		return globalStore.states[this.name];
	}

	set value(newValue: T) {
		if (this.#derive) return;
		globalStore.states[this.name] = newValue;
	}

	effect(fn: () => void) {
		return effect(fn);
	}
}
