// Simple debug test
const expr = "'Number: ' + index + ', '";

// Test the regex patterns
const PROP_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:[.\[\]]\w*\]?)*$/;
const arithMatch = expr.match(/^(.+?)\s*([+\-*/])\s*(.+)$/);

console.log("Expression:", expr);
console.log("PROP_RE test:", PROP_RE.test(expr));
console.log("Arithmetic match:", arithMatch);

if (arithMatch) {
	console.log("Left:", arithMatch[1]);
	console.log("Op:", arithMatch[2]);
	console.log("Right:", arithMatch[3]);
}

// Test individual parts
const leftPart = "'Number: '";
const rightPart = "index + ', '";

console.log("\nLeft part PROP_RE:", PROP_RE.test(leftPart));
console.log(
	"Right part arith match:",
	rightPart.match(/^(.+?)\s*([+\-*/])\s*(.+)$/)
);
