// Stub for @supabase/supabase-js — original app used Supabase server-side; the
// browser port is read-only via the API server and doesn't need a client.
export function createClient(_url?: string, _key?: string, _opts?: any) {
  const noop = () => Promise.resolve({ data: null, error: null });
  const builder: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined;
        return (..._args: any[]) => builder;
      },
    },
  );
  return {
    from: () => builder,
    auth: { getUser: noop, getSession: noop, signOut: noop, signInWithPassword: noop },
    storage: { from: () => ({ upload: noop, download: noop, getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    rpc: noop,
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  };
}
