import fs from "fs";

const code = fs.readFileSync("dist/manifold.es.js", "utf8");

// Extract all variable/function names (single letters and longer identifiers)
// This regex captures:
// - Single letter variables (a-z, A-Z)
// - Multi-character identifiers starting with letter/$/_
const identifierRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;

const counts = new Map();
const matches = code.match(identifierRegex) || [];

// Count occurrences
for (const match of matches) {
	// Skip common JS keywords and built-ins that don't count as "repeated variables"
	const skipKeywords = new Set([
		"const",
		"let",
		"var",
		"function",
		"class",
		"return",
		"if",
		"else",
		"for",
		"while",
		"do",
		"switch",
		"case",
		"break",
		"continue",
		"try",
		"catch",
		"throw",
		"new",
		"this",
		"typeof",
		"instanceof",
		"in",
		"of",
		"true",
		"false",
		"null",
		"undefined",
		"void",
		"static",
		"get",
		"set",
		"constructor",
		"super",
		"extends",
		"import",
		"export",
		"default",
		"as",
		"from",
		"async",
		"await",
		"Object",
		"Array",
		"String",
		"Number",
		"Boolean",
		"Date",
		"RegExp",
		"Math",
		"JSON",
		"Set",
		"Map",
		"WeakMap",
		"Proxy",
		"Node",
		"ELEMENT_NODE",
		"TEXT_NODE",
		"parseFloat",
		"parseInt",
		"filter",
		"Boolean",
		"forEach",
		"slice",
		"trim",
		"match",
		"test",
		"split",
		"join",
		"push",
		"pop",
		"add",
		"clear",
		"delete",
		"has",
		"size",
		"entries",
		"keys",
		"values",
		"length",
		"prototype",
		"call",
		"apply",
		"bind",
		"toString",
		"valueOf",
		"hasOwnProperty",
		"isPrototypeOf",
		"propertyIsEnumerable",
		"toLocaleString",
		"substring",
		"replace",
		"replaceAll",
		"startsWith",
		"endsWith",
		"includes",
		"indexOf",
		"lastIndexOf",
		"charAt",
		"charCodeAt",
		"toUpperCase",
		"toLowerCase",
		"padStart",
		"padEnd",
		"repeat",
		"concat",
		"reverse",
		"sort",
		"splice",
		"shift",
		"unshift",
		"find",
		"findIndex",
		"some",
		"every",
		"reduce",
		"reduceRight",
		"map",
		"flatMap",
		"flat",
		"isArray",
		"getTime",
		"setTime",
		"exec",
		"run",
		"stop",
		"active",
		"fn",
		"value",
		"name",
		"state",
		"props",
		"register",
		"effect",
		"parentElement",
		"childNodes",
		"attributes",
		"textContent",
		"nodeType",
		"hasAttribute",
		"getAttribute",
		"setAttribute",
		"removeAttribute",
		"addEventListener",
		"assign",
		"create",
		"defineProperty",
		"getOwnPropertyDescriptor",
		"freeze",
		"seal",
		"preventExtensions",
		"isExtensible",
		"isSealed",
		"isFrozen",
		"getPrototypeOf",
		"setPrototypeOf",
		"random",
		"floor",
		"ceil",
		"round",
		"abs",
		"max",
		"min",
	]);

	if (!skipKeywords.has(match)) {
		counts.set(match, (counts.get(match) || 0) + 1);
	}
}

// Sort by count (descending) and then alphabetically for ties
const sorted = Array.from(counts.entries())
	.filter(([name, count]) => count > 1) // Only show repeated identifiers
	.sort((a, b) => {
		if (b[1] !== a[1]) return b[1] - a[1]; // Sort by count descending
		return a[0].localeCompare(b[0]); // Then alphabetically
	});

console.log(
	"🔍 Repeated Variables/Functions in manifold.es.js (sorted by frequency):\n"
);

sorted.forEach(([name, count], index) => {
	console.log(
		`${String(index + 1).padStart(2, " ")}. ${name.padEnd(
			12
		)} - ${count} occurrences`
	);
});

console.log(`\n📊 Total unique repeated identifiers: ${sorted.length}`);
console.log(`📊 Total identifier occurrences analyzed: ${matches.length}`);
