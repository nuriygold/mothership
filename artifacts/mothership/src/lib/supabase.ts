// Browser stub: original app used Supabase server-side. The Vite port reads
// data via the API server, so this module exposes a permissive no-op client
// that won't crash if a stray component imports it.
import { createClient } from '@/shims/supabase';

export const supabase: any = createClient();
export default supabase;
