type StorageBucket = { name: string };

type StorageFileApi = {
  upload: (path?: string, body?: unknown, options?: unknown) => Promise<{ data: null; error: null }>;
  download: (path?: string) => Promise<{ data: null; error: null }>;
  getPublicUrl: (path?: string) => { data: { publicUrl: string } };
};

type SupabaseClientStub = {
  from: (...args: unknown[]) => any;
  auth: {
    getUser: () => Promise<{ data: null; error: null }>;
    getSession: () => Promise<{ data: null; error: null }>;
    signOut: () => Promise<{ data: null; error: null }>;
    signInWithPassword: () => Promise<{ data: null; error: null }>;
  };
  storage: {
    listBuckets: () => Promise<{ data: StorageBucket[]; error: null }>;
    createBucket: (name?: string, options?: unknown) => Promise<{ data: null; error: null }>;
    from: (bucket?: string) => StorageFileApi;
  };
  rpc: () => Promise<{ data: null; error: null }>;
  channel: () => { on: () => { subscribe: () => void }; subscribe: () => void };
  removeChannel: () => void;
};

export function createClient(_url?: string, _key?: string, _opts?: any): SupabaseClientStub {
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
    from: (..._args: unknown[]) => builder,
    auth: { getUser: noop, getSession: noop, signOut: noop, signInWithPassword: noop },
    storage: {
      listBuckets: async () => ({ data: [] as StorageBucket[], error: null }),
      createBucket: async (_name?: string, _options?: unknown) => ({ data: null, error: null }),
      from: (_bucket?: string) => ({
        upload: (_path?: string, _body?: unknown, _options?: unknown) => Promise.resolve({ data: null, error: null }),
        download: (_path?: string) => Promise.resolve({ data: null, error: null }),
        getPublicUrl: (_path?: string) => ({ data: { publicUrl: '' } }),
      }),
    },
    rpc: noop,
    channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
    removeChannel: () => {},
  };
}
