// Simple transition helper
class SimpleTransitions {
	static setDirection(direction) {
		sessionStorage.setItem("transition-direction", direction);
	}

	static applyDirection() {
		const direction = sessionStorage.getItem("transition-direction");
		if (direction) {
			document.documentElement.className = direction;
			sessionStorage.removeItem("transition-direction");
		}
	}

	static sameDocumentTransition(callback) {
		// Find page element and disable its transition
		const page = document.querySelector('[id^="page"]');
		if (page) {
			page.style.viewTransitionName = "none";
		}

		return document.startViewTransition(callback).finished.then(() => {
			if (page) {
				page.style.viewTransitionName = "";
			}
		});
	}
}

// Auto-apply direction on page load
document.addEventListener("DOMContentLoaded", () => {
	SimpleTransitions.applyDirection();
});

// Set direction on navigation links
document.addEventListener("click", (e) => {
	if (e.target.tagName === "A" && e.target.href) {
		const href = e.target.href;
		if (href.includes("page1.html")) {
			SimpleTransitions.setDirection("slide-left-out slide-right-in");
		} else if (href.includes("index.html")) {
			SimpleTransitions.setDirection("slide-right-out slide-left-in");
		}
	}
});
