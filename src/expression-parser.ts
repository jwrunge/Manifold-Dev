import { CtxFunction } from "./registry";
import { State } from "./State";

export interface StateReference {
	_name: string;
	_state: State<unknown>;
}

const ID = "[a-zA-Z_$][a-zA-Z0-9_$]*",
	PROP = `${ID}(?:[.\\[]\\w*\\]?)*`,
	PROP_RE = new RegExp(`^${PROP}$`),
	VALUE = `(?:${PROP}|-?\\d+(?:\\.\\d+)?|["'][^"']*["']|true|false|null|undefined)`,
	COMP_RE = new RegExp(`^(${VALUE})\\s*(===|!==|>=|<=|>|<)\\s*(.+)$`),
	STATE_RE = new RegExp(PROP, "g"),
	LITERALS: Record<string, unknown> = {
		true: true,
		false: false,
		null: null,
		undefined: undefined,
	},
	isNum = (val: unknown): boolean => typeof val === "number",
	isStr = (val: unknown): boolean => typeof val === "string";

const _parseArithmetic = (expr: string) => {
	// Simple left-to-right parsing for basic arithmetic
	const match = expr.match(/^(.+?)\s*([+\-*/])\s*(.+)$/);
	if (!match || !match[1] || !match[3]) return null;

	const [, left, op, right] = match;
	// Don't treat leading minus as arithmetic operator
	if (op === "-" && left.trim() === "") return null;

	return { left: left.trim(), op, right: right.trim() };
};

