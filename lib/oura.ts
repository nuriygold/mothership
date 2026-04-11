import { readTokens, writeTokens } from './oura-tokens';

const CLIENT_ID = process.env.OURA_CLIENT_ID!;
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET!;
const TOKEN_URL = 'https://api.ouraring.com/oauth/token';

async function getValidAccessToken(): Promise<string | null> {
  const tokens = await readTokens();
  if (!tokens) return null;

  // Refresh if expiring within 5 minutes
  if (Date.now() > tokens.expires_at - 5 * 60 * 1000) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    await writeTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? tokens.refresh_token,
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    });
    return data.access_token;
  }

  return tokens.access_token;
}

export type StressSummary = 'restored' | 'normal' | 'stressful';

export type OuraTodayData = {
  connected: true;
  steps: number;         // 0–10 (thousands), matching WellnessState
  workout: boolean;
  stressSummary: StressSummary | null;
  stressHighMinutes: number;
} | { connected: false };

export async function getOuraTodayData(date?: string): Promise<OuraTodayData> {
  const token = await getValidAccessToken();
  if (!token) return { connected: false };

  // Use Eastern time so the date matches the client-side date
  const today = date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  const [activityRes, workoutRes, stressRes] = await Promise.all([
    fetch(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${today}&end_date=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`https://api.ouraring.com/v2/usercollection/workout?start_date=${today}&end_date=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`https://api.ouraring.com/v2/usercollection/daily_stress?start_date=${today}&end_date=${today}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  const [activity, workouts, stress] = await Promise.all([
    activityRes.json() as Promise<{ data?: Array<{ steps: number }> }>,
    workoutRes.json() as Promise<{ data?: unknown[] }>,
    stressRes.json() as Promise<{ data?: Array<{ stress_high: number; day_summary: string }> }>,
  ]);

  const todayActivity = activity.data?.[0];
  const steps = todayActivity ? Math.min(10, Math.round(todayActivity.steps / 1000)) : 0;
  const workout = (workouts.data?.length ?? 0) > 0;

  const stressData = stress.data?.[0];
  const stressSummary = (stressData?.day_summary as StressSummary) ?? null;
  const stressHighMinutes = stressData?.stress_high ?? 0;

  return { connected: true, steps, workout, stressSummary, stressHighMinutes };
}
