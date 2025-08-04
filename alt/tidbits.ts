const _handleSelectorInsert = (
	selectorExp: string,
	element: RegEl,
	fn?: CtxFunction
): CtxFunction | undefined => {
	const parts = selectorExp.split("(");
	const selector = parts.pop()?.replace(")", "").trim();
	const method = parts.at(0)?.trim() ?? "replace";

	if (!selector) {
		console.warn(
			"Selector is empty in selector clause",
			selectorExp,
			element
		);
		return;
	}

	return () => {
		const target = document.querySelector(selector);
		if (!target) {
			console.warn(`Target element not found for selector: ${selector}`);
			return;
		}

		const content = fn?.(element.props);
		if (content == null) return; // Skip if null or undefined

		let nodes: Node[];
		if (typeof content === "string") {
			const temp = document.createElement("div");
			temp.innerHTML = content;
			nodes = Array.from(temp.childNodes);
		} else if (content instanceof Node) {
			nodes = [content];
		} else if (content instanceof NodeList || Array.isArray(content)) {
			nodes = Array.from(content as NodeList | Node[]);
		} else {
			const textNode = document.createTextNode(String(content));
			nodes = [textNode];
		}

		switch (method) {
			case "replace":
				target.replaceChildren(...nodes);
				break;
			case "append":
				target.append(...nodes);
				break;
			case "prepend":
				target.prepend(...nodes);
				break;
			case "swap":
				if (target.parentNode) {
					const fragment = document.createDocumentFragment();
					fragment.append(...nodes);
					target.parentNode.replaceChild(fragment, target);
				}
				break;
			default:
				console.warn(`Unknown insertion method: ${method}`, element);
		}
	};
};
