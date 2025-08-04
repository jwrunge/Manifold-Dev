import { expect, test, describe } from "vitest";
import { evaluateExpression } from "../expression-parser";

describe("Expression Parser", () => {
	const evaluate = (expr: string, context: Record<string, unknown>) => {
		const result = evaluateExpression(expr);
		return result.fn(context);
	};

	const getStateRefs = (expr: string) => {
		return evaluateExpression(expr).stateRefs;
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

		test("should not treat complex expressions as string literals", () => {
			// These should NOT be parsed as simple strings
			const context = { num: 42 };
			expect(evaluate("'Number: ' + @num", context)).toBe("Number: 42");
			expect(evaluate("'Value: ' + @num + ', '", context)).toBe(
				"Value: 42, "
			);
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

		test("should extract state references from property access", () => {
			expect(getStateRefs("@user.name")).toEqual(["user"]);
			expect(getStateRefs("@counter")).toEqual(["counter"]);
			expect(getStateRefs("@user.profile.settings")).toEqual(["user"]);
		});
	});

	describe("Arithmetic Expressions", () => {
		test("should handle addition", () => {
			const context = { a: 5, b: 3 };
			expect(evaluate("@a + @b", context)).toBe(8);
			expect(evaluate("10 + 5", context)).toBe(15);
		});

		test("should handle string concatenation", () => {
			const context = { name: "Alice", index: 0 };
			expect(evaluate("'Hello ' + @name", context)).toBe("Hello Alice");
			expect(evaluate("@index + ': '", context)).toBe("0: ");
			expect(evaluate("'Number: ' + @index + ', '", context)).toBe(
				"Number: 0, "
			);
		});

		test("should handle mixed string and number concatenation", () => {
			const context = { num: 42 };
			expect(evaluate("'Value is ' + @num", context)).toBe("Value is 42");
			expect(evaluate("@num + ' items'", context)).toBe("42 items");
		});

		test("should handle subtraction, multiplication, division", () => {
			const context = { a: 10, b: 3 };
			expect(evaluate("@a - @b", context)).toBe(7);
			expect(evaluate("@a * @b", context)).toBe(30);
			expect(evaluate("@a / @b", context)).toBeCloseTo(3.33, 2);
		});

		test("should handle negative numbers", () => {
			const context = { a: 5 };
			expect(evaluate("@a + -3", context)).toBe(2);
			expect(evaluate("-@a", context)).toBe(-5);
		});

		test("should handle left-to-right associativity", () => {
			const context = { a: 1, b: 2, c: 3 };
			expect(evaluate("@a + @b + @c", context)).toBe(6);
			expect(evaluate("'a' + 'b' + 'c'", context)).toBe("abc");
		});

		test("should extract state references from arithmetic", () => {
			expect(getStateRefs("@a + @b")).toEqual(["a", "b"]);
			expect(getStateRefs("'hello' + @name + '!'")).toEqual(["name"]);
			expect(getStateRefs("@user.age + 10")).toEqual(["user"]);
		});
	});

	describe("Comparison Expressions", () => {
		test("should handle equality comparisons", () => {
			const context = { a: 5, b: 5, c: 3 };
			expect(evaluate("@a === @b", context)).toBe(true);
			expect(evaluate("@a === @c", context)).toBe(false);
			expect(evaluate("@a !== @c", context)).toBe(true);
			expect(evaluate("@a == '5'", context)).toBe(true);
			expect(evaluate("@a != @c", context)).toBe(true);
		});

		test("should handle relational comparisons", () => {
			const context = { a: 5, b: 3 };
			expect(evaluate("@a > @b", context)).toBe(true);
			expect(evaluate("@a < @b", context)).toBe(false);
			expect(evaluate("@a >= @b", context)).toBe(true);
			expect(evaluate("@a <= @b", context)).toBe(false);
			expect(evaluate("@a >= 5", context)).toBe(true);
		});

		test("should extract state references from comparisons", () => {
			expect(getStateRefs("@user.age >= 18")).toEqual(["user"]);
			expect(getStateRefs("@a === @b")).toEqual(["a", "b"]);
		});
	});

	describe("Logical Expressions", () => {
		test("should handle OR expressions", () => {
			const context = { a: true, b: false, c: null };
			expect(evaluate("@a || @b", context)).toBe(true);
			expect(evaluate("@b || @a", context)).toBe(true);
			expect(evaluate("@b || @c", context)).toBe(null);
			expect(evaluate("@c || 'default'", context)).toBe("default");
		});

		test("should handle AND expressions", () => {
			const context = { a: true, b: false, c: "hello" };
			expect(evaluate("@a && @c", context)).toBe("hello");
			expect(evaluate("@a && @b", context)).toBe(false);
			expect(evaluate("@b && @c", context)).toBe(false);
		});

		test("should handle nullish coalescing", () => {
			const context = { a: null, b: undefined, c: "value" };
			expect(evaluate("@a ?? 'default'", context)).toBe("default");
			expect(evaluate("@b ?? 'default'", context)).toBe("default");
			expect(evaluate("@c ?? 'default'", context)).toBe("value");
		});

		test("should extract state references from logical expressions", () => {
			expect(getStateRefs("@a || @b")).toEqual(["a", "b"]);
			expect(getStateRefs("@user.name && @user.active")).toEqual([
				"user",
			]);
			expect(getStateRefs("@value ?? 'default'")).toEqual(["value"]);
		});
	});

	describe("Ternary Expressions", () => {
		test("should handle basic ternary", () => {
			const context = { isActive: true, name: "Alice" };
			expect(evaluate("@isActive ? 'active' : 'inactive'", context)).toBe(
				"active"
			);
			expect(
				evaluate("!@isActive ? 'active' : 'inactive'", context)
			).toBe("inactive");
		});

		test("should handle nested ternary", () => {
			const context = { score: 85 };
			expect(
				evaluate(
					"@score >= 90 ? 'A' : @score >= 80 ? 'B' : 'C'",
					context
				)
			).toBe("B");
		});

		test("should handle ternary in complex expressions", () => {
			const context = { todo: { text: "Learn", done: true }, index: 0 };
			const expr =
				"@index + ': ' + @todo.text + ' (' + (@todo.done ? 'done' : 'pending') + ')'";
			expect(evaluate(expr, context)).toBe("0: Learn (done)");
		});

		test("should extract state references from ternary", () => {
			expect(getStateRefs("@isActive ? 'yes' : 'no'")).toEqual([
				"isActive",
			]);
			expect(
				getStateRefs("@user.age >= 18 ? @user.name : 'minor'")
			).toEqual(["user"]);
		});
	});

	describe("Parentheses and Precedence", () => {
		test("should handle parentheses", () => {
			const context = { a: 2, b: 3, c: 4 };
			expect(evaluate("(@a + @b) * @c", context)).toBe(20);
			expect(evaluate("@a + (@b * @c)", context)).toBe(14);
		});

		test("should handle complex nested parentheses", () => {
			const context = { a: 1, b: 2, c: 3, d: 4 };
			expect(evaluate("((@a + @b) * (@c + @d))", context)).toBe(21);
		});

		test("should handle parentheses in ternary", () => {
			const context = { a: 5, b: 3 };
			expect(evaluate("(@a > @b) ? 'greater' : 'less'", context)).toBe(
				"greater"
			);
		});
	});

	describe("Edge Cases and Fixes", () => {
		test("should handle expressions with quotes correctly (quote parsing fix)", () => {
			// This was the main bug we fixed - expressions starting and ending with quotes
			// should not be treated as string literals if they contain expressions
			const context = { num: 42, index: 0 };
			expect(evaluate("'Number: ' + @num + ', '", context)).toBe(
				"Number: 42, "
			);
			expect(evaluate("@index + ': ' + 'test'", context)).toBe("0: test");
		});

		test("should handle data-bind attribute colon splitting", () => {
			// Test expressions that would be problematic if split on colons incorrectly
			const context = { user: { status: "active" } };
			expect(
				evaluate(
					"@user.status === 'active' ? 'online' : 'offline'",
					context
				)
			).toBe("online");
		});

		test("should handle complex todo-like expressions", () => {
			const context = {
				index: 1,
				todo: { text: "Build app", done: false },
			};
			const expr =
				"@index + ': ' + @todo.text + ' (' + (@todo.done ? 'done' : 'pending') + ')'";
			expect(evaluate(expr, context)).toBe("1: Build app (pending)");
		});

		test("should handle numbers list expressions", () => {
			const context = { num: 5 };
			expect(evaluate("'Number: ' + @num + ', '", context)).toBe(
				"Number: 5, "
			);
		});

		test("should not confuse colons in strings with ternary operators", () => {
			const context = { time: "12:30" };
			expect(evaluate("'Time is ' + @time", context)).toBe(
				"Time is 12:30"
			);
		});

		test("should handle state references extraction correctly", () => {
			expect(getStateRefs("'Number: ' + @num + ', '")).toEqual(["num"]);
			expect(getStateRefs("@index + ': ' + @todo.text")).toEqual([
				"index",
				"todo",
			]);
			expect(
				getStateRefs("@user.name || @user.email || 'Anonymous'")
			).toEqual(["user"]);
		});
	});

	describe("Performance and Reusability", () => {
		test("should demonstrate performance benefit of parsed expressions", () => {
			const context1 = { user: { age: 25 } };
			const context2 = { user: { age: 16 } };
			const context3 = { user: { age: 21 } };

			// Parse once, use many times
			const ageCheckEvaluator = evaluateExpression("@user.age >= 18");

			expect(ageCheckEvaluator.fn(context1)).toBe(true);
			expect(ageCheckEvaluator.fn(context2)).toBe(false);
			expect(ageCheckEvaluator.fn(context3)).toBe(true);

			// Should extract state references correctly
			expect(ageCheckEvaluator.stateRefs).toEqual(["user"]);
		});

		test("should handle complex expressions with multiple evaluations", () => {
			const expr =
				"'User: ' + @user.name + ' (Age: ' + @user.age + ', Status: ' + (@user.active ? 'active' : 'inactive') + ')'";
			const evaluator = evaluateExpression(expr);

			const context1 = { user: { name: "Alice", age: 25, active: true } };
			const context2 = { user: { name: "Bob", age: 30, active: false } };

			expect(evaluator.fn(context1)).toBe(
				"User: Alice (Age: 25, Status: active)"
			);
			expect(evaluator.fn(context2)).toBe(
				"User: Bob (Age: 30, Status: inactive)"
			);
			expect(evaluator.stateRefs).toEqual(["user"]);
		});
	});
});
