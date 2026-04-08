import { NextResponse } from 'next/server';

export function GET() {
  const params = new URLSearchParams({
    client_id: process.env.OURA_CLIENT_ID!,
    redirect_uri: 'http://localhost:3000/api/oura/callback',
    response_type: 'code',
    scope: 'email personal daily heartrate tag workout session spo2 ring_configuration stress heart_health',
  });
  return NextResponse.redirect(`https://cloud.ouraring.com/oauth/authorize?${params}`);
}
