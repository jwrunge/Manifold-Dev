import { _store } from "./store";

/***
 * OPTIONS
 */
export type MfldOps = {
  profiles?: { [key: string]: Partial<MfldOps> };
  fetch?: FetchOptions;
  trans?: TransitionOptions;
};

export type FetchOptions = {
  request?: RequestInit;
  resType?: "json" | "text";
  err?: (err: Error) => void;
  onCode?: (code: number, data: void | Response) => boolean | void;
  externals?: ExternalOptions[];
};

export type ExternalOptions = {
  domain: string;
  script?: "all" | "selected" | "none";
  style?: "all" | "selected" | "none";
};

export type TransitionOptions = {
  class?: string;
  dur?: [number, number];
  swap?: number;
  smart?: boolean;
  hooks?: { [key in HookKey]?: (el: HTMLElement) => void };
};

export type HookKey = "in-start" | "in-end" | "out-start" | "out-end";

/**
 * STORES
 */

export type UpdaterFunction<T> = (value: T | (() => T)) => T;
export type ValueDeterminer<T> = (currentValue?: T) => T | undefined;
export type UpdateFunction<T> = (
  value: T | ValueDeterminer<T>
) => T | undefined;
export type SubDeterminer<T> = (value: T) => void;
export type SubFunction<T> = (value: SubDeterminer<T>) => void;

export interface StoreOptions<T> {
  name?: string;
  value?: T;
  updater?: UpdaterFunction<T>;
  scope?: HTMLElement;
  dependencyList?: string[];
  internal?: boolean;
}

export interface Store<T> {
  readonly value: T;
  update: UpdateFunction<T>;
  sub: SubFunction<T>;
}

export type MfldFunc = (val: any, el?: HTMLElement) => void;
