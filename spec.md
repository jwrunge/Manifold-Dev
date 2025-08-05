# Manifold

Manifold is a reactive state management and front-end templating library that aims to be small, simple, performant, efficient, and convenient. Manifold provides features common in frameworks like React, Vue, and Svelte without requiring complex build systems, compilers, or coding practices.

**Design Philosophy**: Simple things should be simple, complex things should be possible.

## API

Manifold uses a combination of data attributes for control flow and standard HTML attributes with expression syntax for binding, syncing, and event handling.

## Element Registration

Elements and their children can be registered for Manifold processing using `data-mf-register`. Within registered elements, Manifold will process all attributes looking for expression syntax. Use `data-mf-ignore` to exclude specific elements from processing.

```html
<!-- Register an element and its children for Manifold processing -->
<div data-mf-register>
	<!-- All attributes on this and child elements will be processed -->
	<input
		type="${inputType}"
		value="${user.name}"
		onchange="${event => user.name = event.currentTarget.value}"
	/>

	<!-- Ignore this specific element -->
	<div data-mf-ignore>
		<input type="text" onchange="regularJavaScript()" />
	</div>
</div>
```

## Expression Syntax

Within registered elements, Manifold uses `${}` syntax for:

-   **Property Binding**: `<input type="${myInputType}" />`
-   **Binding with Sync**: `<input value="${user.name >> (name) => processedName = validateName(name)}" />`
-   **Event Handlers**: `<input onchange="${event => user.name = event.currentTarget.value}" />`

**Context-Aware Expression Syntax**:

-   **Simple binding**: Single expression only (no `>>` processing)
-   **Sync binding**: `expression >> (resultVar) => syncExpression` - The `>>` operator splits binding from syncing
-   **Event handlers**: Single expression only - event handlers cannot use `>>` syntax
-   **DOM insertion**: Use `@` prefixed functions like `@append`, `@prepend`, `@replace`, `@swap`

### Data Attributes for Control Flow

| Attribute   | Purpose                                                                                           | Example                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| data-if     | Conditional rendering - shows element when expression is truthy                                   | `<div data-if="isVisible">Content</div>`                                                                                                                    |
| data-elseif | Alternative condition - sibling of data-if for additional conditions                              | `<div data-elseif="showAlternative">Alt content</div>`                                                                                                      |
| data-else   | Fallback content - works with data-if and data-each. For async operations, use data-catch instead | `<div data-else>Default content</div>`                                                                                                                      |
| data-each   | Repeats element for each array item, with optional aliasing using `as` syntax                     | `<div data-each="items">Item: ${value}</div>`, `<div data-each="items as item">Item: ${item.name}</div>`                                                    |
| data-await  | Shows loading content while promise is pending                                                    | `<div data-await="fetchUser()">Loading...</div>`                                                                                                            |
| data-then   | Enhanced: Variable scoping, processing, or DOM insertion for async results                        | `<div data-then="profile">${profile.name}</div>`, `<div data-then="response >> (res) => @replace('#content', res.html)">${data.name}</div>`                 |
| data-catch  | Shows content when promise rejects, with error available as $error                                | `<div data-catch="error">Error: ${error.message}</div>`, `<div data-catch="err >> (error) => @append('#errors', error.message)">Something went wrong</div>` |

### Registration Attributes

| Attribute        | Purpose                                                          | Example                                                        |
| ---------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| data-mf-register | Registers element and children for Manifold processing           | `<div data-mf-register><!-- Manifold processes this --></div>` |
| data-mf-ignore   | Excludes element from Manifold processing within registered tree | `<div data-mf-ignore><!-- Regular HTML --></div>`              |

**State Aliasing**: Use `state.property as alias` syntax in data-each and data-then for readable aliases.

**Interpolation**: Use `${expression}` syntax within element content to display dynamic values.

### DOM Insertion Functions

Manifold provides built-in DOM insertion functions prefixed with `@`:

