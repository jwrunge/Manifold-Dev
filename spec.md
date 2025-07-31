# Manifold

Manifold is a reactive state management and front-end templating library that aims to be small, simple, performant, efficient, and convenient. Manifold provides features common in frameworks like React, Vue, and Svelte without requiring complex build systems, compilers, or coding practices.

**Design Philosophy**: Simple things should be simple, complex things should be possible.

**Event Disambiguation**: When an element has multiple events (e.g., both `data-await` and `data-bind="onclick: ..."`), Manifold requires explicit event labels in `data-process` and `data-target` attributes. If labels are missing in ambiguous cases, Manifold will throw a warning instructing you to disambiguate with `event:` prefixes.

## API

Manifold uses data attributes on regular HTML elements for all reactive templating.

## SIMPLIFY

data-bind and data-sync should be more dynamic --> data-bind.prop="single expression", data-sync.prop="@storeName" OR data-sync.prop="input expression >> processing expression/assignment"

We need to add data-[listener] (e.g. data-onclick, data-onchange) that accepts a registered function or function expression.

data-await works as before. data-then includes processing option: data-then="variableAlias" OR data-then="variableAlias >> processing expression/assignment". data-catch provides error handling with the error available as $error in processing expressions. Alternative to data-then is data-target="variableAlias >> processing expression >> #targetSelector".

Expression parser should call into Manifold registered props and functions if the string is a single word not prefixed by "@".

### Data Attributes

| Attribute                         | Purpose                                                                                           | Example                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| data-bind.prop                    | Binds a specific element property to a state expression                                           | `<input data-bind.value="@username" />`, `<button data-bind.disabled="@isLoading" />`                                           |
| data-sync.prop                    | Two-way data binding - binds property to state AND runs sync function when property changes       | `<input data-sync.value="@username" />`, `<input data-sync.value="@email >> validateEmail()" />`                                |
| data-onclick, data-onchange, etc. | Event listeners that accept function expressions or registered functions                          | `<button data-onclick="handleClick()">Click me</button>`, `<input data-onchange="@user.name = event.target.value" />`           |
| data-if                           | Conditional rendering - shows element when expression is truthy                                   | `<div data-if="@isVisible">Content</div>`                                                                                       |
| data-elseif                       | Alternative condition - sibling of data-if for additional conditions                              | `<div data-elseif="@showAlternative">Alt content</div>`                                                                         |
| data-else                         | Fallback content - works with data-if and data-each. For async operations, use data-catch instead | `<div data-else>Default content</div>`                                                                                          |
| data-each                         | Repeats element for each array item, with optional aliasing using `as` syntax                     | `<div data-each="@items">Item: ${value}</div>`, `<div data-each="@items as item">Item: ${item.name}</div>`                      |
| data-scope                        | Creates scoped variables for child elements using `state as alias` syntax                         | `<div data-scope="@user as u">Hello ${u.name}</div>`                                                                            |
| data-await                        | Shows loading content while promise is pending                                                    | `<div data-await="fetchUser()">Loading...</div>`                                                                                |
| data-then                         | Shows content when promise resolves, with optional processing                                     | `<div data-then="profile">${profile.name}</div>`, `<div data-then="response >> response.json() as data">${data.name}</div>`     |
| data-catch                        | Shows content when promise rejects, with error available as $error                                | `<div data-catch="error">Error: ${error.message}</div>`, `<div data-catch="err >> handleError(err)">Something went wrong</div>` |
| data-target                       | Targets another element with content, supports multiple insertion methods                         | `<button data-target="append(#content)">Add content</button>`, `<div data-target="replace(#main) >> processData()">...</div>`   |

**State Aliasing**: Use `@state.property as alias` syntax to create readable aliases for complex state references.

**Expression Syntax**: Expressions support `>>` chaining for processing: `expression >> processing >> target(selector)`

**Interpolation**: Use `${expression}` syntax within element content to display dynamic values.

#### Examples

**Conditional rendering:**

