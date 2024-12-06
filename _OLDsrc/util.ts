import { MfldOps } from "./common_types";
import { RegisteredElement } from "./registered_element";
import { _store, Store } from "./store";

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

  let MFLD: typeof window.MFLD;
}

if (!window.MFLD)
  window.MFLD = {
    st: new Map(),
    els: new Map(),
    $st: stProx(),
    $fn: {},
    comp: {},
  };

export let ATTR_PREFIX = "mf-";
export let _commaSepRx = /, {0,}/g;
let { $st, $fn } = window.MFLD;
export { $st, $fn };

export let _id = () => {
  return `${Date.now()}_${Math.floor(Math.random() * 100_000)}`;
};

export let _getOpOverrides = (ops: Partial<MfldOps>, el: HTMLElement) => {
  let overrides = ops.profiles?.[el.getAttribute("override") || ""];
  let res = { ...ops, ...overrides };

  // ad hoc overrides
  for (let name in el?.attributes || []) {
    for (let key of ["fetch", "trans"]) {
      if (name.startsWith(`${ATTR_PREFIX}${key}_`)) {
        try {
          let prop = name.split("_")[2];
          let val: any = el.getAttribute(key);
          if (val?.match(/\{|\[/)) val = JSON.parse(val);
          else if (parseInt(val || "")) val = parseInt(val);
          if (Array.isArray(val)) val = val.map((v) => parseInt(v) || v);
          if ((res as any)?.[key]?.[prop]) (res as any)[key][prop] = val;
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  return res;
};

export function stProx(map?: { key: string; store: string }[]) {
  return new Proxy(_store, {
    get: (store, property: string | symbol) => {
      if (map) property = map.find((m) => m.key == property)?.store || property;
      return typeof property === "string" ? store(property)?.value : undefined;
    },
    set: (store, property: string | symbol, value) => {
      if (typeof property === "string") {
        let propParts = property
          .split(/[\.\[\]\?]{1,}/g)
          .map((s) => parseFloat(s.trim()) || s.trim());
        if (map)
          propParts[0] =
            map.find((m) => m.key == propParts[0])?.store || propParts[0];
        let S = store(propParts[0] as string),
          ret = S.value;

        for (let part of propParts.slice(1) || []) ret = (ret as any)[part];
        ret = value;
        S.update(ret);
      }

      return true;
    },
  });
}
if (!window.MFLD.stProx) window.MFLD.stProx = stProx;

export let _parseFunction = (
  condition: string,
  registerAsStoreLookups: { key: string; store: string }[] = [],
  conditionalDependencies: string[] = [],
  additionalParams: string[] = []
): { func?: Function; as?: string[]; dependencyList?: string[] } => {
  try {
    let [fnStr, asStr] = condition?.split(/\s{1,}as\s{1,}/) || [
        condition,
        "value",
      ], // Separate func string from iterator values
      // Handle lookups for scoped stores
      insertLookups = `let $var = MFLD?.stProx?.(${JSON.stringify(
        registerAsStoreLookups
      )});`,
      // Handle previous conditions for subconditions
      prevConditions = conditionalDependencies?.length
        ? `for(let dep of ${JSON.stringify(
            conditionalDependencies
          )}){if($st[dep]) return false;}`
        : "",
      fn = fnStr?.match(/^\s{0,}(function)?\(.{0,}\)(=>)?\s{0,}/)
        ? `(${fnStr})()`
        : fnStr,
      fnText = `let {$el,$st,$fn,$body${
        additionalParams ? "," + additionalParams.join(",") : ""
      }}=ops;${insertLookups}${prevConditions}return ${fn}`, // Take $el as a reference to the element; assign global refs to $fn and $st
      as =
        asStr?.split?.(_commaSepRx)?.map?.((s) => s.trim()) || ["value"] || [],
      dependencyList = Array.from(
        new Set([
          ...[...fnStr?.matchAll(/\$st\.(\w{1,})/g)].map((m) => m[1]),
          ...[...fnStr?.matchAll(/\$var\.(\w{1,})/g)].map(
            (m) =>
              registerAsStoreLookups.find((r) => r.key == m[1])?.store || ""
          ),
        ])
      );

    if (!fn) return {};
    let func: Function | undefined = new Function("ops", fnText);
    return { func, as, dependencyList };
  } catch (e) {
    console.error(e);
    return {};
  }
};

export function _handlePushState(el: HTMLElement, ev?: Event, href?: string) {
  ev?.preventDefault();

  let pushState = el?.getAttribute("pushstate");
  let push = href;
  switch (pushState) {
    case "":
      break;
    case undefined:
      return;
    default:
      push = `#${pushState}`;
  }

  history.pushState(null, "", push);
}

export function _registerInternalStore(
  el: HTMLElement,
  func?: Function,
  dependencyList?: string[],
  sub?: (val: any) => void
) {
  let ops = { $el: el, $st, $fn } as any;
  let S = _store(_id(), {
    updater: () => func?.(ops),
    dependencyList: dependencyList,
    internal: true,
  });

  if (sub) S.sub(sub);
  return S;
}
