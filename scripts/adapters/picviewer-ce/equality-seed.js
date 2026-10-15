// Preserve abstract equality when adapting legacy comparisons to strict lint.
function pvcePrimitive(value) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
        return value;
    }
    const exotic = value[Symbol.toPrimitive];
    if (exotic !== undefined && exotic !== null) {
        if (typeof exotic !== 'function') { throw new TypeError('Invalid primitive conversion'); }
        const result = Reflect.apply(exotic, value, ['default']);
        if (result === null || (typeof result !== 'object' && typeof result !== 'function')) { return result; }
        throw new TypeError('Primitive conversion returned an object');
    }
    for (const key of ['valueOf', 'toString']) {
        const method = value[key];
        if (typeof method === 'function') {
            const result = Reflect.apply(method, value, []);
            if (result === null || (typeof result !== 'object' && typeof result !== 'function')) { return result; }
        }
    }
    throw new TypeError('Cannot convert object to primitive');
}
function pvceEqualityType(value) {
    if (value === null) { return 'null'; }
    if (typeof value === 'undefined' && value !== undefined) { return 'object'; }
    return typeof value === 'function' ? 'object' : typeof value;
}
function pvceAbstractEqual(left, right) {
    if (left === right) { return true; }
    const a = pvceEqualityType(left);
    const b = pvceEqualityType(right);
    if (a === b) { return false; }
    if ((a === 'null' && b === 'undefined') || (a === 'undefined' && b === 'null')) { return true; }
    // The browser's historical document.all object has nullish equality.
    if ((typeof left === 'undefined' && left !== undefined && (b === 'null' || b === 'undefined')) ||
        (typeof right === 'undefined' && right !== undefined && (a === 'null' || a === 'undefined'))) { return true; }
    if (a === 'number' && b === 'string') { return pvceAbstractEqual(left, Number(right)); }
    if (a === 'string' && b === 'number') { return pvceAbstractEqual(Number(left), right); }
    if (a === 'bigint' && b === 'string') {
        try { return left === BigInt(right); } catch { return false; }
    }
    if (a === 'string' && b === 'bigint') { return pvceAbstractEqual(right, left); }
    if (a === 'boolean') { return pvceAbstractEqual(Number(left), right); }
    if (b === 'boolean') { return pvceAbstractEqual(left, Number(right)); }
    if (a === 'object' && ['string', 'number', 'bigint', 'symbol'].includes(b)) { return pvceAbstractEqual(pvcePrimitive(left), right); }
    if (b === 'object' && ['string', 'number', 'bigint', 'symbol'].includes(a)) { return pvceAbstractEqual(left, pvcePrimitive(right)); }
    if (a === 'bigint' && b === 'number') { return Number.isInteger(right) && left === BigInt(right); }
    if (a === 'number' && b === 'bigint') { return Number.isInteger(left) && BigInt(left) === right; }
    return false;
}