```html
<div data-if="@user.isLoggedIn">Welcome back, ${@user.name}!</div>
<div data-elseif="@user.isGuest">Hello, guest!</div>
<div data-else>Please log in</div>
```

**List rendering:**

```html
<!-- Basic iteration -->
<ul>
	<li data-each="@products">Product: ${value.name} - $${value.price}</li>
</ul>

<!-- With aliasing for readability -->
<ul>
	<li data-each="@products as product">
		${product.name} - $${product.price}
	</li>
</ul>

<!-- Complex state aliasing -->
<ul>
	<li data-each="@store.inventory.items as product">
		${product.name} - $${product.price}
	</li>
</ul>

<!-- With fallback for empty arrays -->
<ul>
	<li data-each="@products as product">${product.name} - ${product.price}</li>
	<li data-else>No products available</li>
</ul>
```

**Property binding:**

```html
<!-- Individual property binding -->
<input type="text" data-bind.value="@username" />
<input type="email" data-bind.value="@email" data-bind.disabled="@isReadonly" />
<button data-bind.disabled="@isLoading">Click me</button>

<!-- Two-way binding with sync functions -->
<input type="text" data-sync.value="@username" />
<input type="email" data-sync.value="@email >> validateEmail()" />
<textarea data-sync.value="@message >> updateWordCount()"></textarea>

<!-- Event handlers -->
<button data-onclick="handleClick()">Click me</button>
<button data-onclick="@user.save()">Save User</button>
<form data-onsubmit="handleSubmit(event)">...</form>
<input data-onchange="@user.name = event.target.value" />
```

**State aliasing:**

```html
<div data-scope="@currentUser as user, @cartItems as items">
	<h1>Hello ${user.name}</h1>
	<div data-if="items.length > 0">
		<div data-each="items as item">${item.title} - $${item.price}</div>
	</div>
	<div data-else>Your cart is empty</div>
</div>

<!-- Complex state references with aliasing -->
<div data-if="@app.user.preferences.theme as theme">
	<div data-bind.class="theme === 'dark' ? 'dark-mode' : 'light-mode'">
		Current theme: ${theme}
	</div>
</div>
```

### Advanced Features

**Async content:**

```html
<!-- Basic async content -->
<div data-await="fetchUserProfile()">Loading user profile...</div>
<div data-then="profile">
	<h2>${profile.name}</h2>
	<p>${profile.bio}</p>
</div>
<div data-catch="error">Error loading profile: ${error.message}</div>

<!-- Processing with aliasing -->
<div data-await="fetch('/api/users')">Loading users...</div>
<div data-then="response >> response.json() as users">
	<div data-each="users as user">${user.name}</div>
</div>
<div data-catch="error >> handleError(error)">Unable to load users</div>

<!-- Direct content insertion -->
<div data-await="fetch('/partial/sidebar')">Loading sidebar...</div>
<div data-then="response >> response.text()" data-bind.innerHTML="html"></div>
<div data-catch="error">Failed to load sidebar</div>

<!-- Target-based content insertion -->
<div id="content-area">
	<p>Default content here</p>
	<button
		data-onclick="fetch('/api/content') >> response.text() >> replace(#content-area)"
	>
		Refresh Content
	</button>
</div>

<!-- Multiple insertion methods -->
<div id="messages"></div>
<button data-onclick="getNewMessage() >> append(#messages)">Add Message</button>
<button data-onclick="getHeader() >> prepend(#messages)">Add Header</button>
<button data-onclick="getSidebar() >> swap(#messages)">
	Replace with Sidebar
</button>

<!-- Complex processing chain -->
<div data-await="fetch('/api/data')">Loading filtered data...</div>
<div
	data-then="response >> response.json() >> data.filter(item => item.active) as filteredData"
>
	<div data-each="filteredData as item">${item.title}</div>
</div>
```

    	Load Sidebar
    </button>
    <!-- Target element receives HTML via data-bind -->
    <div id="sidebar" data-bind="innerHTML: html"></div>

