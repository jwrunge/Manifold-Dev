import { evaluateExpression } from "./dist/manifold.es.js";

const context = { name: "Alice", index: 0 };

console.log("Test 1: 'Hello ' + name");
const result1 = evaluateExpression("'Hello ' + name");
console.log("Result1:", result1.fn(context));

console.log("Test 2: index + ': '");
const result2 = evaluateExpression("index + ': '");
console.log("Result2:", result2.fn(context));

console.log("Test 3: 'Number: ' + index + ', '");
const result3 = evaluateExpression("'Number: ' + index + ', '");
console.log("Result3:", result3.fn(context));
