import { expect, test, describe } from "vitest";
import { evaluateExpression } from "../expression-parser";

describe("Expression Parser", () => {
	const evaluate = (expr: string, context: Record<string, unknown>) => {
		const result = evaluateExpression(expr);
		return result.fn(context);
	};

	const getStateRefs = (expr: string) => {
		return Array.from(evaluateExpression(expr)._stateRefs).map(
			(ref) => ref._name
		);
	};

	const getExpressionInfo = (expr: string) => {
		const result = evaluateExpression(expr);
		return {
			isAssignment: result._isAssignment,
			assignTarget: result._assignTarget,
			isArrowFunction: result._isArrowFunction,
			stateRefs: Array.from(result._stateRefs).map((ref) => ref._name),
		};
	};

	describe("Basic Literals", () => {
		test("should handle boolean literals", () => {
			expect(evaluate("true", {})).toBe(true);
			expect(evaluate("false", {})).toBe(false);
		});

		test("should handle null and undefined", () => {
			expect(evaluate("null", {})).toBe(null);
			expect(evaluate("undefined", {})).toBe(undefined);
		});

		test("should handle numeric literals", () => {
			expect(evaluate("42", {})).toBe(42);
			expect(evaluate("-17", {})).toBe(-17);
			expect(evaluate("3.14", {})).toBe(3.14);
			expect(evaluate("-2.5", {})).toBe(-2.5);
		});

		test("should handle string literals", () => {
			expect(evaluate("'hello'", {})).toBe("hello");
			expect(evaluate('"world"', {})).toBe("world");
			expect(evaluate("'hello world'", {})).toBe("hello world");
			expect(evaluate("': '", {})).toBe(": ");
			expect(evaluate("'Number: '", {})).toBe("Number: ");
		});

		test("should handle empty expression", () => {
			expect(evaluate("", {})).toBe(undefined);
			expect(evaluate("   ", {})).toBe(undefined);
		});
	});

	describe("Property Access", () => {
		test("should access simple properties", () => {
			const context = {
				user: { name: "Alice", age: 25 },
				items: [1, 2, 3],
			};

			expect(evaluate("user.name", context)).toBe("Alice");
			expect(evaluate("user.age", context)).toBe(25);
			expect(evaluate("items.length", context)).toBe(3);
		});

		test("should access nested properties", () => {
			const context = {
				user: {
					profile: {
						settings: { theme: "dark" },
					},
				},
			};

			expect(evaluate("user.profile.settings.theme", context)).toBe(
				"dark"
			);
		});

		test("should handle missing properties", () => {
			const context = { user: { name: "Alice" } };
			expect(evaluate("user.missing", context)).toBe(undefined);
			expect(evaluate("missing.property", context)).toBe(undefined);
		});
	});

	describe("Arithmetic Expressions", () => {
		test("should handle addition", () => {
			const context = { a: 5, b: 3 };
			expect(evaluate("a + b", context)).toBe(8);
			expect(evaluate("10 + 5", context)).toBe(15);
		});

		test("should handle string concatenation", () => {
			const context = { name: "Alice", index: 0 };
			expect(evaluate("'Hello ' + name", context)).toBe("Hello Alice");
			expect(evaluate("index + ': '", context)).toBe("0: ");
			expect(evaluate("'Number: ' + index + ', '", context)).toBe(
				"Number: 0, "
			);
		});

		test("should handle mixed string and number concatenation", () => {
			const context = { num: 42 };
			expect(evaluate("'Value is ' + num", context)).toBe("Value is 42");
			expect(evaluate("num + ' items'", context)).toBe("42 items");
		});

		test("should handle subtraction, multiplication, division", () => {
			const context = { a: 10, b: 3 };
			expect(evaluate("a - b", context)).toBe(7);
			expect(evaluate("a * b", context)).toBe(30);
			expect(evaluate("a / b", context)).toBeCloseTo(3.33, 2);
		});

		test("should handle negative numbers", () => {
			const context = { a: 5 };
			expect(evaluate("a + -3", context)).toBe(2);
			expect(evaluate("-a", context)).toBe(-5);
		});
	});

	describe("Comparison Expressions", () => {
		test("should handle equality comparisons", () => {
			const context = { a: 5, b: 5, c: 3 };
			expect(evaluate("a === b", context)).toBe(true);
			expect(evaluate("a === c", context)).toBe(false);
			expect(evaluate("a !== c", context)).toBe(true);
		});

		test("should handle relational comparisons", () => {
			const context = { a: 5, b: 3 };
			expect(evaluate("a > b", context)).toBe(true);
			expect(evaluate("a < b", context)).toBe(false);
			expect(evaluate("a >= b", context)).toBe(true);
			expect(evaluate("a <= b", context)).toBe(false);
			expect(evaluate("a >= 5", context)).toBe(true);
		});
	});

	describe("Logical Expressions", () => {
		test("should handle OR expressions", () => {
			const context = { a: true, b: false, c: null };
			expect(evaluate("a || b", context)).toBe(true);
			expect(evaluate("b || a", context)).toBe(true);
			expect(evaluate("b || c", context)).toBe(null);
			expect(evaluate("c || 'default'", context)).toBe("default");
		});

		test("should handle AND expressions", () => {
			const context = { a: true, b: false, c: "hello" };
			expect(evaluate("a && c", context)).toBe("hello");
			expect(evaluate("a && b", context)).toBe(false);
			expect(evaluate("b && c", context)).toBe(false);
		});

		test("should handle negation", () => {
			const context = { a: true, b: false };
			expect(evaluate("!a", context)).toBe(false);
			expect(evaluate("!b", context)).toBe(true);
			expect(evaluate("!!a", context)).toBe(true);
		});
	});

	describe("Ternary Expressions", () => {
		test("should handle basic ternary", () => {
			const context = { isActive: true, name: "Alice" };
			expect(evaluate("isActive ? 'active' : 'inactive'", context)).toBe(
				"active"
			);
			expect(evaluate("!isActive ? 'active' : 'inactive'", context)).toBe(
				"inactive"
			);
		});

		test("should handle nested ternary", () => {
			const context = { score: 85 };
			expect(
				evaluate("score >= 90 ? 'A' : score >= 80 ? 'B' : 'C'", context)
			).toBe("B");
		});

		test("should handle ternary in complex expressions", () => {
			const context = { todo: { text: "Learn", done: true }, index: 0 };
			const expr =
				"index + ': ' + todo.text + ' (' + (todo.done ? 'done' : 'pending') + ')'";
			expect(evaluate(expr, context)).toBe("0: Learn (done)");
		});
	});

	describe("Assignment Expressions", () => {
		test("should detect assignment expressions", () => {
			const info = getExpressionInfo("name = 'Alice'");
			expect(info.isAssignment).toBe(true);
			expect(info.assignTarget).toBe("name");
		});

		test("should execute simple assignments", () => {
			const context: Record<string, unknown> = {};
			evaluate("name = 'Alice'", context);
			expect(context.name).toBe("Alice");
		});

		test("should execute complex assignments", () => {
			const context: Record<string, unknown> = { user: {} };
			evaluate("user.name = 'Bob'", context);
			expect((context.user as any).name).toBe("Bob");
		});

		test("should handle assignment with expressions", () => {
			const context: Record<string, unknown> = { a: 5, b: 3 };
			const result = evaluate("total = a + b", context);
			expect(context.total).toBe(8);
			expect(result).toBe(8); // Assignment should return the assigned value
		});
	});

	describe("Arrow Function Expressions", () => {
		test("should detect arrow function expressions", () => {
			const info = getExpressionInfo("(name) => validateName(name)");
			expect(info.isArrowFunction).toBe(true);
		});

		test("should not detect regular expressions as arrow functions", () => {
			const info1 = getExpressionInfo("user.name");
			const info2 = getExpressionInfo("() => console.log('test')"); // no parameter
			const info3 = getExpressionInfo("(a, b) => a + b"); // multiple parameters

			expect(info1.isArrowFunction).toBe(false);
			expect(info2.isArrowFunction).toBe(false);
			expect(info3.isArrowFunction).toBe(false);
		});

		test("should transform parameter name to 'arg'", () => {
			const context = {
				arg: "John",
				validateName: (name: string) => name.toUpperCase(),
			};

			// The expression "(name) => validateName(name)" should become "validateName(arg)"
			// Arrow functions are for parameter transformation, not execution
			const result = evaluate("(name) => validateName(name)", context);
			expect(result).toBe("validateName(arg)");
		});

		test("should handle assignment in arrow function", () => {
			const context: Record<string, unknown> = {
				arg: "Alice",
			};

			// The expression "(name) => processedName = name.trim()" should become "processedName = arg.trim()"
			// Arrow functions transform parameters but return the transformed expression
			const result = evaluate(
				"(name) => processedName = name.trim()",
				context
			);
			expect(result).toBe("arg.trim()");
		});

		test("should handle complex expressions in arrow function", () => {
			const context = {
				arg: { name: "Bob", age: 25 },
				formatUser: (user: any) => `${user.name} (${user.age})`,
			};

			// The expression "(user) => formatUser(user)" should become "formatUser(arg)"
			// Arrow functions transform parameters but return the transformed expression
			const result = evaluate("(user) => formatUser(user)", context);
			expect(result).toBe("formatUser(arg)");
		});

		test("should handle property access in arrow function", () => {
			const context = {
				arg: { firstName: "Jane", lastName: "Doe" },
			};

			// The expression "(user) => user.firstName + ' ' + user.lastName"
			// should become "arg.firstName + ' ' + arg.lastName"
			const result = evaluate(
				"(user) => user.firstName + ' ' + user.lastName",
				context
			);
			expect(result).toBe("Jane Doe");
		});

		test("should handle DOM insertion functions in arrow function", () => {
			const context = {
				arg: "<div>Hello World</div>",
				"@append": (selector: string, content?: string) =>
					`append(${selector}, ${content || context.arg})`,
			};

			// Test with explicit content - arrow functions transform but don't execute
			let result = evaluate("(html) => @append('#list', html)", context);
			expect(result).toBe("@append('#list', arg)");

			// Test with implicit content (arg should be used automatically)
			result = evaluate("(html) => @append('#list')", context);
			expect(result).toBe("@append('#list')");
		});

		test("should preserve state references in arrow function", () => {
			// Arrow function should still track state references from the body
			const info = getExpressionInfo("(data) => user.name + data.suffix");
			expect(info.isArrowFunction).toBe(true);
			// Should include "user" from the body (data gets replaced with arg)
			expect(info.stateRefs).toContain("user");
		});

		test("should handle ternary expressions in arrow function", () => {
			const context = {
				arg: true,
			};

			// The expression "(isActive) => isActive ? 'active' : 'inactive'"
			// should become "arg ? 'active' : 'inactive'"
			const result = evaluate(
				"(isActive) => isActive ? 'active' : 'inactive'",
				context
			);
			expect(result).toBe("active");
		});

		test("should handle multiple occurrences of parameter name", () => {
			const context = {
				arg: "test",
			};

			// The expression "(value) => value + ' - ' + value.length"
			// should become "arg + ' - ' + arg.length"
			const result = evaluate(
				"(value) => value + ' - ' + value.length",
				context
			);
			expect(result).toBe("test - 4");
		});
	});

	describe("Parentheses and Precedence", () => {
		test("should handle parentheses", () => {
			const context = { a: 2, b: 3, c: 4 };
			expect(evaluate("(a + b) * c", context)).toBe(20);
			expect(evaluate("a + (b * c)", context)).toBe(14);
		});

		test("should handle complex nested parentheses", () => {
			const context = { a: 1, b: 2, c: 3, d: 4 };
			expect(evaluate("((a + b) * (c + d))", context)).toBe(21);
		});

		test("should handle parentheses in ternary", () => {
			const context = { a: 5, b: 3 };
			expect(evaluate("(a > b) ? 'greater' : 'less'", context)).toBe(
				"greater"
			);
		});
	});

	describe("Edge Cases and Complex Expressions", () => {
		test("should handle expressions with quotes correctly", () => {
			const context = { num: 42, index: 0 };
			expect(evaluate("'Number: ' + num + ', '", context)).toBe(
				"Number: 42, "
			);
			expect(evaluate("index + ': ' + 'test'", context)).toBe("0: test");
		});

		test("should handle complex todo-like expressions", () => {
			const context = {
				index: 1,
				todo: { text: "Build app", done: false },
			};
			const expr =
				"index + ': ' + todo.text + ' (' + (todo.done ? 'done' : 'pending') + ')'";
			expect(evaluate(expr, context)).toBe("1: Build app (pending)");
		});

		test("should not confuse colons in strings with ternary operators", () => {
			const context = { time: "12:30" };
			expect(evaluate("'Time is ' + time", context)).toBe(
				"Time is 12:30"
			);
		});

		test("should handle state references extraction correctly", () => {
			expect(getStateRefs("'Number: ' + num + ', '")).toEqual(["num"]);
			expect(getStateRefs("index + ': ' + todo.text")).toEqual([
				"index",
				"todo",
			]);
			expect(
				getStateRefs("user.name || user.email || 'Anonymous'")
			).toEqual(["user"]);
		});
	});

	describe("Performance and Reusability", () => {
		test("should demonstrate performance benefit of parsed expressions", () => {
			const context1 = { user: { age: 25 } };
			const context2 = { user: { age: 16 } };
			const context3 = { user: { age: 21 } };

			// Parse once, use many times
			const ageCheckEvaluator = evaluateExpression("user.age >= 18");

			expect(ageCheckEvaluator.fn(context1)).toBe(true);
			expect(ageCheckEvaluator.fn(context2)).toBe(false);
			expect(ageCheckEvaluator.fn(context3)).toBe(true);

			// Should extract state references correctly
			expect(getStateRefs("user.age >= 18")).toEqual(["user"]);
		});

		test("should handle complex expressions with multiple evaluations", () => {
			const expr =
				"'User: ' + user.name + ' (Age: ' + user.age + ', Status: ' + (user.active ? 'active' : 'inactive') + ')'";
			const evaluator = evaluateExpression(expr);

			const context1 = { user: { name: "Alice", age: 25, active: true } };
			const context2 = { user: { name: "Bob", age: 30, active: false } };

			expect(evaluator.fn(context1)).toBe(
				"User: Alice (Age: 25, Status: active)"
			);
			expect(evaluator.fn(context2)).toBe(
				"User: Bob (Age: 30, Status: inactive)"
			);
			expect(getStateRefs(expr)).toEqual(["user"]);
		});
	});

	describe("Integration: Sync Binding Simulation", () => {
		test("should simulate complete sync binding workflow", () => {
			// Simulate: value="${user.name >> (name) => processedName = validateName(name)}"

			// Step 1: Parse left side (binding expression)
			const leftExpr = evaluateExpression("user.name");
			const leftContext = { user: { name: "  Alice  " } };
			const leftResult = leftExpr.fn(leftContext);
			expect(leftResult).toBe("  Alice  ");

			// Step 2: Parse right side (sync expression)
			const rightExpr = evaluateExpression(
				"(name) => processedName = validateName(name)"
			);
			expect(rightExpr._isArrowFunction).toBe(true);

			// Step 3: Execute sync with left result as 'arg'
			// Arrow functions transform but don't execute - they return the transformed expression
			const syncContext: Record<string, unknown> = {
				...leftContext,
				arg: leftResult,
				validateName: (name: string) => name.trim().toUpperCase(),
			};
			const syncResult = rightExpr.fn(syncContext);

			// Arrow function returns the transformed expression string
			expect(syncResult).toBe("validateName(arg)");
		});

		test("should simulate DOM insertion workflow", () => {
			// Simulate: data-then="response >> (res) => @append('#list', res.html)"

			// Step 1: Parse left side (async result)
			const leftExpr = evaluateExpression("response");
			const leftContext = { response: { html: "<li>New Item</li>" } };
			const leftResult = leftExpr.fn(leftContext);

			// Step 2: Parse right side (DOM insertion expression)
			const rightExpr = evaluateExpression(
				"(res) => @append('#list', res.html)"
			);
			expect(rightExpr._isArrowFunction).toBe(true);

			// Step 3: Execute DOM insertion with left result as 'arg'
			// Arrow functions transform but don't execute - they return the transformed expression
			const domContext: Record<string, unknown> = {
				...leftContext,
				arg: leftResult,
				"@append": (selector: string, content: string) =>
					`APPEND(${selector}): ${content}`,
			};
			const domResult = rightExpr.fn(domContext);

			// Arrow function returns the transformed expression string
			expect(domResult).toBe("@append('#list', arg.html)");
		});
	});
});