</div>
```

**Event handlers:**

```html
<!-- Function calls -->
<button data-onclick="handleClick()">Click me</button>
<form data-onsubmit="handleSubmit(event)">...</form>
<input data-onchange="validateInput(event.target.value)" />

<!-- State assignments -->
<button data-onclick="@isLoading = true">Start Loading</button>
<input data-onchange="@user.name = event.target.value" />

<!-- Arrow functions -->
<button data-onclick="() => @counter++">Increment</button>
<button data-onclick="(e) => console.log('Clicked:', e)">Log Click</button>

<!-- Complex expressions -->
<button data-onclick="@cart.items.length > 0 ? checkout() : showEmptyCart()">
	Checkout
</button>
```

**Multiple properties with new syntax:**

```typescript
const buttonState = State.create({
	innerText: "Click me",
	disabled: false,
});

const user = State.create({
	name: "John",
	email: "john@example.com",
	isActive: true,
});
```

```html
<!-- Individual property binding -->
<button
	data-bind.innerText="@buttonState.innerText"
	data-bind.disabled="@buttonState.disabled"
>
	Default text (will be overridden)
</button>

<!-- Using aliasing for cleaner references -->
<div data-scope="@user as u">
	<input data-bind.value="u.name" />
	<input data-bind.value="u.email" />
	<div data-if="u.isActive">User is active</div>
</div>
```

### State Creation & Binding

Manifold provides reactive state management with two main approaches:

1. **JavaScript/TypeScript state creation** using the State API
2. **Expression-based binding** with automatic state tracking and aliasing

**State creation:**

```typescript
// Basic state creation
const user = State.create({
	name: "John Doe",
	email: "john@example.com",
	isActive: true,
});

// Computed states
const userDisplay = State.computed(() => `${user.name} (${user.email})`);

// State with methods
const counter = State.create({
	value: 0,
	increment: () => counter.value++,
	decrement: () => counter.value--,
});
```

**Expression-based state:**

```html
<!-- Expressions are automatically converted to reactive state -->
<div data-if="@user.age >= 18">Adult content</div>
<div data-each="@products.filter(p => p.inStock) as product">
	Available: ${product.name}
</div>
<input data-bind.value="@user.email || 'Enter email'" />

<!-- State aliasing for complex references -->
<div data-scope="@app.user.profile as profile, @app.settings.theme as theme">
	<div data-if="profile.isVisible && theme === 'dark'">
		Dark mode profile content
	</div>
</div>

<!-- Aliasing in loops and expressions -->
<div data-each="@store.inventory.electronics as device">
	<h3>${device.name}</h3>
	<p data-if="device.inStock as available">
		${available ? 'In Stock' : 'Out of Stock'}
	</p>
</div>
```

**Usage examples:**

```html
<!-- Individual property binding -->
<button
	data-bind.innerText="@submitButton.text"
	data-bind.disabled="@submitButton.disabled"
	data-onclick="submitForm()"
>
	Default text
</button>
<input
	data-bind.value="@emailInput.value"
	data-bind.placeholder="@emailInput.placeholder"
	data-onchange="validateEmail(event.target.value)"
/>

<!-- Using aliasing for complex state -->
<div data-scope="@customState as state">
	<div data-if="state.isVisible">
		<p>Count: ${state.count}</p>
		<ul>
			<li data-each="state.items as item">${item}</li>
			<li data-else>No items available</li>
		</ul>
	</div>
</div>

<!-- Complex property binding with processing -->
<select
	data-bind.value="@selectedValue"
	data-onchange="@selectedValue = event.target.value"
>
	<option
		data-each="@optionsList as option"
		data-bind.value="option.value"
		data-bind.selected="option.value === @selectedValue"
	>
		${option.label}
	</option>
</select>

<!-- Reactive forms with sync -->
<form data-onsubmit="handleSubmit(event)">
	<input
		type="text"
		data-sync.value="@user.firstName >> validateName()"
		placeholder="First Name"
	/>
	<input
		type="email"
		data-sync.value="@user.email >> validateEmail()"
		placeholder="Email"
	/>
	<button type="submit" data-bind.disabled="!@user.firstName || !@user.email">
		Submit
	</button>
