import {
  $st,
  $fn,
  _commaSepRx,
  _getOpOverrides,
  _handlePushState,
  _parseFunction,
  _registerInternalStore,
  ATTR_PREFIX,
} from "./util";
import { _handleFetch } from "./fetch";
import type { MfldOps } from "./common_types";
import { RegisteredElement } from "./registered_element";

let _ops: Partial<MfldOps> = {};
let _modes = [
  "bind",
  "sync",
  "get",
  "head",
  "post",
  "put",
  "delete",
  "patch",
  "promote",
];

export let _setOptions = (
  newops: Partial<MfldOps>,
  profileName?: string
): void => {
  if (profileName) _ops.profiles = { ..._ops.profiles, [profileName]: newops };
  else _ops = { ..._ops, ...newops };
};

window.addEventListener("popstate", () => {
  location.reload();
});

type RegisterOptions = {
  noparent?: boolean;
  fnCtx?: Set<{ key: string; store: string }>;
};

export let _register = (
  parent?: HTMLElement | null,
  ops?: RegisterOptions
): void => {
  if (!parent || parent?.nodeType == Node.TEXT_NODE) return;

  let els: NodeListOf<HTMLElement> = parent.querySelectorAll(
    `[${ATTR_PREFIX}${_modes.join(`],[${ATTR_PREFIX}`)}]`
  );

  for (let raw_el of ops?.noparent ? [...els] : [parent, ...els]) {
    // Scope registration to component scope
    if (raw_el !== parent) {
      let closestComponent: HTMLElement | null = (
        raw_el.parentNode as HTMLElement
      ).closest("._mf-cmp");
      if (closestComponent && closestComponent !== parent) {
        continue;
      }
    }

    // Create registered eliment and ensure there is no double-registration
    let el =
      window.MFLD.els.get(raw_el) || new RegisteredElement(raw_el, ops?.fnCtx);
    if (el._registered) continue;
    el._registered = true;

    let _op_overrides = _getOpOverrides(
      structuredClone(_ops),
      el._el as HTMLElement
    );

    for (let attr of el._el?.attributes || []) {
      if (!attr.name.startsWith(ATTR_PREFIX) || attr.value === null) continue;
      let _strippedMode = attr.name.replace(ATTR_PREFIX, "");

      // Handle promote
      if (_strippedMode == "promote") {
        let [mode, href, input, trigger] =
          el._el?.tagName == "A"
            ? ["get", (el._el as HTMLAnchorElement).href, undefined, "click"]
            : [
                (el._el as HTMLFormElement).method?.toLowerCase(),
                (el._el as HTMLFormElement).action,
                () => "$form",
                "submit",
              ];
        if (href)
          _handleFetch(
            el,
            trigger,
            _op_overrides,
            href,
            mode,
            input,
            (el: HTMLElement) => _register(el, { fnCtx: ops?.fnCtx })
          );
        continue;
      }

      // Handle attribute parsing
      for (let setting of el._el?.getAttribute(attr.name)?.split(";;") || [
        "",
      ]) {
        let isFetch = !/bind|sync/.test(attr.name) ? true : false,
          parts = setting?.split(/\s*->\s*/g),
          href = isFetch ? parts.pop() || "" : "",
          triggers =
            isFetch || _strippedMode == "sync"
              ? parts
                  .shift()
                  ?.match(/[^\(\)]{1,}/g)
                  ?.pop()
                  ?.split(_commaSepRx)
                  ?.map((s) => s.trim()) || []
              : null,
          funcStr = parts?.[0] || "";

        let { func, dependencyList } = _parseFunction(
          funcStr,
          Array.from(el._fnCtx) || []
        );
        // el._addFunc(func);

        if (!triggers) {
          el.addInternalStore(
            _registerInternalStore(
              el._el as HTMLElement,
              func,
              dependencyList,
              undefined
            )
          );
          continue;
        }

        // Handle triggered events (sync, fetch)
        for (let trigger of triggers) {
          if (_strippedMode == "sync") {
            let ev = (e?: Event): void => {
              func?.({ $el: el._el, $st, $fn });
              _handlePushState(el._el as HTMLElement, e);
            };

            if (trigger === "$mount") ev();
            else el._el?.addEventListener(trigger, ev);
          } else
            _handleFetch(el, trigger, _op_overrides, href, _strippedMode, func);
        }
      }
    }
  }
};

setTimeout(() => _register(document.body), 0);
