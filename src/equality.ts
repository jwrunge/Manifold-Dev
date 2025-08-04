const _ab = ArrayBuffer,
	_u8 = Uint8Array,
	_rf = Reflect,
	_obj = Object,
	_objStr = "object";

const _isEqual = (a: any, b: any, c = new WeakSet()): boolean => {
	if (a === b) return true;
	if (!(a && b && typeof a == _objStr && typeof b == _objStr)) return false;
	if (c.has(a) || c.has(b)) return a === b;

	c.add(a);
	c.add(b);

	const [isA, isB] = [a, b].map((c) => c instanceof _ab || _ab.isView(c));

	if (isA || isB) {
		if (isA !== isB) return false; // If one is buffer, other must be too
		const [vA, vB] = [a, b].map((c) =>
			c instanceof _ab
				? new _u8(b)
				: new _u8(b.buffer, b.byteOffset, b.byteLength)
		) as [Uint8Array, Uint8Array];

		if (vA.length !== vB.length) return false;
		for (let i = 0; i < vA.length; i++) if (vA[i] !== vB[i]) return false;
		return true;
	}

	const cA = a.constructor;
	const cB = b.constructor;
	if (cA !== cB && !(cA === _obj && cB === _obj)) return false;

	const ret =
		cA === Array
			? a.length === b.length &&
			  (() => {
					for (let i = 0; i < a.length; i++)
						if (!_isEqual(a[i], b[i], c)) return false;
					return true;
			  })()
			: cA === Date
			? a.getTime() === b.getTime()
			: cA === Map
			? a.size === b.size &&
			  [...a.entries()].every(
					([k, vA]) => b.has(k) && _isEqual(vA, b.get(k), c)
			  )
			: cA === Set
			? a.size === b.size &&
			  [...a].every((i) => [...b].some((iB) => _isEqual(i, iB, c)))
			: cA === Function || cA === Promise
			? false
			: null;

	if (ret !== null) return ret;

	const kA = _rf.ownKeys(a);
	if (kA.length !== _rf.ownKeys(b).length) return false;

	for (const k of kA)
		if (!_rf.has(b, k) || !_isEqual(a[k], b[k], c)) return false;
	return true;
};

export default _isEqual;
