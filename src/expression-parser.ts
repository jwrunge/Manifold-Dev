import { CtxFunction } from "./registry";
import { State } from "./State";

export interface StateReference {
	_name: string;
	_state: State<unknown>;
}

const PROP_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:[.\[][\w\]]*)*$/,
	COMP_RE =
		/^([a-zA-Z_$][\w.[\]]*|-?\d+(?:\.\d+)?|["'][^"']*["']|true|false|null|undefined)\s*(===|!==|>=|<=|>|<)\s*(.+)$/,
	LITERALS: Record<string, any> = {
		true: true,
		false: false,
		null: null,
		undefined,
	},
	_isNum = (v: unknown) => typeof v === "number",
	_isStr = (v: unknown) => typeof v === "string";

export const _evalProp = (
	expr: string,
	ctx: Record<string, unknown> = {}
): unknown => {
	const parts = expr.split(/[.\[\]]/).filter(Boolean);
	let result: unknown = ctx;
	for (const part of parts) {
		if (result == null) return undefined;
		result = (result as any)[/^\d+$/.test(part) ? +part : part];
	}
	return result;
};

export const _setProp = (
	expr: string,
	value: unknown,
	ctx: Record<string, unknown> = {}
): void => {
	const parts = expr.split(/[.\[\]]/).filter(Boolean);
	let target: any = ctx;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (target == null || !part) return;
		target = target[/^\d+$/.test(part) ? +part : part];
	}
	const finalPart = parts[parts.length - 1];
	if (target != null && finalPart != null) {
		target[/^\d+$/.test(finalPart) ? +finalPart : finalPart] = value;
	}
};

export interface ExpressionResult {
	fn: CtxFunction;
	_stateRefs: Set<{ _name: string; _state: State<unknown> }>;
	_isAssignment?: boolean;
	_assignTarget?: string;
	_isArrowFunction?: boolean;
}