| Function   | Purpose                           | Syntax                                                      |
| ---------- | --------------------------------- | ----------------------------------------------------------- |
| `@append`  | Append content to target element  | `@append("#selector", content)` or `@append("#selector")`   |
| `@prepend` | Prepend content to target element | `@prepend("#selector", content)` or `@prepend("#selector")` |
| `@replace` | Replace target element's content  | `@replace("#selector", content)` or `@replace("#selector")` |
| `@swap`    | Replace target element entirely   | `@swap("#selector", content)` or `@swap("#selector")`       |

When content parameter is omitted, the result variable is automatically used as string content.

#### Examples

**Element Registration:**

```html
<!-- Register a form and its children for processing -->
<form data-mf-register onsubmit="${event => handleSubmit(event)}">
	<input
		type="text"
		value="${user.name}"
		onchange="${event => user.name = event.currentTarget.value}"
	/>
	<input
		type="email"
		value="${user.email}"
		onchange="${event => user.email = event.currentTarget.value}"
	/>
	<button type="submit" disabled="${!user.name || !user.email}">
		Submit
	</button>
</form>

<!-- Selectively ignore elements -->
<div data-mf-register>
	<!-- This input is processed by Manifold -->
	<input type="text" value="${dynamicValue}" />

	<!-- This div and its children are ignored -->
	<div data-mf-ignore>
		<input type="text" onchange="regularJavaScript()" />
	</div>
</div>
```

**Conditional rendering:**

```html
<div data-mf-register>
	<div data-if="user.isLoggedIn">Welcome back, ${user.name}!</div>
	<div data-elseif="user.isGuest">Hello, guest!</div>
	<div data-else>Please log in</div>
</div>
```

**List rendering:**

```html
<div data-mf-register>
	<!-- Basic iteration -->
	<ul>
		<li data-each="products">Product: ${value.name} - $${value.price}</li>
	</ul>

	<!-- With aliasing for readability -->
	<ul>
		<li data-each="products as product">
			${product.name} - $${product.price}
		</li>
	</ul>

	<!-- Complex state aliasing -->
	<ul>
		<li data-each="store.inventory.items as product">
			${product.name} - $${product.price}
		</li>
	</ul>

	<!-- With fallback for empty arrays -->
	<ul>
		<li data-each="products as product">
			${product.name} - ${product.price}
		</li>
		<li data-else>No products available</li>
	</ul>
</div>
```

**Property binding:**

```html
<div data-mf-register>
	<!-- Simple property binding -->
	<input type="${inputType}" value="${username}" />
	<input type="email" value="${email}" disabled="${isReadonly}" />
	<button disabled="${isLoading}">Click me</button>

	<!-- Binding with sync processing -->
	<input
		type="text"
		value="${username >> (name) => processedName = name.trim()}"
	/>
	<input
		type="email"
		value="${email >> (email) => validatedEmail = validateEmail(email)}"
	/>
	<textarea
		value="${message >> (msg) => wordCount = updateWordCount(msg)}"
	></textarea>

	<!-- Event handlers (no >> syntax allowed) -->
	<button onclick="${handleClick}">Click me</button>
	<button onclick="${() => user.save()}">Save User</button>
	<form onsubmit="${event => handleSubmit(event)}">...</form>
	<input onchange="${event => user.name = event.currentTarget.value}" />

	<!-- Event handlers with DOM insertion -->
	<button
		onclick="${() => fetchPosts().then(posts => @append('#posts-list', posts.html))}"
	>
		Load More Posts
	</button>
	<button
		onclick="${() => getNotification().then(notif => @prepend('#notifications', notif.html))}"
	>
		Add Alert
	</button>
	<button
		onclick="${() => generateReport().then(report => @replace('#main-content', report.html))}"
	>
		Generate Report
	</button>
</div>
```

**State aliasing:**

```html
<div data-mf-register>
	<!-- Aliasing in data-each for readability -->
	<div data-each="store.inventory.items as product">
		<h3>${product.name}</h3>
		<p>Price: $${product.price}</p>
		<div data-if="product.inStock">Available</div>
	</div>

	<!-- Aliasing in data-then for processing -->
	<div data-await="fetch('/api/user')">Loading...</div>
	<div data-then="response >> (res) => res.json() as userData">
		<h1>Welcome, ${userData.name}!</h1>
		<p>Email: ${userData.email}</p>
	</div>

	<!-- Direct state references (clean and simple) -->
	<div data-if="currentUser.isLoggedIn">
		<h1>Hello ${currentUser.name}</h1>
		<div data-if="cartItems.length > 0">
			<div data-each="cartItems as item">
				${item.title} - $${item.price}
			</div>
		</div>
		<div data-else>Your cart is empty</div>
	</div>

	<!-- Complex state references with aliasing -->
	<div data-if="app.user.preferences.theme as theme">
		<div class="${theme === 'dark' ? 'dark-mode' : 'light-mode'}">
			Current theme: ${theme}
		</div>
	</div>
</div>
```

