import { CtxFunction } from "./registry-interpolation";
import { State } from "./State";

export interface StateReference {
	name: string;
	state: State<unknown>;
}

const ID = "[a-zA-Z_$][a-zA-Z0-9_$]*",
	PROP = `${ID}(?:\\.${ID})*`,
	STATE_PROP = `@${PROP}`,
	PROP_RE = new RegExp(`^${PROP}$`),
	VALUE = `(?:${STATE_PROP}|${PROP}|-?\\d+(?:\\.\\d+)?|["'][^"']*["']|\`[^\`]*\`|true|false|null|undefined)`,
	COMP_RE = new RegExp(`^(${VALUE})\\s*(===|!==|>=|<=|==|!=|>|<)\\s*(.+)$`),
	NUM_RE = /^-?\d+(\.\d+)?$/,
	STR_RE = /^(['"`])(.*?)\1$/,
	OR_RE = /^(.+?)\s*\|\|\s*(.+)$/,
	NULL_RE = /^(.+?)\s*\?\?\s*(.+)$/,
	AND_RE = /^(.+?)\s*&&\s*(.+)$/,
	NEG_RE = /^!\s*(.+)$/;

export const STATE_RE = new RegExp(STATE_PROP, "g");

const LITERALS: Record<string, unknown> = {
	true: true,
	false: false,
	null: null,
	undefined: undefined,
};

const parseArithmetic = (
	expr: string
): { left: string; op: string; right: string } | null => {
	let depth = 0,
		ternaryDepth = 0,
		lastOpIndex = -1,
		lastOp = "",
		inQuotes = false,
		quoteChar = "";

	for (let i = expr.length - 1; i >= 0; i--) {
		const char = expr[i];
		if (!char) continue;

		if (
			(char === '"' || char === "'") &&
			(i === 0 || expr[i - 1] !== "\\")
		) {
			if (!inQuotes) {
				inQuotes = true;
				quoteChar = char;
			} else if (char === quoteChar) {
				inQuotes = false;
				quoteChar = "";
			}
			continue;
		}

		if (inQuotes) continue;

		if (char === ")") depth++;
		else if (char === "(") depth--;
		else if (char === "?") ternaryDepth++;
		else if (char === ":") ternaryDepth--;
		else if (depth === 0 && ternaryDepth === 0 && /[+\-*/]/.test(char)) {
			if (char === "-") {
				const prevPart = expr.slice(0, i).trim();
				if (prevPart === "" || /[+\-*/=<>!&|?:]$/.test(prevPart)) {
					continue;
				}
			}
			lastOpIndex = i;
			lastOp = char;
			break;
		}
	}
	return lastOpIndex === -1
		? null
		: {
				left: expr.slice(0, lastOpIndex).trim(),
				op: lastOp,
				right: expr.slice(lastOpIndex + 1).trim(),
		  };
};

const parseTernary = (expr: string) => {
	let qIdx = -1,
		cIdx = -1,
		depth = 0;
	for (let i = 0; i < expr.length; i++) {
		const char = expr[i];
		if (char === "?") {
			if (depth === 0 && qIdx === -1) qIdx = i;
			depth++;
		} else if (char === ":") {
			depth--;
			if (depth === 0 && qIdx !== -1 && cIdx === -1) {
				cIdx = i;
				break;
			}
		}
	}
	return qIdx === -1 || cIdx === -1
		? null
		: {
				_condition: expr.slice(0, qIdx).trim(),
				_trueValue: expr.slice(qIdx + 1, cIdx).trim(),
				_falseValue: expr.slice(cIdx + 1).trim(),
		  };
};

export const evalProp = (
	expr: string,
	ctx: Record<string, unknown> = {}
): unknown => {
	const parts = expr.split(".");
	let result: unknown = ctx;
	for (const part of parts) {
		if (result == null) return undefined;
		result = (result as any)[part];
	}
	return result;
};

const parseValue = (val: string, ctx: Record<string, unknown>): any => {
	val = val.trim();
	if (val in LITERALS) return LITERALS[val];
	if (NUM_RE.test(val)) return parseFloat(val);
	const strMatch = val.match(STR_RE);
	if (strMatch) return strMatch[2];

	if (val.startsWith("@")) {
		const propName = val.slice(1);
		if (PROP_RE.test(propName)) return evalProp(propName, ctx);
	}
	if (PROP_RE.test(val)) return evalProp(val, ctx);
	return val;
};

const evalComparison = (
	expr: string,
	ctx: Record<string, unknown> = {}
): boolean => {
	const match = expr.match(COMP_RE);
	if (!match?.[1] || !match[3]) return false;
	const [, left, op, right] = match;
	const rightTrimmed = right.trim();
	if (!rightTrimmed || "=><".includes(rightTrimmed[0]!)) return false;
	const leftVal = parseValue(left, ctx);
	const rightVal = parseValue(rightTrimmed, ctx);

	switch (op) {
		case "===":
			return leftVal === rightVal;
		case "!==":
			return leftVal !== rightVal;
		case "==":
			return leftVal == rightVal;
		case "!=":
			return leftVal != rightVal;
		case ">=":
			return leftVal >= rightVal;
		case "<=":
			return leftVal <= rightVal;
		case ">":
			return leftVal > rightVal;
		case "<":
			return leftVal < rightVal;
		default:
			return false;
	}
};

export interface ExpressionResult {
	fn: CtxFunction;
	stateRefs: Set<{ name: string; state: State<unknown> }>;
}

const createStateReference = (stateExpr: string): StateReference | null => {
	// Handle aliasing: @myState.prop as alias
	const aliasMatch = stateExpr.match(
		/^(@[^\s]+)\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)$/
	);
	let actualStateExpr = stateExpr;
	let aliasName: string | null = null;

	if (aliasMatch && aliasMatch[1] && aliasMatch[2]) {
		actualStateExpr = aliasMatch[1];
		aliasName = aliasMatch[2];
	}

	const propName = actualStateExpr.slice(1); // Remove @ prefix
	const parts = propName.split(".");
	const baseStateName = parts[0];

	if (!baseStateName) return null;

	const baseState = State.get(baseStateName);
	if (!baseState) return null;

	let resultState: State<unknown>;
	let defaultName: string;

	// If no properties, return the base state
	if (parts.length === 1) {
		resultState = baseState;
		defaultName = baseStateName;
	} else {
		// If there are properties, create a computed state
		const propertyPath = parts.slice(1);
		defaultName = `${baseStateName}.${propertyPath.join(".")}`;
		resultState = State._createComputed(() => {
			return evalProp(propertyPath.join("."), {
				[baseStateName]: baseState.value,
			});
		}, defaultName);
	}

	return {
		name: aliasName || defaultName,
		state: resultState,
	};
};

export const evaluateExpression = (
	expr: string | undefined,
	isEventHandler = false
): ExpressionResult => {
	expr = expr?.trim();
	if (!expr) return { fn: () => undefined, stateRefs: new Set() };

	// Check if this is a JavaScript arrow function or regular function
	// Only detect if it doesn't contain @ symbols (which would make it a Manifold expression)
	if (
		!expr.includes("@") &&
		(expr.includes("=>") || expr.startsWith("function"))
	) {
		try {
			const func = new Function("return (" + expr + ")")();
			if (isEventHandler) {
				// For event handlers, return the function itself
				return { fn: () => func, stateRefs: new Set() };
			} else {
				// For regular properties, call the function and return its result
				return { fn: () => func(), stateRefs: new Set() };
			}
		} catch (error) {
			// Fall through to normal expression evaluation if JavaScript function creation fails
		}
	}

	const stateRefs = new Set<{ name: string; state: State<unknown> }>();
	Array.from(expr.matchAll(STATE_RE)).forEach((match) => {
		const stateRef = createStateReference(match[0]);
		if (stateRef) stateRefs.add(stateRef);
	});

	const createResult = (
		fn: CtxFunction,
		additionalRefs: Set<{ name: string; state: State<unknown> }> = new Set()
	): ExpressionResult => ({
		fn,
		stateRefs: new Set([...stateRefs, ...additionalRefs]),
	});

	if (expr in LITERALS) return createResult(() => LITERALS[expr]);
	if (NUM_RE.test(expr)) return createResult(() => parseFloat(expr));

	const strMatch = expr.match(STR_RE);
	if (strMatch?.[2] !== undefined) {
		const strValue = strMatch[2];
		if (!strValue.includes("@")) {
			let inQuotes = false,
				quoteChar = "",
				hasOperatorsOutsideQuotes = false;
			for (let i = 0; i < expr.length; i++) {
				const char = expr[i];
				if (!char) continue;
				if (
					(char === '"' || char === "'") &&
					(i === 0 || expr[i - 1] !== "\\")
				) {
					if (!inQuotes) {
						inQuotes = true;
						quoteChar = char;
					} else if (char === quoteChar) {
						inQuotes = false;
						quoteChar = "";
					}
				} else if (!inQuotes && /[+\-*/]/.test(char)) {
					hasOperatorsOutsideQuotes = true;
					break;
				}
			}
			if (!hasOperatorsOutsideQuotes) return createResult(() => strValue);
		}
	}

	if (expr.startsWith("(") && expr.endsWith(")")) {
		let depth = 0,
			isFullyWrapped = true;
		for (let i = 0; i < expr.length; i++) {
			if (expr[i] === "(") depth++;
			else if (expr[i] === ")") depth--;
			if (depth === 0 && i < expr.length - 1) {
				isFullyWrapped = false;
				break;
			}
		}
		if (isFullyWrapped) return evaluateExpression(expr.slice(1, -1).trim());
	}

	const ternary = parseTernary(expr);
	if (ternary) {
		const cond = evaluateExpression(ternary._condition);
		const tv = evaluateExpression(ternary._trueValue);
		const fv = evaluateExpression(ternary._falseValue);
		return createResult(
			(ctx) => (cond.fn(ctx) ? tv.fn(ctx) : fv.fn(ctx)),
			new Set([...cond.stateRefs, ...tv.stateRefs, ...fv.stateRefs])
		);
	}

	const negMatch = expr.match(NEG_RE);
	if (negMatch?.[1]) {
		const inner = evaluateExpression(negMatch[1]);
		return createResult((ctx) => !inner.fn(ctx), inner.stateRefs);
	}

	if (expr.startsWith("-") && expr.length > 1) {
		const inner = evaluateExpression(expr.slice(1).trim());
		return createResult((ctx) => {
			const val = inner.fn(ctx);
			return typeof val === "number" ? -val : undefined;
		}, inner.stateRefs);
	}

	const orMatch = expr.match(OR_RE);
	if (orMatch?.[1] && orMatch[2]) {
		const left = evaluateExpression(orMatch[1]);
		const right = evaluateExpression(orMatch[2]);
		return createResult(
			(ctx) => left.fn(ctx) || right.fn(ctx),
			new Set([...left.stateRefs, ...right.stateRefs])
		);
	}

	const andMatch = expr.match(AND_RE);
	if (andMatch?.[1] && andMatch[2]) {
		const left = evaluateExpression(andMatch[1]);
		const right = evaluateExpression(andMatch[2]);
		return createResult(
			(ctx) => left.fn(ctx) && right.fn(ctx),
			new Set([...left.stateRefs, ...right.stateRefs])
		);
	}

	const arithParse = parseArithmetic(expr);
	if (arithParse) {
		const left = evaluateExpression(arithParse.left);
		const right = evaluateExpression(arithParse.right);
		const op = arithParse.op;
		return createResult((ctx) => {
			const leftVal = left.fn(ctx),
				rightVal = right.fn(ctx);
			if (op === "+") {
				return typeof leftVal === "string" ||
					typeof rightVal === "string"
					? String(leftVal ?? "") + String(rightVal ?? "")
					: typeof leftVal === "number" &&
					  typeof rightVal === "number"
					? leftVal + rightVal
					: undefined;
			} else if (
				typeof leftVal === "number" &&
				typeof rightVal === "number"
			) {
				switch (op) {
					case "-":
						return leftVal - rightVal;
					case "*":
						return leftVal * rightVal;
					case "/":
						return leftVal / rightVal;
					default:
						return undefined;
				}
			}
			return undefined;
		}, new Set([...left.stateRefs, ...right.stateRefs]));
	}

	const nullMatch = expr.match(NULL_RE);
	if (nullMatch?.[1] && nullMatch[2]) {
		const left = evaluateExpression(nullMatch[1]);
		const right = evaluateExpression(nullMatch[2]);
		return createResult(
			(ctx) => left.fn(ctx) ?? right.fn(ctx),
			new Set([...left.stateRefs, ...right.stateRefs])
		);
	}

	if (expr.startsWith("@")) {
		const propName = expr.slice(1);
		if (PROP_RE.test(propName))
			return createResult((ctx) => evalProp(propName, ctx));
	}

	if (PROP_RE.test(expr)) {
		return createResult((ctx) => {
			// First try to resolve from context (props)
			let result = evalProp(expr, ctx);

			// If not found in context, try State registry
			if (result === undefined) {
				const parts = expr.split(".");
				const baseStateName = parts[0];
				if (baseStateName) {
					const baseState = State.get(baseStateName);
					if (baseState) {
						// Add state to context for property evaluation
						const stateContext = {
							...ctx,
							[baseStateName]: baseState.value,
						};
						result = evalProp(expr, stateContext);
					}
				}
			}

			// Fallback to literal string if still undefined and it's a simple identifier
			return result === undefined &&
				!expr.includes(".") &&
				Object.keys(ctx ?? {}).length === 0
				? expr
				: result;
		});
	}

	if (COMP_RE.test(expr)) {
		const compMatch = expr.match(COMP_RE);
		if (compMatch?.[1] && compMatch[3]) {
			const rightTrimmed = compMatch[3].trim();
			if (rightTrimmed && !"=><".includes(rightTrimmed[0]!)) {
				return createResult((ctx) => evalComparison(expr, ctx));
			}
		}
		return createResult(() => expr);
	}

	if (expr.includes(".") || /^[a-zA-Z_$]/.test(expr)) {
		return createResult((ctx) => {
			const result = evalProp(expr, ctx);
			return result !== undefined ? result : expr;
		});
	}

	return createResult(() => expr);
};