export const _evaluateExpression = (expr?: string): ExpressionResult => {
	expr = expr?.trim();
	if (!expr) return { fn: () => undefined, _stateRefs: new Set() };

	// Check for arrow function expressions: (paramName) => body
	const arrowMatch = expr.match(/^\s*\(\s*(\w+)\s*\)\s*=>\s*(.+)$/);
	const paramName = arrowMatch?.[1];
	const body = arrowMatch?.[2];

	if (paramName && body) {
		// Replace the parameter name with 'arg' in the body
		const bodyResult = _evaluateExpression(
			body.replace(new RegExp(`\\b${paramName}\\b`, "g"), "arg")
		);

		return {
			fn: bodyResult.fn,
			_stateRefs: bodyResult._stateRefs,
			_isAssignment: bodyResult._isAssignment,
			_assignTarget: bodyResult._assignTarget,
			_isArrowFunction: true,
		};
	}

	// Check for assignment expressions first
	const assignMatch = expr.match(
		/^([a-zA-Z_$][\w]*(?:\.[\w]+|\[\d+\])*)\s*=\s*([^=].*)$/
	);
	if (assignMatch && assignMatch[1] && assignMatch[2]) {
		const target = assignMatch[1];
		const valueExpr = assignMatch[2];
		const valueResult = _evaluateExpression(valueExpr);

		return {
			fn: (ctx) => {
				const value = valueResult.fn(ctx);
				_setProp(target, value, ctx);
				return value;
			},
			_stateRefs: valueResult._stateRefs,
			_isAssignment: true,
			_assignTarget: target,
		};
	}

	const stateRefs = new Set<{ _name: string; _state: State<unknown> }>();

	// Find all potential state references, excluding those inside string literals
	const processedBaseStates = new Set<string>();

	for (const identifier of (() => {
		const refs = new Set<string>();
		let i = 0;
		while (i < expr.length) {
			const char = expr[i];
			// Skip string literals
			if (char === '"' || char === "'" || char === "`") {
				const quote = char;
				i++; // Skip opening quote
				while (i < expr.length && expr[i] !== quote) {
					if (expr[i] === "\\") i++; // Skip escaped characters
					i++;
				}
				i++; // Skip closing quote
				continue;
			}
			// Check for identifier at current position
			if (char && /[a-zA-Z_$]/.test(char)) {
				let identifier = "";
				let j = i;
				// Extract full identifier with property access
				while (j < expr.length) {
					const nextChar = expr[j];
					if (!nextChar || !/[a-zA-Z0-9_$.\[\]]/.test(nextChar))
						break;
					identifier += nextChar;
					j++;
				}
				// Get base identifier (before any dots or brackets)
				const baseMatch = identifier.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
				if (baseMatch) {
					const baseName = baseMatch[0];
					// Exclude language keywords and built-ins
					if (
						!/^(true|false|null|undefined|arg|typeof|instanceof|new|function|class|let|const|var|if|else|for|while|do|switch|case|default|try|catch|finally|throw|return|break|continue)$/.test(
							baseName
						)
					) {
						refs.add(identifier);
					}
				}
				i = j;
			} else {
				i++;
			}
		}
		return refs;
	})()) {
		const baseStateName = identifier.split(/[.\[\]]/).filter(Boolean)[0];
		if (baseStateName && !processedBaseStates.has(baseStateName)) {
			processedBaseStates.add(baseStateName);
			const baseState = State.get(baseStateName);
			stateRefs.add({
				_name: baseStateName,
				_state: baseState || (null as any),
			});
		}
	}

	const _createResult = (
		fn: CtxFunction,
		additionalRefs: Set<{
			_name: string;
			_state: State<unknown>;
		}> = new Set()
	): ExpressionResult => {
		// Deduplicate state refs by name
		const nameSet = new Set<string>();
		const dedupedRefs = new Set<{
			_name: string;
			_state: State<unknown>;
		}>();

		for (const ref of [...stateRefs, ...additionalRefs]) {
			if (!nameSet.has(ref._name)) {
				nameSet.add(ref._name);
				dedupedRefs.add(ref);
			}
		}

		return {
			fn,
			_stateRefs: dedupedRefs,
			_isArrowFunction: false, // Default to false for non-arrow functions
		};
	};

	if (expr in LITERALS) return _createResult(() => LITERALS[expr]);
	if (/^-?\d+\.?\d*$/.test(expr))
		return _createResult(() => parseFloat(expr));

	// Only match simple string literals (no concatenation operators outside quotes)
	const strMatch = expr.match(/^(['"`])(.*?)\1$/);
	if (strMatch?.[2] !== undefined && strMatch[1]) {
		// Check if this is truly a simple string literal by verifying the content
		const content = strMatch[2];
		const quote = strMatch[1];

		// If the expression has more content after the closing quote, it's not a simple string
		const quotePos = expr.indexOf(quote, 1);
		if (quotePos !== -1) {
			const afterQuote = expr.substring(quotePos + 1);
			if (afterQuote.trim() === "") {
				return _createResult(() => content);
			}
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
		if (isFullyWrapped)
			return _evaluateExpression(expr.slice(1, -1).trim());
	}

	// Inline ternary parsing for single use
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

	if (qIdx !== -1 && cIdx !== -1) {
		const cond = _evaluateExpression(expr.slice(0, qIdx).trim());
		const tv = _evaluateExpression(expr.slice(qIdx + 1, cIdx).trim());
		const fv = _evaluateExpression(expr.slice(cIdx + 1).trim());
		return _createResult(
			(ctx) => (cond.fn(ctx) ? tv.fn(ctx) : fv.fn(ctx)),
			new Set([...cond._stateRefs, ...tv._stateRefs, ...fv._stateRefs])
		);
	}

	// Handle logical and arithmetic negation
	const _negMatch = expr.match(/^!\s*(.+)$/);
	if (_negMatch?.[1]) {
		const inner = _evaluateExpression(_negMatch[1]);
		return _createResult((ctx) => !inner.fn(ctx), inner._stateRefs);
	}

	const _minusMatch = expr.match(/^-\s*(.+)$/);
	if (_minusMatch?.[1]) {
		const inner = _evaluateExpression(_minusMatch[1]);
		return _createResult(
			(ctx) => -(inner.fn(ctx) as number),
			inner._stateRefs
		);
	}

	// Logical operators
	let match = expr.match(/^(.+?)\s*\|\|\s*(.+)$/);
	if (match?.[1] && match[2]) {
		const left = _evaluateExpression(match[1]);
		const right = _evaluateExpression(match[2]);
		return _createResult(
			(ctx) => left.fn(ctx) || right.fn(ctx),
			new Set([...left._stateRefs, ...right._stateRefs])
		);
	}

	match = expr.match(/^(.+?)\s*&&\s*(.+)$/);
	if (match?.[1] && match[2]) {
		const left = _evaluateExpression(match[1]);
		const right = _evaluateExpression(match[2]);
		return _createResult(
			(ctx) => left.fn(ctx) && right.fn(ctx),
			new Set([...left._stateRefs, ...right._stateRefs])
		);
	}

	// Inline arithmetic parsing for chained operations - handle left-to-right evaluation
	// Find arithmetic operators outside parentheses, prioritizing lower precedence (+,-) over higher (*/%)
	const findOperator = (operators: string[]) => {
		let parenDepth = 0;
		let inString = false;
		let stringChar = "";

		for (let i = expr.length - 1; i >= 0; i--) {
			const char = expr[i];
			if (!char) continue;

			// Track string literals (scan backwards)
			if (!inString && (char === '"' || char === "'" || char === "`")) {
				inString = true;
				stringChar = char;
				continue;
			}
			if (
				inString &&
				char === stringChar &&
				(i === 0 || expr[i - 1] !== "\\")
			) {
				inString = false;
				stringChar = "";
				continue;
			}
			if (inString) continue;

			// Track parentheses depth (scanning backwards)
			if (char === ")") parenDepth++;
			else if (char === "(") parenDepth--;

			// Look for operators at depth 0
			if (parenDepth === 0 && operators.includes(char)) {
				// Make sure it's not a leading minus for negative numbers
				const prevChar = i > 0 ? expr[i - 1] : "";
				const prev2Char = i > 1 ? expr[i - 2] : "";
				// Check if this minus follows an operator (including spaced operators)
				const isLeadingMinus =
					char === "-" &&
					(i === 0 ||
						(prevChar && /[+\-*/]/.test(prevChar)) ||
						(prevChar === " " &&
							prev2Char &&
							/[+\-*/]/.test(prev2Char)));

				if (isLeadingMinus) continue;

				const left = expr.substring(0, i).trim();
				const right = expr.substring(i + 1).trim();
				if (left && right) {
					return [expr, left, char, right];
				}
			}
		}
		return null;
	};

	// Try to find operators in order of precedence (lowest first for right-associativity)
	const arithMatch = findOperator(["+", "-"]) || findOperator(["*", "/"]);

	if (arithMatch && arithMatch[1] && arithMatch[3]) {
		const [, _left, _op, _right] = arithMatch;
		// Don't treat leading minus as arithmetic operator
		if (_op === "-" && _left.trim() === "") {
			// Skip this match, it's a negative number not subtraction
		} else {
			const left = _evaluateExpression(_left.trim());
			const right = _evaluateExpression(_right.trim());
			return _createResult((ctx) => {
				const leftVal = left.fn(ctx);
				const rightVal = right.fn(ctx);

				if (_op === "+") {
					// String concatenation - if either side is string, concatenate
					if (_isStr(leftVal) || _isStr(rightVal)) {
						return String(leftVal) + String(rightVal);
					}
					// Numeric addition
					if (_isNum(leftVal) && _isNum(rightVal)) {
						return (leftVal as number) + (rightVal as number);
					}
					// Mixed types - convert to string
					return String(leftVal) + String(rightVal);
				} else if (_isNum(leftVal) && _isNum(rightVal)) {
					return _op === "-"
						? (leftVal as number) - (rightVal as number)
						: _op === "*"
						? (leftVal as number) * (rightVal as number)
						: _op === "/"
						? rightVal !== 0
							? (leftVal as number) / (rightVal as number)
							: undefined
						: undefined;
				}
				return undefined;
			}, new Set([...left._stateRefs, ...right._stateRefs]));
		}
	}

	if (PROP_RE.test(expr)) {
		return _createResult((ctx) => {
			// Try to resolve from context first
			let result = _evalProp(expr, ctx);

			// If not found, try State registry
			if (result === undefined) {
				const parts = expr.split(/[.\[\]]/).filter(Boolean);
				const baseStateName = parts[0];
				if (baseStateName) {
					const baseState = State.get(baseStateName);
					if (baseState) {
						const stateContext = {
							...ctx,
							[baseStateName]: baseState.value,
						};
						result = _evalProp(expr, stateContext);
					}
				}
			}

			return result;
		});
	}

	if (COMP_RE.test(expr)) {
		const compMatch = expr.match(COMP_RE);
		if (compMatch?.[1] && compMatch[3]) {
			const leftPart = compMatch[1].trim();
			const operator = compMatch[2];
			const rightPart = compMatch[3].trim();

			if (rightPart && !"=><".includes(rightPart[0]!)) {
				const left = _evaluateExpression(leftPart);
				const right = _evaluateExpression(rightPart);

				return _createResult((ctx = {}) => {
					const leftVal = left.fn(ctx);
					const rightVal = right.fn(ctx);

					switch (operator) {
						case "===":
							return leftVal === rightVal;
						case "!==":
							return leftVal !== rightVal;
						case ">=":
							return (
								typeof leftVal === typeof rightVal &&
								(leftVal as any) >= (rightVal as any)
							);
						case "<=":
							return (
								typeof leftVal === typeof rightVal &&
								(leftVal as any) <= (rightVal as any)
							);
						case ">":
							return (
								typeof leftVal === typeof rightVal &&
								(leftVal as any) > (rightVal as any)
							);
						case "<":
							return (
								typeof leftVal === typeof rightVal &&
								(leftVal as any) < (rightVal as any)
							);
						default:
							return false;
					}
				}, new Set([...left._stateRefs, ...right._stateRefs]));
			}
		}
		return _createResult(() => expr);
	}

	// Final fallback for properties and other expressions
	return _createResult((ctx) => {
		// Try property access first
		if (PROP_RE.test(expr)) {
			const result = _evalProp(expr, ctx);
			return result !== undefined ? result : undefined;
		}
		// Return the raw expression as fallback
		return expr;
	});
};

// Public API
export const evaluateExpression = _evaluateExpression;
