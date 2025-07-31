// Quick test for state aliasing functionality
import { evaluateExpression } from "./src/expression-parser.ts";

// Test cases
const testCases = [
	"@myState", // Simple state reference
	"@myState.property", // Property access
	"@myState as alias", // Simple alias
	"@myState.property as prop", // Property with alias
	"@user.profile.name as userName", // Nested property with alias
];

console.log("Testing state aliasing:");
testCases.forEach((expr) => {
	try {
		const result = evaluateExpression(expr);
		console.log(`Expression: "${expr}"`);
		console.log(
			"State refs:",
			Array.from(result.stateRefs).map((ref) => ({
				name: ref.name,
				hasState: !!ref.state,
			}))
		);
		console.log("---");
	} catch (error) {
		console.log(`Error with "${expr}":`, error.message);
	}
});
