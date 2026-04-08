import { NextRequest, NextResponse } from 'next/server';
import { writeTokens } from '@/lib/oura-tokens';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return new NextResponse('Missing authorization code', { status: 400 });

  const res = await fetch('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://localhost:3000/api/oura/callback',
      client_id: process.env.OURA_CLIENT_ID!,
      client_secret: process.env.OURA_CLIENT_SECRET!,
    }),
  });

  const data = await res.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!data.access_token) {
    return new NextResponse(`Token exchange failed: ${data.error ?? 'unknown error'}`, { status: 500 });
  }

  writeTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token!,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  });

  return new NextResponse(
    `<html><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>✅ Oura connected to Mothership</h2>
      <p>Your ring data will now auto-fill Steps and Move in your Daily Anchors.</p>
      <p>You can close this tab.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
