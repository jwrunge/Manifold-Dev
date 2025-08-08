# TO DO

-   History API - set up map of states to reference on popstate / routing
-   Throbber support
-   Supporting props: loop over observedAttributes and replace $:{} like in templs?
-   Fix transition spacer

OK, so I think I've figured out the issue of scope and passing a reference to the calling script to the store creation function.

Calling script: let x = $watch(someValue) --> $watch in Store.ts can call document.currentScript and get a reference to the calling script IF x IS DEFINED IN THE TOP LEVEL.

It's also a safe bet that if document.currentScript is NULL, the function was not called at the top level or is executing asyncronously, so we can throw a fatal error.

Now, we can add the store to a WeakMap<HTMLScriptElement, Map<string, Store>>

We can also look at the script text and get the variable name to set as the store name -- but is that actually worth it?

ANOTHER IDEA

Stores are tied to elements in a WeakMap<HTMLElement, Store>?

GOALS:

-   Separation of concerns -- don't muddy markup with logic (keep markup simple -- it's most effective when simple!)
-   Don't leak memory and don't accumulate global stores
-   Don't violate CSP

```typescript
import $ from "mfld";

let myStore = $.watch(4); //==> returns proxy Store(4)
let myStoreArray = $.watch([2,3,4,5,6]);

const showExampleTemplate = ()=> true;

// Registers bindings
$.input("my-input", {props, el}=> {     // my-input is an data-impl value
    value: myStore,
    onchange: (e)=> myStore = e.currentTarget.value,
    oninput: ()=> {
        console.log(props); // key-value map of all props SET on the element
        console.log(el); // a reference to the element
    }
});

// $.input or $.form etc. allow for type checking of elements; you can also use generic $.element()

// Registers a web component that loops over values
$.each("list-values", myStoreArray); // You could also do myStoreArray.map() or some other transform function to create a new store to watch; or this can be a non-store value for static templating
// It's a good idea to handle all the templating in the JS to avoid mixing with server-side templating! 😁

$.if("value-is-4", value => value === 4); // Can be a store or function; functions inherit the value of the "value" property of mf-if if set

$.if("value-is-even", value => value % 2 == 0);
```

```html
<!-- properties set in the html are part of the component; props set in the JS override -->
Input a number (default value of myStore): <input data-impl="my-input" type="number"/>

Here are all the values:
<mf-each data-impl="list-values" data-as="value, key">
    <p>mf-each allows for logic that allows for interpolation of $.each values</p>
    <p>This iteration has ${key}: ${value}</p>

    <mf-if data-impl="value-is-4" value="value">
        <p>The value of item ${key} is 4!</p>
    </mf-if>
    <mf-else-if data-impl="value-is-even" value="value">
        <p>The value of item ${key} is ${value}</p>
    </mf-else-if>
    <mf-else>
        <p>Regular value</p>
    </mf-else>
</mf-each>

<mf-await data-impl="awaitFunc" data-as="arr">
    ...
</mf-await>
<mf-then>
    Handling data: ${arr}
    <mf-each data-impl="list-values" >
</mf-then>
<mf-catch>
    There was an error: ${error}
</mf-catch>
```

This is an MVVM library. Model - arbitrary data; view - arbitrary HTML. viewmodel is the $.element() registrar

Associating "my-input" with input[x-impl=my-input]:
These must be in the same FILE -- on run (must be top-level),

BUG NOTES:

-   No UI update if you remove a value. arr[5] still exists in UI after arr.pop() when length === 6.
-   Infinite reactivity loop if arr is derived from arrLen and then arr[x] is changed.
-   Individual UI loop elements aren't reactive when accessing loop_iter[x]

https://www.jonoalderson.com/conjecture/its-time-for-modern-css-to-kill-the-spa/