const _parseTernary = (expr: string) => {
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

export const _evalProp = (
	expr: string,
	ctx: Record<string, unknown> = {}
): unknown => {
	// Split on both dots and bracket notation
	const parts = expr.split(/[.\[\]]/).filter(Boolean);
	let result: unknown = ctx;
	for (const part of parts) {
		if (result == null) return undefined;
		// Handle numeric indices
		if (/^\d+$/.test(part)) {
			result = (result as any)[parseInt(part, 10)];
		} else {
			result = (result as any)[part];
		}
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

	// Navigate to the parent object
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (target == null || !part) return;

		if (/^\d+$/.test(part)) {
			target = target[parseInt(part, 10)];
		} else {
			target = target[part];
		}
	}

	// Set the final property
	const finalPart = parts[parts.length - 1];
	if (target != null && finalPart != null) {
		if (/^\d+$/.test(finalPart)) {
			target[parseInt(finalPart, 10)] = value;
		} else {
			target[finalPart] = value;
		}
	}
};

const _parseValue = (val: string, ctx: Record<string, unknown>): any => {
	val = val.trim();
	if (val in LITERALS) return LITERALS[val];
	if (/^-?\d+\.?\d*$/.test(val)) return parseFloat(val);
	const strMatch = val.match(/^(['"`])(.*?)\1$/);
	if (strMatch) return strMatch[2];

	if (PROP_RE.test(val)) return _evalProp(val, ctx);
	return val;
};

const _evalComparison = (
	expr: string,
	ctx: Record<string, unknown> = {}
): boolean => {
	const match = expr.match(COMP_RE);
	if (!match?.[1] || !match[3]) return false;
	const [, left, op, right] = match;
	const rightTrimmed = right.trim();
	if (!rightTrimmed || "=><".includes(rightTrimmed[0]!)) return false;
	const leftVal = _parseValue(left, ctx);
	const rightVal = _parseValue(rightTrimmed, ctx);

	return op === "===" && leftVal === rightVal
		? true
		: op === "!=="
		? leftVal !== rightVal
		: op === ">="
		? leftVal >= rightVal
		: op === "<="
		? leftVal <= rightVal
		: op === ">"
		? leftVal > rightVal
		: op === "<"
		? leftVal < rightVal
		: false;
};

export interface ExpressionResult {
	fn: CtxFunction;
	_stateRefs: Set<{ _name: string; _state: State<unknown> }>;
	isAssignment?: boolean;
	assignTarget?: string;
}

const _createStateReference = (stateExpr: string): StateReference | null => {
	const parts = stateExpr.split(/[.\[\]]/).filter(Boolean);
	const baseStateName = parts[0];

	if (!baseStateName) return null;

	const baseState = State.get(parts[0]);
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
			return _evalProp(propertyPath.join("."), {
				[baseStateName]: baseState.value,
			});
		}, defaultName);
	}

	return {
		_name: defaultName,
		_state: resultState,
	};
};

export const _evaluateExpression = (expr?: string): ExpressionResult => {
	expr = expr?.trim();
	if (!expr) return { fn: () => undefined, _stateRefs: new Set() };

	// Check for assignment expressions first
	const assignMatch = expr.match(
		/^([a-zA-Z_$][\w]*(?:\.[\w]+|\[\d+\])*)\s*=\s*(.+)$/
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
			isAssignment: true,
			assignTarget: target,
		};
	}

	const stateRefs = new Set<{ _name: string; _state: State<unknown> }>();
	// Find all potential state references (valid identifiers)
	Array.from(expr.matchAll(STATE_RE)).forEach((match) => {
		const stateRef = _createStateReference(match[0]);
		if (stateRef) stateRefs.add(stateRef);
	});

	const _createResult = (
		fn: CtxFunction,
		additionalRefs: Set<{
			_name: string;
			_state: State<unknown>;
		}> = new Set()
	): ExpressionResult => ({
		fn,
		_stateRefs: new Set([...stateRefs, ...additionalRefs]),
	});

	if (expr in LITERALS) return _createResult(() => LITERALS[expr]);
	if (/^-?\d+\.?\d*$/.test(expr))
		return _createResult(() => parseFloat(expr));

	const strMatch = expr.match(/^(['"`])(.*?)\1$/);
	if (strMatch?.[2] !== undefined) {
		return _createResult(() => strMatch[2]);
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

	const ternary = _parseTernary(expr);
	if (ternary) {
		const cond = _evaluateExpression(ternary._condition);
		const tv = _evaluateExpression(ternary._trueValue);
		const fv = _evaluateExpression(ternary._falseValue);
		return _createResult(
			(ctx) => (cond.fn(ctx) ? tv.fn(ctx) : fv.fn(ctx)),
			new Set([...cond._stateRefs, ...tv._stateRefs, ...fv._stateRefs])
		);
	}

	const _negMatch = expr.match(/^!\s*(.+)$/);
	if (_negMatch?.[1]) {
		const inner = _evaluateExpression(_negMatch[1]);
		return _createResult((ctx) => !inner.fn(ctx), inner._stateRefs);
	}

	const _orMatch = expr.match(/^(.+?)\s*\|\|\s*(.+)$/);
	if (_orMatch?.[1] && _orMatch[2]) {
		const left = _evaluateExpression(_orMatch[1]);
		const right = _evaluateExpression(_orMatch[2]);
		return _createResult(
			(ctx) => left.fn(ctx) || right.fn(ctx),
			new Set([...left._stateRefs, ...right._stateRefs])
		);
	}

	const _andMatch = expr.match(/^(.+?)\s*&&\s*(.+)$/);
	if (_andMatch?.[1] && _andMatch[2]) {
		const left = _evaluateExpression(_andMatch[1]);
		const right = _evaluateExpression(_andMatch[2]);
		return _createResult(
			(ctx) => left.fn(ctx) && right.fn(ctx),
			new Set([...left._stateRefs, ...right._stateRefs])
		);
	}

	const _arithParse = _parseArithmetic(expr);
	if (_arithParse) {
		const left = _evaluateExpression(_arithParse.left);
		const right = _evaluateExpression(_arithParse.right);
		const op = _arithParse.op;
		return _createResult((ctx) => {
			const leftVal = left.fn(ctx),
				rightVal = right.fn(ctx);
			if (op === "+") {
				return isStr(leftVal) || isStr(rightVal)
					? `${leftVal}` + `${rightVal}`
					: isNum(leftVal) && isNum(rightVal)
					? (leftVal as number) + (rightVal as number)
					: undefined;
			} else if (isNum(leftVal) && isNum(rightVal)) {
				return op === "-"
					? (leftVal as number) - (rightVal as number)
					: op === "*"
					? (leftVal as number) * (rightVal as number)
					: op === "/"
					? rightVal !== 0
						? (leftVal as number) / (rightVal as number)
						: undefined
					: undefined;
			}
			return undefined;
		}, new Set([...left._stateRefs, ...right._stateRefs]));
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

			return result !== undefined ? result : expr;
		});
	}

	if (COMP_RE.test(expr)) {
		const compMatch = expr.match(COMP_RE);
		if (compMatch?.[1] && compMatch[3]) {
			const rightTrimmed = compMatch[3].trim();
			if (rightTrimmed && !"=><".includes(rightTrimmed[0]!)) {
				return _createResult((ctx) => _evalComparison(expr, ctx));
			}
		}
		return _createResult(() => expr);
	}

	// Final fallback for properties and other expressions
	return _createResult((ctx) => {
		const result = _evalProp(expr, ctx);
		return result !== undefined ? result : expr;
	});
};
