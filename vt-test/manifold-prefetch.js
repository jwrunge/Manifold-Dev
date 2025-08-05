// Simple, effective prefetch system for Manifold
class ManifoldPrefetch {
	static prefetched = new Set();
	static prefetchCache = new Map();
	static observer = null;

	static init() {
		// Strategy 1: Hover prefetch (most effective)
		this.enableHoverPrefetch();

		// Strategy 2: Viewport prefetch (for mobile/touch)
		this.enableViewportPrefetch();

		// Strategy 3: Idle prefetch (for critical pages)
		this.enableIdlePrefetch();
	}

	static enableHoverPrefetch() {
		document.addEventListener("mouseover", (e) => {
			const link = e.target.closest("a");
			if (this.shouldPrefetch(link)) {
				this.prefetchLink(link.href, "hover");
			}
		});

		// Also prefetch on focus for keyboard navigation
		document.addEventListener("focusin", (e) => {
			const link = e.target.closest("a");
			if (this.shouldPrefetch(link)) {
				this.prefetchLink(link.href, "focus");
			}
		});
	}

	static enableViewportPrefetch() {
		// Use Intersection Observer for links coming into view
		if ("IntersectionObserver" in window) {
			this.observer = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						if (entry.isIntersecting) {
							const link = entry.target;
							if (this.shouldPrefetch(link)) {
								// Small delay to avoid prefetching while scrolling fast
								setTimeout(() => {
									if (entry.isIntersecting) {
										this.prefetchLink(
											link.href,
											"viewport"
										);
									}
								}, 200);
							}
						}
					});
				},
				{
					rootMargin: "50px", // Start prefetching 50px before link enters viewport
				}
			);

			// Observe all links
			document.querySelectorAll("a[href]").forEach((link) => {
				if (this.shouldPrefetch(link)) {
					this.observer.observe(link);
				}
			});

			// Observer new links added to DOM
			if ("MutationObserver" in window) {
				new MutationObserver((mutations) => {
					mutations.forEach((mutation) => {
						mutation.addedNodes.forEach((node) => {
							if (node.nodeType === 1) {
								// Element node
								const links = node.querySelectorAll
									? node.querySelectorAll("a[href]")
									: [];
								links.forEach((link) => {
									if (this.shouldPrefetch(link)) {
										this.observer.observe(link);
									}
								});
							}
						});
					});
				}).observe(document.body, { childList: true, subtree: true });
			}
		}
	}

	static enableIdlePrefetch() {
		// Prefetch critical pages when browser is idle
		const criticalPages = document.querySelectorAll(
			'a[data-mf-prefetch="critical"]'
		);

		if ("requestIdleCallback" in window) {
			requestIdleCallback(() => {
				criticalPages.forEach((link) => {
					this.prefetchLink(link.href, "idle");
				});
			});
		} else {
			// Fallback for browsers without requestIdleCallback
			setTimeout(() => {
				criticalPages.forEach((link) => {
					this.prefetchLink(link.href, "idle");
				});
			}, 2000);
		}
	}

	static shouldPrefetch(link) {
		if (!link || !link.href) return false;

		// Skip if already prefetched
		if (this.prefetched.has(link.href)) return false;

		// Skip external links
		if (link.hostname !== window.location.hostname) return false;

		// Skip if explicitly disabled
		if (link.hasAttribute("data-mf-no-prefetch")) return false;

		// CRITICAL: Skip any links that might have side effects
		const href = link.href.toLowerCase();

		// Skip action URLs (common patterns that suggest side effects)
		if (
			href.includes("/delete") ||
			href.includes("/remove") ||
			href.includes("/create") ||
			href.includes("/add") ||
			href.includes("/edit") ||
			href.includes("/update") ||
			href.includes("/submit") ||
			href.includes("/process") ||
			href.includes("/action") ||
			href.includes("/do") ||
			href.includes("?action=") ||
			href.includes("&action=")
		)
			return false;

		// Skip URLs with query parameters that suggest actions
		const url = new URL(link.href);
		const dangerousParams = [
			"action",
			"delete",
			"remove",
			"create",
			"edit",
			"submit",
			"confirm",
		];
		for (const param of dangerousParams) {
			if (url.searchParams.has(param)) return false;
		}

		// Skip form submission URLs (if link is inside a form)
		const form = link.closest("form");
		if (form && link.href === form.action) return false;

		// Skip large files or non-HTML
		if (
			href.includes(".pdf") ||
			href.includes(".zip") ||
			href.includes(".jpg") ||
			href.includes(".png") ||
			href.includes("download")
		)
			return false;

		// Skip if user prefers reduced data usage
		if ("connection" in navigator && navigator.connection?.saveData)
			return false;

		// Skip on slow connections
		if (
			"connection" in navigator &&
			navigator.connection?.effectiveType === "slow-2g"
		)
			return false;

		return true;
	}

	static prefetchLink(href, strategy = "unknown") {
		if (this.prefetched.has(href)) return;

		this.prefetched.add(href);

		// CRITICAL: Only prefetch GET requests, never POST/PUT/DELETE
		// Method 1: Link prefetch (safest - browser enforces GET-only)
		if (this.isSameOrigin(href)) {
			const link = document.createElement("link");
			link.rel = "prefetch";
			link.href = href;
			link.onload = () =>
				console.log(`✅ Prefetched (${strategy}):`, href);
			link.onerror = () => console.warn(`❌ Prefetch failed:`, href);
			document.head.appendChild(link);
		}

		// Method 2: Fetch with explicit GET and no-side-effects headers
		else {
			fetch(href, {
				method: "GET", // EXPLICIT: Only GET requests
				cache: "force-cache",
				priority: "low",
				headers: {
					// Signal this is a prefetch - server can respond differently
					"X-Purpose": "prefetch",
					Purpose: "prefetch",
					// Some servers check this header
					"Sec-Purpose": "prefetch",
				},
			})
				.then((response) => {
					if (response.ok) {
						this.prefetchCache.set(href, response.clone());
						console.log(`✅ Cached (${strategy}):`, href);
					}
				})
				.catch((err) => {
					console.warn(`❌ Cache failed:`, href, err);
				});
		}
	}

	static isSameOrigin(href) {
		try {
			const url = new URL(href, window.location.origin);
			return url.origin === window.location.origin;
		} catch {
			return false;
		}
	}

	// Enhanced navigation that uses prefetch cache
	static navigate(href) {
		// If we have it cached, navigation will be instant
		if (this.prefetched.has(href)) {
			console.log("🚀 Using prefetched page:", href);
		}

		window.location.href = href;
	}

	// Get prefetch stats (for debugging)
	static getStats() {
		return {
			prefetched: Array.from(this.prefetched),
			cached: Array.from(this.prefetchCache.keys()),
			total: this.prefetched.size,
		};
	}
}

// Auto-initialize
ManifoldPrefetch.init();
