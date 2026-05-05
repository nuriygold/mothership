// Generic no-op module used to shim server-only packages (drizzle-orm, postgres, etc.)
// Returns a Proxy so any property access / function call is a no-op.
const handler: ProxyHandler<any> = {
  get(_target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'then') return undefined;
    if (prop === Symbol.toPrimitive) return () => '';
    return makeProxy();
  },
  apply() {
    return makeProxy();
  },
  construct() {
    return makeProxy();
  },
};
function makeProxy(): any {
  const fn: any = function () {};
  return new Proxy(fn, handler);
}
const root = makeProxy();
export default root;
export const drizzle = root;
export const sql = root;
export const eq = root;
export const and = root;
export const or = root;
export const desc = root;
export const asc = root;
export const inArray = root;
export const not = root;
export const isNull = root;
export const isNotNull = root;
export const gt = root;
export const lt = root;
export const gte = root;
export const lte = root;
export const ne = root;
export const like = root;
export const ilike = root;
export const between = root;
export const exists = root;
export const count = root;
export const sum = root;
export const avg = root;
export const min = root;
export const max = root;
export const relations = root;
export const pgTable = root;
export const text = root;
export const integer = root;
export const bigint = root;
export const boolean = root;
export const jsonb = root;
export const json = root;
export const timestamp = root;
export const date = root;
export const uuid = root;
export const serial = root;
export const varchar = root;
export const numeric = root;
export const decimal = root;
export const real = root;
export const doublePrecision = root;
export const uniqueIndex = root;
export const index = root;
export const pgEnum = root;
export const primaryKey = root;
export const foreignKey = root;
export const customType = root;
