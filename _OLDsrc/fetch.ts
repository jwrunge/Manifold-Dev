import { _handlePushState, _parseFunction, $st, $fn } from "./util";
import { _transition } from "./updates";
import { _store } from "./store";
import { ExternalOptions, MfldOps } from "./common_types";
import { RegisteredElement } from "./registered_element";

export let _handleFetch = (
  el: RegisteredElement,
  trigger: string,
  fetchOps: MfldOps,
  href: string,
  method?: string,
  func?: Function,
  complete?: Function
): void => {
  let ev = (e?: Event) =>
    _fetchAndInsert(e, method, fetchOps, href, null, el, true, func, complete);
  if (trigger === "$mount") ev();
  else el.addListener(trigger, ev as Function);
};

let _handlePermissions = (
  ops: MfldOps,
  href: string,
  fullMarkup: Document,
  inEl: HTMLElement
) => {
  let externalPermissions: ExternalOptions | undefined =
    ops.fetch?.externals?.find((allowed) => {
      return (
        (allowed.domain === "$origin" &&
          (href.startsWith(location.origin) ||
            !href.match(/^(https?):\/\//))) ||
        href.startsWith(allowed.domain)
      );
    });

  if (!externalPermissions) {
    externalPermissions = href.startsWith(location.origin)
      ? { domain: "$origin", script: "selected", style: "selected" }
      : undefined;
  }

  let [styles, scripts] = ["style", "script"].map((tag) =>
    Array.from(
      (externalPermissions?.[tag as keyof ExternalOptions] == "all"
        ? fullMarkup
        : inEl
      )?.querySelectorAll(tag)
    )
  ) as [HTMLStyleElement[], HTMLScriptElement[]];

  switch (externalPermissions?.style) {
    case "all":
      styles.forEach((s) => inEl?.append(s));
      break;
    default:
      styles.forEach((s) => s.parentNode?.removeChild(s));
  }

  for (let script of scripts) script.parentNode?.removeChild(script);
  return scripts;
};

export let _fetchAndInsert = async (
  e: Event | undefined,
  method: string | undefined,
  fetchOps: MfldOps,
  href: string,
  specifiedInstruction: string | null,
  el: RegisteredElement | null,
  domUpdate: boolean,
  func?: Function,
  complete?: Function
): Promise<void> => {
  e?.preventDefault();

  // Handle fetch body
  let input = func ? func({ $el: el, $st, $fn }) : undefined,
    body: FormData | string | undefined =
      input === "$form" ? new FormData(el?._el as HTMLFormElement) : input,
    // Get response
    data = await fetch(href, {
      ...(fetchOps.fetch?.request || {}),
      headers: {
        ...fetchOps.fetch?.request?.headers,
        MFLD: "true",
      },
      method: method || (e?.target as HTMLFormElement)?.method || "get",
      body:
        input === "$form" || typeof body === "string"
          ? body
          : JSON.stringify(body),
    }).catch((error) => {
      fetchOps.fetch?.err?.(error);
    }),
    // Response code for callback
    code = data?.status,
    // Response text
    resp = await data?.[fetchOps.fetch?.resType || "text"]();

  // Handle code callback
  if (code && fetchOps.fetch?.onCode?.(code, data) === false) return;

  // Handle response insertion
  for (let instruction of specifiedInstruction
    ? [""]
    : ["append", "prepend", "insert", "replace"]) {
    let ds = specifiedInstruction || el?._el?.getAttribute(instruction);
    if (ds == null) continue;

    let [selector, toReplace] = ds.split("->").map((s) => s.trim()),
      fullMarkup = new DOMParser().parseFromString(resp, "text/html"),
      inEl = fullMarkup.querySelector(selector) as HTMLElement,
      scripts = _handlePermissions(fetchOps, href, fullMarkup, inEl);

    if (inEl) {
      if (domUpdate) {
        _transition(inEl, "in", () => {
          complete?.(el);
          for (let s of scripts) {
            let n = document.createElement("script");
            n.textContent = s.textContent;
            el?._el?.append(n);
          }
        });

        if (el?._el)
          _transition(
            toReplace
              ? (el?._el?.querySelector(toReplace) as HTMLElement)
              : el._el,
            "out"
          );
      } else {
        document.body.append(inEl);
        for (let s of scripts) {
          let n = document.createElement("script");
          for (let attr of s.attributes) n.setAttribute(attr.name, attr.value);
          n.textContent = s.textContent;
          inEl.before(n);
        }
      }
    }
  }

  // Resolve callback
  let resolveTxt = el?._el?.getAttribute("resolve"),
    resolveFunc = _parseFunction(resolveTxt || "")?.func;
  resolveFunc?.({ $el: el, $st, $fn, $body: resp });

  if (domUpdate) _handlePushState(el?._el as HTMLElement, e, href);
};
