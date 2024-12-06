// import { _makeComponent, MfldComponent } from "./component";
// import { _fetchAndInsert } from "./fetch";
// import { _register } from "./registrar";
// import { _transition } from "./updates";
// import { _parseFunction, _registerInternalStore, $st, $fn } from "./util";

// let _iterable = <T>(obj: Iterable<T> | { [key: string]: T }, cb: (value: T, key: string | number) => void): void => {
//     if(obj instanceof Map) {
//         for(let[key, value] of obj.entries()) cb(value, key);
//     } else {
//         try {
//             let arr = Array.isArray(obj) ? obj : Array.from(obj as Array<any>);
//             if(arr.length) arr.forEach(cb);
//             else for(let key in obj) cb((obj as any)[key], key);
//         } catch (e) {
//             console.error(`MFLD: ${obj} is not iterable`);
//         }
//     }
// };

// export let _swapInnerHTML = (el: HTMLElement, newEl: HTMLElement) => {
//     el.innerHTML = newEl.innerHTML;
//     newEl.innerHTML = "";
// }

// export function _handleTemplAttribute(self: MfldComponent, mode: string, func: Function, deps: Set<string>, as: string[] = ["$val", "$key"]): void {
//     let isConditional = mode.match(/if|else/),
//         prevConditions: Set<string> = new Set(),
//         modFunc;

//     // Handle elses
//     if(mode.match(/else/)) {
//         let prev = self as MfldComponent,
//             recurseCount = 0;

//         // Loop backward to find previous if/elseif conditions
//         while(prev = prev?.previousElementSibling as MfldComponent) {
//             for(let dep of prev.conditionalDeps) deps.add(dep);

//             if(recurseCount++ > 100) {
//                 console.error("MFLD: No if start found");
//                 break;
//             }
//             if(prev.getAttribute("if")) break;
//         }

//         // Inject previous conditions into this conditions determiner
//         modFunc = () => {
//             for(let d of prevConditions) {
//                 if($st[d]) return false;
//             }
//             return mode == "else" ? true : func?.({ $st, $fn }) === true;
//         };
//     }
//     else modFunc = func;

//     // Subscription function - on change, update the template
//     let sub = (val: any) => {
//         if(val === undefined) return;   // Never update on undefined

//         // Transition out all elements from the previous condition
//         let container = document.createElement("span");
//         _swapInnerHTML(container, self);
//         self.before(container);
//         _transition(container, "out", ()=> container.remove());

//         if(isConditional && !val) return; // Handle no value for conditional templates

//         // Iterate over all values (only one if not each) and transition them in
//         _iterable(mode == "each" ? val : [val], (val: any, key: any) => {
//             let item = self.template?.cloneNode(true) as HTMLTemplateElement;
//             if(!isConditional) {
//                 item.innerHTML = (item.innerHTML as string)?.replace(
//                     /{(\$[^}]*)}/g, (_, cap) => _parseFunction(cap, as.map(a=> `$${a}`)).func?.({ $st, $fn, [`$${as[0]}`]: val, [`$${as[1]}`]: key }) ?? ""
//                 )
//                 || String(val);
//             }

//             // Transition in
//             self.append(item.content);
//             _transition(self, "in", ()=> _register(self, { noparent: true }));
//         });
//     }

//     // Register the store
//     _registerInternalStore(
//         self,
//         modFunc,
//         Array.from(deps),
//         sub
//     );
// }
