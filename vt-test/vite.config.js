import { defineConfig } from "vite";

export default defineConfig({
	// No lib config - just serve static files
	root: ".", // Only serve from current directory
	server: {
		port: 5174,
		hmr: false,
	},
	optimizeDeps: {
		entries: [], // Don't scan for dependencies
	},
});
