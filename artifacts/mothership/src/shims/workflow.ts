// Stub for the Vercel Workflow SDK. The frontend doesn't actually run workflows.
export function start(_id: string, ..._args: any[]): any {
  return { id: 'stub', status: 'no-op' };
}
export function step<T>(_name: string, fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve().then(() => fn());
}
export const workflow = { start, step };
export default workflow;
