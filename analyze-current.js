import fs from "fs";

const code = fs.readFileSync("dist/manifold.es.js", "utf8");

// Extract identifiers but exclude minified names
const identifierRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;

const counts = new Map();
const matches = code.match(identifierRegex) || [];

// Count occurrences
for (const match of matches) {
	// Skip common JS keywords and built-ins
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

	// Skip minified variable names:
	// - Single letters (a-z, A-Z)
	// - Common double letters that are likely minified (aa, ab, ac, etc.)
	// - Special minified patterns like __PURE__
	const isMinified = (name) => {
		// Single letters
		if (name.length === 1) return true;

		// Double letters that are clearly minified (all combinations of common letters)
		if (name.length === 2 && /^[a-zA-Z]{2}$/.test(name)) return true;

		// Special minified patterns
		if (name === "__PURE__") return true;

		// Very short letter combinations that are clearly minified
		if (
			name.length <= 3 &&
			/^[a-zA-Z_]+$/.test(name) &&
			!/^(get|set|has|add|pop|run|top|end|max|min|sum|all|any|old|new)$/.test(
				name
			)
		) {
			return true;
		}

		return false;
	};

	if (!skipKeywords.has(match) && !isMinified(match)) {
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
	"🔍 Non-Minified Repeated Variables/Functions in manifold.es.js:\n"
);

if (sorted.length === 0) {
	console.log("✨ No repeated non-minified identifiers found!");
	console.log(
		"   This indicates excellent code organization and minification."
	);
} else {
	sorted.forEach(([name, count], index) => {
		console.log(
			`${String(index + 1).padStart(2, " ")}. ${name.padEnd(
				20
			)} - ${count} occurrences`
		);
	});
}

console.log(`\n📊 Total non-minified repeated identifiers: ${sorted.length}`);
console.log(`📊 Total identifier occurrences analyzed: ${matches.length}`);

// Also show the first few with ALL identifiers for context
console.log("\n🔍 ALL Repeated Identifiers (including minified):");
const allSorted = Array.from(counts.entries())
	.filter(([name, count]) => count > 1)
	.sort((a, b) => {
		if (b[1] !== a[1]) return b[1] - a[1];
		return a[0].localeCompare(b[0]);
	});

// Add back minified variables
const allCounts = new Map();
for (const match of matches) {
	if (
		!new Set([
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
		]).has(match)
	) {
		allCounts.set(match, (allCounts.get(match) || 0) + 1);
	}
}

const allRepeated = Array.from(allCounts.entries())
	.filter(([name, count]) => count > 1)
	.sort((a, b) => {
		if (b[1] !== a[1]) return b[1] - a[1];
		return a[0].localeCompare(b[0]);
	});

console.log(`Top 10 most frequent:`);
allRepeated.slice(0, 10).forEach(([name, count], index) => {
	console.log(
		`${String(index + 1).padStart(2, " ")}. ${name.padEnd(
			15
		)} - ${count} occurrences`
	);
});
