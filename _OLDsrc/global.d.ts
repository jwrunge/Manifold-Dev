import { type RegisteredElement } from "./registered_element";
import { type Store } from "./store";
import { stProx } from "./util";

export {};

declare global {
  interface Window {
    MFLD: {
      st: Map<string, Store<any>>;
      els: Map<HTMLElement, RegisteredElement>;
      $st: { [key: string]: any }; // Proxy type for dynamic property access
      $fn: { [key: string]: Function };
      comp: { [key: string]: CustomElementConstructor };
      stProx?: typeof stProx;
    };
  }
}
