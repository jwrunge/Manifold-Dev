const _objStr = "object",
	_constructor = "constructor";

// Optimized equality for common UI use cases
// Note: Map/Set contents are not deeply compared - this is intentional
// for granular reactivity (UI updates happen via property access, not container equality)
const _isEqual = (a: any, b: any): boolean => {
	if (a === b) return true;
	if (!(a && b && typeof a == _objStr && typeof b == _objStr)) return false;

	const cA = a[_constructor];
	const cB = b[_constructor];
	if (cA !== cB) return false;

	const ret =
		cA === Array
			? a.length === b.length &&
			  (() => {
					for (let i = 0; i < a.length; i++)
						if (!_isEqual(a[i], b[i])) return false;
					return true;
			  })()
			: cA === Date
			? a.getTime() === b.getTime()
			: null;

	if (ret !== null) return ret;

	const kA = Object.keys(a);
	if (kA.length !== Object.keys(b).length) return false;

	for (const k of kA) if (!(k in b) || !_isEqual(a[k], b[k])) return false;
	return true;
};

export default _isEqual;
