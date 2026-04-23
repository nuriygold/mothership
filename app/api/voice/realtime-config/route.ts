export const dynamic = 'force-dynamic';

export function GET() {
  const configured = !!(
    process.env.AZURE_OPENAI_REALTIME_ENDPOINT &&
    process.env.AZURE_OPENAI_REALTIME_KEY
  );
  return Response.json({ configured });
}
