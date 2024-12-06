import { $fn, $st } from "./util";
import { Store } from "./store";

let workArray: Function[] = [];
let updateSet: Set<Store<any>> = new Set();
let cancelAnimationFrame = 0;
let _nextTickQueue: Function[] = [];
let RECURSE_LIMIT = 100;

export let onTick = (fn: Function) => {
  fn && _nextTickQueue.push(fn);
};

export let _scheduleUpdate = (update: Function | Store<any>) => {
  if (typeof update == "function") workArray.push(update);
  else updateSet.add(update);

  if (!cancelAnimationFrame) {
    cancelAnimationFrame = requestAnimationFrame(() => _runUpdates());
  }
};

// let _addSpacer = (inEl: RegisteredElement, wrapper: HTMLElement | null, wrapperHeight: number, ops: Partial<MfldOps>)=> {
//     if(!(ops.trans?.smart ?? true)) return;
//     let { paddingTop, paddingBottom } = wrapper instanceof Element ? getComputedStyle(wrapper) : { paddingTop: 0, paddingBottom: 0 };
//     let spacer = document.createElement("div");
//     spacer.style.height = `calc(${Math.abs(wrapperHeight - (inEl?.clientHeight || 0))}px - ${paddingTop} - ${paddingBottom})`;
//     wrapper?.after(spacer);
// }

// let _adjustSizing = (inEl: HTMLElement | null, ops: Partial<MfldOps>)=> {
//     if(!ops.trans?.smart ?? true) return;
//     let dur = (typeof ops?.trans?.dur == "number" ? ops?.trans?.dur : ops?.trans?.dur?.[0] || 0)/2
//     _scheduleUpdate(()=> {
//         spacer?.remove();
//         inEl?.animate?.([
//             { height: spacerHeight },
//             { height: `${inEl.clientHeight || 0}px` }
//         ], dur);
//     });
// }

function _runUpdates(recursed = 0) {
  // if(!recursed) console.log("%cRunning batched updates", "background: yellow; color: red;", performance.now())
  if (recursed > RECURSE_LIMIT) {
    console.error(
      "MFLD: Recursion limit reached - check for circular references."
    );
    return;
  }
  cancelAnimationFrame = 0;
  recursed++;

  for (let order of workArray) order();

  let newUpdateSet: Set<Store<any>> = new Set();
  for (let store of updateSet) {
    //If the store has an upstream store that is contained in updateSet, don't add to newUpdateSet
    let hasUpstream = false;
    for (let up of store._upstreamStores) {
      if (updateSet.has(up)) {
        hasUpstream = true;
        break;
      }
    }
    if (hasUpstream) newUpdateSet.add(store);
    else {
      let newVal = store._updater?.({ $st, $fn, $el: store._scope });
      store.update(newVal === undefined ? store.value : newVal);
    }
  }

  // // let wrapperHeight = order.out ? order.out.clientHeight : 0;
  // // let _getDimensionsAfterUpdate = order.relation == "inner";

  // if(order.relation == "prepend") {
  //     order.in._transition("in", ()=> order.in && order.out?._position(order.in._el, "prepend", false));
  //     // _adjustSizing?.(order?.in, order.ops);
  // }
  // else {
  //     if(["inner", "outer"].includes(order.relation)) {
  //         let container = order.out?._position(order.out?._el, "after");
  //         if(order.relation == "inner") {
  //             container.style.border = "none";
  //             order?.out?._el?.replaceChildren();
  //         }
  //         order.out._transition("out");
  //     }

  //     // _addSpacer?.(order.in, order.out, wrapperHeight, order.ops);
  //     order.in._transition("in", ()=> {
  //         if(order.relation == "outer") order.out?._replaceWith(order.in)
  //         else order.out?._position(order.in._el, "appendChild", false);
  //     });
  // }

  // order.done?.(order.in);

  workArray = [];
  updateSet.clear();

  if (newUpdateSet.size) {
    // Run again if there are still updates to be made
    updateSet = newUpdateSet;
    _runUpdates(recursed);
  } else {
    // If there should still be updates, force them
    if (updateSet.size) _runUpdates(recursed);

    // Run next tick functions and wrap up
    _nextTickQueue.forEach((fn) => fn());
    _nextTickQueue = [];
  }
}

export function _transition(
  el: HTMLElement | null,
  dir: "in" | "out",
  after?: Function | null
) {
  _scheduleUpdate(() => {
    if (dir == "out") {
      // el?.remove();
    }
    after?.();
  });
}
