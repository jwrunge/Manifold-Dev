import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
	build: {
		target: "ES2022",
		minify: true,
		lib: {
			entry: "src/index.ts",
			name: "Manifold",
			fileName: (format) => `manifold.${format}.js`,
		},
		rollupOptions: {
			plugins: [
				visualizer({
					filename: "dist/stats.html",
					open: false,
					gzipSize: true,
				}),
			],
			output: {
				compact: true,
			},
		},
	},
	server: {
		hmr: false,
		headers: {
			"Cross-Origin-Embedder-Policy": "require-corp",
			"Cross-Origin-Opener-Policy": "same-origin",
		},
	},
	base: "./",
	esbuild: {
		// Use esbuild's property mangling
		mangleProps: /^(_|#)/, // Mangle properties starting with underscore
		reserveProps: /^(?:constructor|prototype|__proto__|fn)$/, // Reserve important properties
		minifyIdentifiers: true,
		minifySyntax: true,
		minifyWhitespace: true,
	},
});
