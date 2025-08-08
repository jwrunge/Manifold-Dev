import { CtxFunction } from "./registry";
import { State } from "./State";

export interface StateReference {
	_name: string;
	_state: State<unknown>;
}

const PROP_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:[.\[][\w\]]*)*$/,
	COMP_RE =
		/^([a-zA-Z_$][\w.[\]]*|-?\d+(?:\.\d+)?|["'][^"']*["']|true|false|null|undefined)\s*(===|!==|>=|<=|>|<)\s*(.+)$/,
	LITERALS: any = { true: true, false: false, null: null, undefined },
	_isNum = (v: any) => typeof v === "number",
	_isStr = (v: any) => typeof v === "string",
	_evalProp = (expr: string, ctx: any = {}) => {
		const parts = expr.split(/[.\[\]]/).filter(Boolean);
		let result: any = ctx;
		for (const part of parts) {
			if (result == null) return;
			result = result[/^\d+$/.test(part) ? +part : part];
		}
		return result;
	},
	_setProp = (expr: string, value: any, ctx: any = {}) => {
		const parts = expr.split(/[.\[\]]/).filter(Boolean);
		let target: any = ctx;
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (target == null || !part) return;
			target = target[/^\d+$/.test(part) ? +part : part];
		}
		const finalPart = parts[parts.length - 1];
		if (target != null && finalPart != null)
			target[/^\d+$/.test(finalPart) ? +finalPart : finalPart] = value;
	};
export interface ExpressionResult {
	fn: CtxFunction;
	_stateRefs: Set<{ _name: string; _state: State<unknown> }>;
	_isAssignment?: boolean;
	_assignTarget?: string;
	_isArrowFunction?: boolean;
}