### Advanced Features

**Async content:**

```html
<div data-mf-register>
	<!-- Basic async content -->
	<div data-await="fetchUserProfile()">Loading user profile...</div>
	<div data-then="profile">
		<h2>${profile.name}</h2>
		<p>${profile.bio}</p>
	</div>
	<div data-catch="error">Error loading profile: ${error.message}</div>

	<!-- Processing with aliasing -->
	<div data-await="fetch('/api/users')">Loading users...</div>
	<div data-then="response >> (res) => res.json() as users">
		<div data-each="users as user">${user.name}</div>
	</div>
	<div data-catch="error >> (err) => @append('#error-log', err.message)">
		Unable to load users
	</div>

	<!-- Direct content insertion -->
	<div data-await="fetch('/partial/sidebar')">Loading sidebar...</div>
	<div data-then="response >> (res) => @replace('#sidebar', res.text())">
		Sidebar loaded!
	</div>
	<div data-catch="error">Failed to load sidebar</div>

	<!-- Target-based content insertion -->
	<div id="content-area">
		<p>Default content here</p>
		<button
			onclick="${() => fetch('/api/content').then(res => @replace('#content-area', res.text()))}"
		>
			Refresh Content
		</button>
	</div>

	<!-- Multiple insertion methods -->
	<div id="messages"></div>
	<button
		onclick="${() => getNewMessage().then(msg => @append('#messages', msg.html))}"
	>
		Add Message
	</button>
	<button
		onclick="${() => getHeader().then(header => @prepend('#messages', header.html))}"
	>
		Add Header
	</button>
	<button
		onclick="${() => getSidebar().then(sidebar => @replace('#messages', sidebar.html))}"
	>
		Replace with Sidebar
	</button>

	<!-- Complex processing chain with DOM insertion -->
	<div data-await="fetch('/api/data')">Loading filtered data...</div>
	<div
		data-then="response >> (res) => res.json().filter(item => item.active) >> (filtered) => @replace('#filtered-results', filtered.map(item => item.html).join(''))"
	></div>
</div>
```

**Three data-then usage patterns:**

```html
<div data-mf-register>
	<!-- 1. Simple variable scoping -->
	<div data-await="fetchUserProfile()">Loading profile...</div>
	<div data-then="profile">
		<h2>${profile.name}</h2>
		<p>${profile.email}</p>
		<p>Joined: ${profile.joinDate}</p>
	</div>

	<!-- 2. Processing with aliasing -->
	<div data-await="fetch('/api/posts')">Loading posts...</div>
	<div data-then="response >> (res) => res.json() as posts">
		<div data-each="posts as post">
			<h3>${post.title}</h3>
			<p>${post.excerpt}</p>
		</div>
	</div>

	<!-- 3. DOM insertion into other elements -->
	<div data-await="generateReport()">Generating report...</div>
	<div
		data-then="report >> (rep) => formatReport(rep) >> (formatted) => @replace('#report-container', formatted)"
	>
		Report processing complete!
	</div>

	<!-- Mixed patterns in a complete workflow -->
	<div id="user-dashboard">
		<div data-await="fetchDashboardData()">Loading dashboard...</div>

		<!-- Display user info -->
		<div data-then="data >> (d) => d.user as user">
			<h1>Welcome, ${user.name}!</h1>
		</div>

		<!-- Process and display notifications -->
		<div
			data-then="data >> (d) => markAsRead(d.notifications) as notifications"
		>
			<div data-each="notifications as notification">
				${notification.message}
			</div>
		</div>

		<!-- Insert sidebar content -->
		<div
			data-then="data >> (d) => renderSidebar(d.sidebar) >> (html) => @replace('#sidebar', html)"
		></div>
	</div>
</div>
```

