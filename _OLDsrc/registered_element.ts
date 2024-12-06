import type { Store } from "./store";

export class RegisteredElement {
  _el: HTMLElement | null = null;
  _listeners: Map<string, Function> = new Map();
  _stores: Set<Store<any>> = new Set();
  _registered = false;
  _fnCtx: Set<{ key: string; store: string }> = new Set();

  constructor(el: HTMLElement, fnCtx?: Set<{ key: string; store: string }>) {
    this._el = el;
    for (let ctx of fnCtx || []) this._fnCtx.add(ctx);
    window.MFLD.els.set(el, this);
  }

  addListener(event: string, listener: Function) {
    this._listeners.set(event, listener);
    this._el?.addEventListener(event, listener as any);
  }

  addInternalStore(store: Store<any>) {
    this._stores.add(store);
  }

  cleanUp() {
    this._listeners.forEach((listener, event) => {
      this._el?.removeEventListener(event, listener as any);
    });

    // for(let store of Object.values(this.stores)) {
    //     store.();
    // }

    this._el?.remove();
    this._el = null;
  }
}