</form>
```

## TODO: Areas for Improvement & Missing Framework Features

### 🏗️ Component System (Planned)

-   [ ] **Component Abstraction**: Create reusable UI components with props/slots equivalent
    -   Custom element integration: `<user-card data-props="@user" data-emit="userUpdated"></user-card>`
    -   Component composition patterns
    -   Slot/children content projection
-   [ ] **Component Registration**: System for registering and managing custom components
-   [ ] **Component State**: Isolated state management within components
-   [ ] **Component Communication**: Parent-child and sibling component communication patterns

### 🗄️ Advanced State Management (Planned)

-   [ ] **Global State Store**: Built-in store pattern for application-wide state
    -   Centralized state management
    -   State modules/namespacing
    -   State persistence/hydration
-   [ ] **State Middleware**: Pluggable middleware system for state transformations
    -   Logging middleware
    -   Validation middleware
    -   Async action middleware
-   [ ] **State Debugging**: Development tools for state inspection
    -   State change logging
    -   Time-travel debugging capabilities
    -   State diff visualization

### 🛠️ Developer Experience Improvements

-   [ ] **Runtime Type Checking**: Optional runtime validation for state and expressions
    -   State schema validation
    -   Expression type checking without build step
    -   Runtime warnings for type mismatches
-   [ ] **Better Error Messages**: Enhanced error reporting and debugging
    -   More descriptive error messages with context
    -   Stack traces that point to template locations
    -   Suggestions for common mistakes
-   [ ] **IDE Support**: Language server for better development experience
    -   Autocomplete for state references in templates
    -   Syntax highlighting for expressions
    -   Error squiggles in HTML attributes
-   [ ] **Development Tools**: Browser extension for debugging
    -   State inspector similar to React DevTools
    -   Component tree visualization
    -   Performance profiling

### 📚 API Enhancements

-   [ ] **Simplified Syntax Options**: More beginner-friendly alternatives
    -   `data-show="@isVisible"` as alternative to `data-if`
    -   `data-hide="@isLoading"` for inverse conditions
    -   `data-text="@userName"` as alternative to `${}`
-   [ ] **Animation/Transition Support**: Built-in animation helpers
    -   Integration with View Transitions API
    -   CSS transition helpers
    -   Animation lifecycle hooks
-   [ ] **Form Validation**: Enhanced form handling
    -   Built-in validation patterns
    -   Form state management
    -   Validation error handling
-   [ ] **Accessibility**: Enhanced a11y features
    -   ARIA attribute binding
    -   Screen reader announcements
    -   Keyboard navigation helpers

### 🔧 Performance & Optimization

-   [ ] **Bundle Size Optimization**: Tree-shaking and modular imports
-   [ ] **Performance Monitoring**: Built-in performance metrics
-   [ ] **Memory Management**: Better cleanup and garbage collection
-   [ ] **Lazy Loading**: Component and state lazy loading patterns

### 📖 Documentation & Ecosystem

-   [ ] **Migration Guides**: From React/Vue/Svelte to Manifold
-   [ ] **Best Practices**: Patterns and anti-patterns documentation
-   [ ] **Plugin System**: Extensibility for third-party additions
-   [ ] **Community Tools**: Linting rules, code formatters, testing utilities

### ❓ Research Items

-   [ ] **TypeScript Integration**: Explore options for typed templates without build pipeline
    -   Runtime type generation from TypeScript interfaces
    -   JSDoc-based type hints for expressions
    -   Optional type declaration files for better IDE support
-   [ ] **Server-Side Integration**: Better SSR/hydration patterns for MPA
-   [ ] **Progressive Enhancement**: Graceful degradation strategies
-   [ ] **Web Standards Alignment**: Leverage emerging web platform features

---

**Note**: The TypeScript templating integration remains challenging without introducing a build pipeline, which conflicts with Manifold's core philosophy of avoiding complex build steps. Research is ongoing for runtime-based solutions that could provide type safety without compilation requirements.
