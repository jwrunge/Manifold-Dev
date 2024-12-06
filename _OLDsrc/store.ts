import { StoreOptions } from "./common_types";
import { _scheduleUpdate } from "./updates";

export type SubFunction = (value: any, ref?: string) => void;

function _hashAny(input: any): any {
  if (!input || !isNaN(input) || input === true) return input;
  if (input instanceof Map || input instanceof Set)
    return _hashAny(Array.from(input.entries() || input));

  let hash = 0;
  for (let char of new TextEncoder().encode(input?.toString() || ""))
    hash = (hash << 5) - hash + char;
  return hash;
}

export class Store<T> {
  _updater?: Function;
  _subscriptions: Set<SubFunction> = new Set();
  _storedHash?: any;
  _upstreamStores: Set<Store<any>> = new Set();
  _downstreamStores: Set<Store<any>> = new Set();
  _scope?: HTMLElement;
  name: string;
  value: T;

  constructor(name: string, ops?: StoreOptions<T>) {
    this.name = name;
    MFLD.st.set(name, this);
    this._scope = ops?.scope;
    this.value =
      typeof ops?.value !== "function" ? (ops?.value as any) : undefined; // Initial value as undefined
    this._modify(ops);
  }

  _modify(ops?: StoreOptions<T>): Store<T> {
    ops?.dependencyList?.map((s) => {
      let S = _store(s);
      this._upstreamStores.add(S);
      S._downstreamStores.add(this);
      return S;
    }) || [];

    this.value = ops?.value as T;
    this._updater = ops?.updater;
    _scheduleUpdate(this);
    return this;
  }

  sub(sub: (value: T) => void, immediate: boolean = true): void {
    this._subscriptions.add(sub);
    if (immediate) sub(this.value);
  }

  update(value: T | ((value: T) => T)): void {
    setTimeout(() => {
      let newValue =
        typeof value === "function" ? (value as Function)(this.value) : value;
      let newHash = _hashAny(newValue);

      if (newHash !== this._storedHash) {
        this.value = newValue;
        this._storedHash = newHash;

        for (let ds of this._downstreamStores) _scheduleUpdate(ds);
        for (let sub of Array.from(this._subscriptions)) sub(this.value);
      }
    }, 0);
  }
}

export function _store<T>(name: string, ops?: StoreOptions<T>): Store<T> {
  let found_store = MFLD.st.get(name) as Store<any>;
  return ops
    ? found_store
      ? found_store._modify(ops)
      : new Store(name, ops)
    : found_store || new Store(name, ops);
}
