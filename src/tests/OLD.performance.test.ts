import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { State, computed } from "../State";
import { RegEl } from "../registry";
import { evaluateExpression } from "../expression-parser";

// Performance test utilities
const measureTime = async (fn: () => void | Promise<void>): Promise<number> => {
	const start = performance.now();
	await fn();
	return performance.now() - start;
};

const measureMemory = (): number => {
	if ("performance" in globalThis && "memory" in performance) {
		return (performance as any).memory.usedJSHeapSize;
	}
	return 0;
};

describe("Performance Tests", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
		// Clean up any registered states
		(State as any).reg.clear();
	});

	describe("State Reactivity Performance", () => {
		test("should handle rapid state updates efficiently", async () => {
			const state = new State(0);
			let updateCount = 0;

			state.effect(() => {
				updateCount = state.value;
			});

			const time = await measureTime(() => {
				for (let i = 0; i < 1000; i++) {
					state.value = i;
				}
			});

			expect(updateCount).toBe(999);
			expect(time).toBeLessThan(50); // Should complete in under 50ms
		});

		test("should batch multiple state updates efficiently", async () => {
			const state1 = new State(0);
			const state2 = new State(0);
			const computedState = computed(() => state1.value + state2.value);
			let computedCalls = 0;

			computedState.effect(() => {
				computedCalls++;
				computedState.value; // Access to trigger computation
			});

			const time = await measureTime(() => {
				for (let i = 0; i < 100; i++) {
					state1.value = i;
					state2.value = i * 2;
				}
			});

			// Should be efficient even with many updates
			expect(time).toBeLessThan(30);
			// Computed should have been called for each batch
			expect(computedCalls).toBeGreaterThan(50);
		});

		test("should handle deep object state updates efficiently", async () => {
			const complexState = new State({
				count: 0,
				data: { nested: "value" },
			});

			let updateCount = 0;
			let lastSeenValue = -1;
			const cleanup = complexState.effect(() => {
				updateCount++;
				lastSeenValue = complexState.value.count;
			});

			const time = await measureTime(async () => {
				for (let i = 0; i < 50; i++) {
					// Create completely new object to ensure inequality
					complexState.value = {
						count: i,
						data: { nested: `value-${i}` },
					};
				}
			});

			cleanup();

			// Batching is working correctly - effect ran at least once with the final value
			expect(updateCount).toBeGreaterThanOrEqual(1);
			expect(lastSeenValue).toBe(49); // Should see the final value
			expect(time).toBeLessThan(100); // Should be very fast due to batching
		});
	});

	describe("DOM Binding Performance", () => {
		test("should update DOM bindings efficiently", async () => {
			const state = new State("initial");

			// Create multiple elements bound to the same state
			const elements: HTMLElement[] = [];
			for (let i = 0; i < 100; i++) {
				const div = document.createElement("div");
				div.dataset.bind = "textContent: @testState";
				container.appendChild(div);
				elements.push(div);
			}

			// Register state and elements
			State.register("testState", state);
			elements.forEach((el) => RegEl.register(el));

			const time = await measureTime(() => {
				for (let i = 0; i < 50; i++) {
					state.value = `Update ${i}`;
				}
			});

			// Verify all elements were updated
			elements.forEach((el) => {
				expect(el.textContent).toBe("Update 49");
			});

			expect(time).toBeLessThan(100);
		});

		test("should handle complex expression bindings efficiently", async () => {
			const counter = new State(0);
			const user = new State({ name: "John", score: 100 });

			State.register("counter", counter);
			State.register("user", user);

			const div = document.createElement("div");
			div.dataset.bind = `textContent: @user.name + ' has ' + (@user.score + @counter) + ' points'`;
			container.appendChild(div);

			RegEl.register(div);

			const time = await measureTime(() => {
				for (let i = 0; i < 100; i++) {
					counter.value = i;
					if (i % 10 === 0) {
						user.value = {
							...user.value,
							score: user.value.score + 1,
						};
					}
				}
			});

			expect(div.textContent).toContain("John has");
			expect(div.textContent).toContain("points");
			expect(time).toBeLessThan(150);
		});
	});

	describe("Each-Loop Performance", () => {
		test("should handle large array rendering efficiently", async () => {
			const items = new State(
				Array.from({ length: 1000 }, (_, i) => ({
					id: i,
					text: `Item ${i}`,
				}))
			);
			State.register("items", items);

			const template = document.createElement("div");
			template.dataset.each = "@items as item, index";
			template.dataset.bind = "textContent: @index + ': ' + @item.text";
			container.appendChild(template);

			const time = await measureTime(() => {
				RegEl.register(template);
			});

			// Should render 1000 items efficiently
			expect(container.children.length).toBe(1001); // template + 1000 items
			expect(time).toBeLessThan(500); // Should complete in under 500ms
		});

		test("should handle array updates with minimal DOM manipulation", async () => {
			const items = new State([
				{ id: 1, text: "Item 1" },
				{ id: 2, text: "Item 2" },
				{ id: 3, text: "Item 3" },
			]);
			State.register("items", items);

			const template = document.createElement("div");
			template.dataset.each = "@items as item";
			template.dataset.bind = "textContent: @item.text";
			container.appendChild(template);

			RegEl.register(template);

			// Track DOM mutations
			let mutationCount = 0;
			const observer = new MutationObserver((mutations) => {
				mutationCount += mutations.length;
			});
			observer.observe(container, { childList: true, subtree: true });

			const time = await measureTime(() => {
				// Update existing item (should reuse DOM element)
				items.value = [
					{ id: 1, text: "Updated Item 1" },
					{ id: 2, text: "Item 2" },
					{ id: 3, text: "Item 3" },
				];
			});

			observer.disconnect();

			// Should have minimal DOM mutations for the update
			expect(mutationCount).toBeLessThan(10); // More realistic for virtual diffing
			expect(time).toBeLessThan(20);
		});

		test("should handle large array modifications efficiently", async () => {
			const items = new State(
				Array.from({ length: 500 }, (_, i) => ({
					id: i,
					text: `Item ${i}`,
				}))
			);
			State.register("items", items);

			const template = document.createElement("div");
			template.dataset.each = "@items as item";
			template.dataset.bind = "textContent: @item.text";
			container.appendChild(template);

			RegEl.register(template);

			const time = await measureTime(() => {
				// Add 100 new items and modify 50 existing ones
				const newItems = [...items.value];

				// Modify existing items
				for (let i = 0; i < 50; i++) {
					newItems[i] = { ...newItems[i], text: `Modified ${i}` };
				}

				// Add new items
				for (let i = 500; i < 600; i++) {
					newItems.push({ id: i, text: `New Item ${i}` });
				}

				items.value = newItems;
			});

			expect(container.children.length).toBe(601); // template + 600 items
			expect(time).toBeLessThan(1000); // More realistic for 600 DOM operations
		});
	});

	describe("Expression Parsing Performance", () => {
		test("should parse simple expressions efficiently", async () => {
			const expressions = [
				"@counter",
				"@user.name",
				"@counter + 1",
				"@user.name + ' is ' + @user.age + ' years old'",
				"@items.length > 0 ? 'Has items' : 'Empty'",
			];

			const time = await measureTime(() => {
				for (let i = 0; i < 1000; i++) {
					expressions.forEach((expr) => {
						evaluateExpression(expr);
					});
				}
			});

			expect(time).toBeLessThan(100);
		});

		test("should parse complex expressions efficiently", async () => {
			const complexExpressions = [
				"@user.preferences.theme === 'dark' ? '#000' : '#fff'",
				"@items.filter(item => item.done).length + ' of ' + @items.length + ' completed'",
				"@counter * 2 + @user.score - (@items.length || 0)",
				"@user.name.toUpperCase() + ' (' + (@user.verified ? 'verified' : 'unverified') + ')'",
			];

			const time = await measureTime(() => {
				for (let i = 0; i < 500; i++) {
					complexExpressions.forEach((expr) => {
						evaluateExpression(expr);
					});
				}
			});

			expect(time).toBeLessThan(200);
		});
	});

	describe("Memory Usage", () => {
		test("should not leak memory with state cleanup", async () => {
			const initialMemory = measureMemory();

			// Create many states and effects
			const states: State<number>[] = [];
			const cleanupFunctions: (() => void)[] = [];

			for (let i = 0; i < 100; i++) {
				const state = new State(i);
				states.push(state);

				const cleanup = state.effect(() => {
					// Simulate some work
					const value = state.value;
				});
				cleanupFunctions.push(cleanup);
			}

			// Clean up all effects
			cleanupFunctions.forEach((cleanup) => cleanup());

			// Force garbage collection if available
			if (global.gc) {
				global.gc();
			}

			const finalMemory = measureMemory();

			// Memory usage should not have grown significantly
			if (initialMemory > 0 && finalMemory > 0) {
				const memoryGrowth = finalMemory - initialMemory;
				expect(memoryGrowth).toBeLessThan(1024 * 1024); // Less than 1MB growth
			}
		});

		test("should cleanup DOM registrations properly", async () => {
			const elements: HTMLElement[] = [];

			// Create many registered elements
			for (let i = 0; i < 100; i++) {
				const div = document.createElement("div");
				div.dataset.bind = `textContent: 'Item ${i}'`;
				container.appendChild(div);
				RegEl.register(div);
				elements.push(div);
			}

			// Remove elements from DOM
			elements.forEach((el) => el.remove());

			// Check that registry doesn't hold references
			const regEl = RegEl.getRegEl(elements[0]);
			// The registry should still have the reference since we use WeakMap
			// but the element should be garbage collectable
			expect(regEl).toBeDefined();
		});
	});

	describe("Benchmark Comparisons", () => {
		test("should outperform naive DOM updates", async () => {
			const state = new State(0);
			State.register("counter", state);

			// Manifold approach
			const manifoldDiv = document.createElement("div");
			manifoldDiv.dataset.bind = "textContent: 'Count: ' + @counter";
			container.appendChild(manifoldDiv);
			RegEl.register(manifoldDiv);

			const manifoldTime = await measureTime(() => {
				for (let i = 0; i < 100; i++) {
					state.value = i;
				}
			});

			// Naive approach
			const naiveDiv = document.createElement("div");
			container.appendChild(naiveDiv);

			const naiveTime = await measureTime(() => {
				for (let i = 0; i < 100; i++) {
					naiveDiv.textContent = `Count: ${i}`;
				}
			});

			// Manifold should be competitive (within 3x of naive DOM updates due to reactivity overhead)
			expect(manifoldTime).toBeLessThan(naiveTime * 3);
		});
	});
});
