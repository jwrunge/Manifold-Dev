// Simple test for arrow function detection
const arrowFunctionRegex = /^\s*\(\s*(\w+)\s*\)\s*=>\s*(.+)$/;

const testCases = [
	"(name) => validateName(name)",
	"(value) => processedName = value.trim()",
	"(x) => x * 2",
	"(data) => @append('#list', data.html)",
	"user.name", // should not match
	"() => console.log('hello')", // should not match (no parameter)
	"(a, b) => a + b", // should not match (multiple parameters)
];

console.log("Testing arrow function detection:");
testCases.forEach((expr) => {
	const match = expr.match(arrowFunctionRegex);
	if (match) {
		const [, paramName, body] = match;
		const bodyWithArg = body.replace(
			new RegExp(`\\b${paramName}\\b`, "g"),
			"arg"
		);
		console.log(
			`✓ "${expr}" -> param: "${paramName}", body with arg: "${bodyWithArg}"`
		);
	} else {
		console.log(`✗ "${expr}" -> no match`);
	}
});
