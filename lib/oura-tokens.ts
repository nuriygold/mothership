import { getSupabase } from './supabase';

export type OuraTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms since epoch
};

export async function readTokens(): Promise<OuraTokens | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('oura_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('id', true)
    .maybeSingle();
  if (error || !data) return null;
  return data as OuraTokens;
}

export async function writeTokens(tokens: OuraTokens): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from('oura_tokens')
    .upsert({ id: true, ...tokens }, { onConflict: 'id' });
}