**Event handlers:**

```html
<div data-mf-register>
	<!-- Function calls -->
	<button onclick="${handleClick}">Click me</button>
	<form onsubmit="${event => handleSubmit(event)}">...</form>
	<input onchange="${event => validateInput(event.target.value)}" />

	<!-- State assignments -->
	<button onclick="${() => isLoading = true}">Start Loading</button>
	<input onchange="${event => user.name = event.target.value}" />

	<!-- Arrow functions -->
	<button onclick="${() => counter++}">Increment</button>
	<button onclick="${e => console.log('Clicked:', e)}">Log Click</button>

	<!-- Complex expressions -->
	<button
		onclick="${() => cart.items.length > 0 ? checkout() : showEmptyCart()}"
	>
		Checkout
	</button>

	<!-- Event handlers with async and DOM insertion -->
	<button
		onclick="${() => fetchUserData().then(user => @replace('#user-info', user.html))}"
	>
		Refresh User Info
	</button>
	<button
		onclick="${async () => { const data = await getData(); @append('#results', data.html); }}"
	>
		Load More Data
	</button>
</div>
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
<div data-mf-register>
	<!-- Property binding with expression syntax -->
	<button
		innerText="${buttonState.innerText}"
		disabled="${buttonState.disabled}"
	>
		Default text (will be overridden)
	</button>

	<!-- Direct state references (simple and clear) -->
	<div>
		<input value="${user.name}" />
		<input value="${user.email}" />
		<div data-if="user.isActive">User is active</div>
	</div>

	<!-- Binding with sync processing -->
	<input value="${user.name >> (name) => displayName = name.toUpperCase()}" />
	<input
		value="${user.email >> (email) => validEmail = validateEmail(email)}"
	/>
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
<div data-mf-register>
	<!-- Expressions are automatically converted to reactive state -->
	<div data-if="user.age >= 18">Adult content</div>
	<div data-each="products.filter(p => p.inStock) as product">
		Available: ${product.name}
	</div>
	<input value="${user.email || 'Enter email'}" />

	<!-- Direct state references work great -->
	<div data-if="app.user.profile.isVisible && app.settings.theme === 'dark'">
		Dark mode profile content
	</div>

	<!-- Or use computed states for complex logic -->
	<div data-if="isDarkModeProfile">Computed dark mode profile content</div>

	<!-- Aliasing in loops and expressions -->
	<div data-each="store.inventory.electronics as device">
		<h3>${device.name}</h3>
		<p data-if="device.inStock as available">
			${available ? 'In Stock' : 'Out of Stock'}
		</p>
	</div>
</div>
```

**Usage examples:**

```html
<div data-mf-register>
	<!-- Property binding with expression syntax -->
	<button
		innerText="${submitButton.text}"
		disabled="${submitButton.disabled}"
		onclick="${submitForm}"
	>
		Default text
	</button>
	<input
		value="${emailInput.value}"
		placeholder="${emailInput.placeholder}"
		onchange="${event => validateEmail(event.target.value)}"
	/>

	<!-- Direct state references work perfectly -->
	<div data-if="customState.isVisible">
		<p>Count: ${customState.count}</p>
		<ul>
			<li data-each="customState.items as item">${item}</li>
			<li data-else>No items available</li>
		</ul>
	</div>

	<!-- Complex property binding with processing -->
	<select
		value="${selectedValue}"
		onchange="${event => selectedValue = event.target.value}"
	>
		<option
			data-each="optionsList as option"
			value="${option.value}"
			selected="${option.value === selectedValue}"
		>
			${option.label}
		</option>
	</select>

	<!-- Reactive forms with sync -->
	<form onsubmit="${event => handleSubmit(event)}">
		<input
			type="text"
			value="${user.firstName >> (name) => validatedName = validateName(name)}"
			placeholder="First Name"
		/>
		<input
			type="email"
			value="${user.email >> (email) => validatedEmail = validateEmail(email)}"
			placeholder="Email"
		/>
		<button type="submit" disabled="${!user.firstName || !user.email}">
			Submit
		</button>
	</form>
</div>
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
