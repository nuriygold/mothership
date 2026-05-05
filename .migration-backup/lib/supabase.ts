import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase env is not configured.');
  }

  client = createClient(supabaseUrl, supabaseKey);
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const resolved = getSupabase() as unknown as Record<PropertyKey, unknown>;
    const value = resolved[prop];
    return typeof value === 'function' ? value.bind(getSupabase()) : value;
  },
});
