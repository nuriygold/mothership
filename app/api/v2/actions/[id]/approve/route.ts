export const dynamic = 'force-dynamic';

export async function POST() {
  return Response.json({ error: { code: 'gone', message: 'Predictive action approval is no longer supported.' } }, { status: 410 });
}
