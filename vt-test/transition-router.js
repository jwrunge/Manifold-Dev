// Manifold Transition System - Hybrid approach with View Transitions API
class ManifoldTransitions {
	static navigate(url) {
		// Check if user prefers reduced motion
		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)"
		).matches;

		if (prefersReducedMotion) {
			// Skip transition delay for accessibility
			window.location.href = url;
			return;
		}

		// For cross-document transitions, we WANT View Transitions API
		// to prevent flashing of common elements (headers, navs, etc.)
		if (
			this.supportsViewTransitions() &&
			!document.documentElement.hasAttribute(
				"data-mf-no-view-transitions"
			)
		) {
			// Let browser handle the cross-document transition
			// The CSS will control what actually transitions
			window.location.href = url;
			return;
		}

		// Fallback to class-based transitions for unsupported browsers
		document.body.classList.add("mf-transitioning", "mf-outro");

		const duration = this.getTransitionDuration();
		setTimeout(() => {
			window.location.href = url;
		}, duration);
	}

	static supportsViewTransitions() {
		return (
			"startViewTransition" in document &&
			CSS.supports("view-transition-name", "test")
		);
	}

	// Enhanced state effect wrapper that uses View Transitions API
	static stateEffect(callback, element) {
		// Check if View Transitions are supported and desired
		if (
			this.supportsViewTransitions() &&
			!window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
			!document.documentElement.hasAttribute(
				"data-mf-no-view-transitions"
			)
		) {
			// Use View Transitions API for smooth state changes
			return document.startViewTransition(() => {
				// Apply class-based states for users who want them
				if (element && element.classList) {
					element.classList.add("mf-transitioning");
				}

				// Run the state change
				const result = callback();

				// Clean up classes after DOM update
				if (element && element.classList) {
					// Use setTimeout to ensure DOM has updated
					setTimeout(() => {
						element.classList.remove("mf-transitioning");
					}, 0);
				}

				return result;
			});
		} else {
			// Fallback: just apply classes and run callback
			if (element && element.classList) {
				element.classList.add("mf-transitioning");

				setTimeout(() => {
					element.classList.remove("mf-transitioning");
				}, this.getTransitionDuration());
			}

			return callback();
		}
	}

	static getTransitionDuration() {
		const computed = getComputedStyle(document.documentElement);
		const customDuration = computed
			.getPropertyValue("--mf-transition-duration")
			.trim();

		if (customDuration) {
			// Parse CSS time values (s or ms)
			const value = parseFloat(customDuration);
			return customDuration.includes("ms") ? value : value * 1000;
		}

		// Fallback: check for animation duration on body
		const animDuration = getComputedStyle(document.body).animationDuration;
		if (animDuration && animDuration !== "none" && animDuration !== "0s") {
			return parseFloat(animDuration) * 1000;
		}

		return 300; // Default fallback
	}

	static init() {
		// Add reduced motion class for CSS targeting
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			document.documentElement.classList.add("mf-reduced-motion");
		}

		// Initialize prefetch system
		if (typeof ManifoldPrefetch !== "undefined") {
			ManifoldPrefetch.init();
		}

		// Auto-hijack navigation links
		document.addEventListener("click", (e) => {
			if (!e.target) return;

			const target = e.target;
			const link = target.closest ? target.closest("a") : null;

			if (
				link &&
				link.href &&
				!link.target &&
				!e.metaKey &&
				!e.ctrlKey &&
				!link.hasAttribute("data-mf-no-transition")
			) {
				e.preventDefault();

				// Use prefetch-aware navigation if available
				if (typeof ManifoldPrefetch !== "undefined") {
					ManifoldPrefetch.navigate(link.href);
				} else {
					this.navigate(link.href);
				}
			}
		});

		// Set intro animation on load
		document.addEventListener("DOMContentLoaded", () => {
			document.body.classList.add("mf-intro");

			// Remove intro class after animation
			const duration = this.getTransitionDuration();
			setTimeout(() => {
				document.body.classList.remove("mf-intro");
			}, duration);
		});
	}
}

// Initialize immediately
ManifoldTransitions.init();