const _evaluateExpression = (expr?: string): ExpressionResult => {
	expr = expr?.trim();
	if (!expr) return { fn: () => undefined, _stateRefs: new Set() };

	// Handle parameterized arrow functions: (param) => expression
	const a = expr.match(/^\s*\(\s*(\w+)\s*\)\s*=>\s*(.+)$/);
	if (a?.[1] && a[2]) {
		const b = _evaluateExpression(
			a[2].replace(new RegExp(`\\b${a[1]}\\b`, "g"), "arg")
		);
		return { ...b, _isArrowFunction: true };
	}

	// Handle parameterless arrow functions: () => expression
	const parameterlessArrow = expr.match(/^\s*\(\s*\)\s*=>\s*(.+)$/);
	console.log(
		`🔍 Checking parameterless arrow for "${expr}":`,
		parameterlessArrow
	);
	if (parameterlessArrow?.[1]) {
		console.log(
			`✅ Detected parameterless arrow function: () => ${parameterlessArrow[1]}`
		);
		const bodyExpr = parameterlessArrow[1];
		const b = _evaluateExpression(bodyExpr);
		console.log(`Arrow body evaluation result:`, b);

		const result = {
			...b,
			_isArrowFunction: true,
			fn: (c: any) => {
				// For arrow functions, we need to ensure global variables are accessible
				// Create a context that includes both props and global variables
				const mergedContext = { ...window, ...c };
				return b.fn(mergedContext);
			},
		};
		console.log(`Final arrow function result:`, result);
		return result;
	}

	const m = expr.match(
		/^([a-zA-Z_$][\w]*(?:\.[\w]+|\[\d+\])*)\s*=\s*([^=].*)$/
	);
	if (m?.[1] && m[2]) {
		const v = _evaluateExpression(m[2]);
		return {
			fn: (c) => {
				const x = v.fn(c);
				const varName = m[1]!;

				console.log(`🔧 Assignment operation: ${varName} = ${x}`);

				// Check if it's a simple variable name (no dots or brackets)
				const isSimpleVar = /^[a-zA-Z_$][\w]*$/.test(varName);

				if (isSimpleVar) {
					// Handle State objects for simple variables
					const stateObj = window[varName];
					const isState =
						stateObj &&
						typeof stateObj === "object" &&
						"value" in stateObj;

					console.log(
						`window[${varName}]:`,
						stateObj,
						isState ? "(State object)" : "(primitive)"
					);

					if (isState) {
						stateObj.value = x;
						console.log(
							`Updated State: window[${varName}].value = ${x}`
						);
					} else {
						window[varName] = x;
						console.log(`Assigned to window[${varName}] = ${x}`);
					}
				} else {
					// Use original _setProp for complex property paths
					_setProp(varName, x, c);
					console.log(`Set property: ${varName} = ${x}`);
				}

				return x;
			},
			_stateRefs: v._stateRefs,
			_isAssignment: true,
			_assignTarget: m[1],
		};
	}

	// Handle increment and decrement operators (MOVED UP to avoid conflicts with + operator)
	const incrementMatch = expr.match(/^(.+?)\s*(\+\+|--)\s*$/);
	if (incrementMatch) {
		const [, varName, operator] = incrementMatch;
		return {
			fn: (context: any) => {
				console.log(`🔢 Increment operation: ${varName}${operator}`);
				console.log(`Context:`, context);

				// First check if varName exists in the context (props)
				let stateObj = context[varName];
				let isContextState =
					stateObj &&
					typeof stateObj === "object" &&
					"value" in stateObj;

				// If not in context, check window
				if (!isContextState) {
					stateObj = window[varName];
				}

				const isState =
					stateObj &&
					typeof stateObj === "object" &&
					"value" in stateObj;

				console.log(
					`${isContextState ? "context" : "window"}[${varName}]:`,
					stateObj,
					isState ? "(State object)" : "(primitive)"
				);

				// Get current value, defaulting to 0 if undefined
				let current;
				if (isState) {
					current = stateObj.value;
				} else if (isContextState) {
					current = stateObj;
				} else {
					current = window[varName] || 0;
				}

				console.log(`Current value:`, current, typeof current);

				const newValue =
					operator === "++"
						? Number(current) + 1
						: Number(current) - 1;
				console.log(`New value:`, newValue);

				// Update State object or primitive value
				if (isState) {
					stateObj.value = newValue;
					console.log(
						`Updated State: ${
							isContextState ? "context" : "window"
						}[${varName}].value = ${newValue}`
					);
				} else if (isContextState) {
					context[varName] = newValue;
					console.log(`Updated context[${varName}] = ${newValue}`);
				} else {
					window[varName] = newValue;
					console.log(`Assigned to window[${varName}] = ${newValue}`);
				}

				return newValue;
			},
			_stateRefs: new Set(),
		};
	}

	const s = new Set<{ _name: string; _state: State<unknown> }>();
	const p = new Set<string>();
	let i = 0;
	while (i < expr.length) {
		const h = expr[i];
		if (h === '"' || h === "'" || h === "`") {
			i++;
			while (i < expr.length && expr[i] !== h) {
				if (expr[i] === "\\") i++;
				i++;
			}
			i++;
		} else if (h && /[a-zA-Z_$]/.test(h)) {
			let d = "",
				j = i;
			while (j < expr.length) {
				const ch = expr[j];
				if (!ch || !/[a-zA-Z0-9_$.\[\]]/.test(ch)) break;
				d += ch;
				j++;
			}
			const b = d.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/)?.[0];
			if (
				b &&
				!/^(true|false|null|undefined|arg|typeof|instanceof|new|function|class|let|const|var|if|else|for|while|do|switch|case|default|try|catch|finally|throw|return|break|continue)$/.test(
					b
				) &&
				!p.has(b)
			) {
				p.add(b);
				s.add({ _name: b, _state: State.get(b) || (null as any) });
			}
			i = j;
		} else i++;
	}

	const _createResult = (
		f: CtxFunction,
		r: Set<any> = new Set(),
		arrow = false
	): ExpressionResult => {
		const n = new Set<string>(),
			d = new Set<any>();
		for (const x of [...s, ...r])
			if (!n.has(x._name)) {
				n.add(x._name);
				d.add(x);
			}
		return { fn: f, _stateRefs: d, _isArrowFunction: arrow };
	};

	if (expr in LITERALS) return _createResult(() => LITERALS[expr]);
	if (/^-?\d+\.?\d*$/.test(expr)) return _createResult(() => +expr);

	const t = expr.match(/^(['"`])(.*?)\1$/);
	if (
		t?.[2] !== undefined &&
		t[1] &&
		expr.indexOf(t[1], 1) === expr.length - 1
	)
		return _createResult(() => t[2]);

	if (expr.startsWith("(") && expr.endsWith(")")) {
		let d = 0,
			w = true;
		for (let k = 0; k < expr.length; k++) {
			if (expr[k] === "(") d++;
			else if (expr[k] === ")") d--;
			if (d === 0 && k < expr.length - 1) {
				w = false;
				break;
			}
		}
		if (w) return _evaluateExpression(expr.slice(1, -1));
	}

	let q = -1,
		c = -1,
		z = 0;
	for (let k = 0; k < expr.length; k++) {
		if (expr[k] === "?") {
			if (z === 0 && q === -1) q = k;
			z++;
		} else if (expr[k] === ":") {
			z--;
			if (z === 0 && q !== -1 && c === -1) {
				c = k;
				break;
			}
		}
	}
	if (q !== -1 && c !== -1) {
		const u = _evaluateExpression(expr.slice(0, q)),
			v = _evaluateExpression(expr.slice(q + 1, c)),
			w = _evaluateExpression(expr.slice(c + 1));
		return _createResult(
			(x: any) => (u.fn(x) ? v.fn(x) : w.fn(x)),
			new Set([...u._stateRefs, ...v._stateRefs, ...w._stateRefs])
		);
	}

	const notMatch = expr.match(/^!\s*(.+)$/);
	if (notMatch?.[1]) {
		const n = _evaluateExpression(notMatch[1]);
		return _createResult((x: any) => !n.fn(x), n._stateRefs);
	}
	const negMatch = expr.match(/^-\s*(.+)$/);
	if (negMatch?.[1]) {
		const n = _evaluateExpression(negMatch[1]);
		return _createResult((x: any) => -(n.fn(x) as number), n._stateRefs);
	}

	let o = expr.match(/^(.+?)\s*\|\|\s*(.+)$/);
	if (o?.[1] && o[2]) {
		const l = _evaluateExpression(o[1]),
			r = _evaluateExpression(o[2]);
		return _createResult(
			(x: any) => l.fn(x) || r.fn(x),
			new Set([...l._stateRefs, ...r._stateRefs])
		);
	}
	o = expr.match(/^(.+?)\s*&&\s*(.+)$/);
	if (o?.[1] && o[2]) {
		const l = _evaluateExpression(o[1]),
			r = _evaluateExpression(o[2]);
		return _createResult(
			(x: any) => l.fn(x) && r.fn(x),
			new Set([...l._stateRefs, ...r._stateRefs])
		);
	}

	const F = (ops: string[]) => {
		let g = 0,
			n = false,
			q = "";
		for (let k = expr.length - 1; k >= 0; k--) {
			const h = expr[k];
			if (!h) continue;
			if (!n && (h === '"' || h === "'" || h === "`")) {
				n = true;
				q = h;
				continue;
			}
			if (n && h === q && (k === 0 || expr[k - 1] !== "\\")) {
				n = false;
				q = "";
				continue;
			}
			if (n) continue;
			if (h === ")") g++;
			else if (h === "(") g--;
			if (g === 0 && ops.includes(h)) {
				const prev = k > 0 ? expr[k - 1] : "",
					prev2 = k > 1 ? expr[k - 2] : "";
				if (
					h === "-" &&
					(k === 0 ||
						(prev && /[+\-*/]/.test(prev)) ||
						(prev === " " && prev2 && /[+\-*/]/.test(prev2)))
				)
					continue;
				const l = expr.substring(0, k).trim(),
					r = expr.substring(k + 1).trim();
				if (l && r) return [l, h, r];
			}
		}
		return null;
	};

	const A = F(["+", "-"]) || F(["*", "/"]);
	if (A && A[0] && A[2]) {
		const l = _evaluateExpression(A[0]),
			r = _evaluateExpression(A[2]);
		return _createResult((x: any) => {
			const lv = l.fn(x),
				rv = r.fn(x);
			if (A[1] === "+")
				return _isStr(lv) || _isStr(rv)
					? String(lv) + String(rv)
					: _isNum(lv) && _isNum(rv)
					? (lv as number) + (rv as number)
					: String(lv) + String(rv);
			else if (_isNum(lv) && _isNum(rv))
				return A[1] === "-"
					? (lv as number) - (rv as number)
					: A[1] === "*"
					? (lv as number) * (rv as number)
					: rv !== 0
					? (lv as number) / (rv as number)
					: undefined;
		}, new Set([...l._stateRefs, ...r._stateRefs]));
	}

	if (PROP_RE.test(expr))
		return _createResult((x: any) => {
			let y = _evalProp(expr, x);
			if (y === undefined) {
				const b = expr.split(/[.\[\]]/).filter(Boolean)[0];
				if (b) {
					const st = State.get(b);
					if (st) y = _evalProp(expr, { ...x, [b]: st.value });
				}
			}
			return y;
		});

	// Handle pre-increment and pre-decrement operators
	const preIncrementMatch = expr.match(
		/^(\+\+|\-\-)([a-zA-Z_$][\w]*(?:\.[\w]+|\[\d+\])*)$/
	);
	if (preIncrementMatch?.[1] && preIncrementMatch[2]) {
		const operator = preIncrementMatch[1];
		const varName = preIncrementMatch[2];

		return _createResult((x: any) => {
			// For State objects, we need to modify the .value property
			const variable = _evalProp(varName, x);
			if (
				variable &&
				typeof variable === "object" &&
				"value" in variable
			) {
				// This is a State object
				const oldValue = variable.value;
				const newValue =
					operator === "++" ? oldValue + 1 : oldValue - 1;
				variable.value = newValue;
				return newValue; // Pre-increment/decrement returns new value
			} else {
				// Regular variable
				const currentValue = _evalProp(varName, x);
				const newValue =
					operator === "++" ? currentValue + 1 : currentValue - 1;
				_setProp(varName, newValue, x);
				return newValue; // Pre-increment/decrement returns new value
			}
		});
	}

	if (COMP_RE.test(expr)) {
		const M = expr.match(COMP_RE);
		if (M?.[1] && M[3] && M[3][0] && !"=><".includes(M[3][0])) {
			const l = _evaluateExpression(M[1]),
				r = _evaluateExpression(M[3]);
			return _createResult((x: any) => {
				const lv = l.fn(x),
					rv = r.fn(x);
				return M[2] === "==="
					? lv === rv
					: M[2] === "!=="
					? lv !== rv
					: M[2] === ">="
					? typeof lv === typeof rv && (lv as any) >= (rv as any)
					: M[2] === "<="
					? typeof lv === typeof rv && (lv as any) <= (rv as any)
					: M[2] === ">"
					? typeof lv === typeof rv && (lv as any) > (rv as any)
					: M[2] === "<"
					? typeof lv === typeof rv && (lv as any) < (rv as any)
					: false;
			}, new Set([...l._stateRefs, ...r._stateRefs]));
		}
		return _createResult(() => expr);
	}

	return _createResult((x: any) =>
		PROP_RE.test(expr) ? _evalProp(expr, x) : expr
	);
};

export default _evaluateExpression;
