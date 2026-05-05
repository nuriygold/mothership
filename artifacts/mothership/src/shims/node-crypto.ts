// Minimal browser shim for node:crypto used in client code
export function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
export function randomBytes(size: number): Uint8Array {
  const arr = new Uint8Array(size);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  }
  return arr;
}
export function createHash(_alg: string) {
  return {
    update() { return this; },
    digest() { return ''; },
  };
}
export default { randomUUID, randomBytes, createHash };
