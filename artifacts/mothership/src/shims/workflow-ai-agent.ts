// Stub for @workflow/ai/agent (server-only).
export function defineAgent(config: any) {
  return { ...config, run: async () => ({ ok: false, error: 'agent unavailable in browser' }) };
}
export const Agent = class {};
