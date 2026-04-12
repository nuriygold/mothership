import { createClient } from '@supabase/supabase-js';

const FLUX_ENDPOINT = process.env.FLUX_ENDPOINT!;
const FLUX_KEY = process.env.FLUX_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'vision-images';

function buildPrompt(title: string, description: string | null): string {
  const detail = description ? ` ${description}.` : '';
  return (
    `Aspirational vision board photograph representing: ${title}.${detail} ` +
    `Cinematic, photorealistic, warm golden hour light, magazine-quality lifestyle photography. ` +
    `No text, no words, no logos, no watermarks, no people's faces.`
  );
}

async function ensureBucket(supabase: ReturnType<typeof createClient>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }
}

export async function generateVisionImage(
  itemId: string,
  title: string,
  description: string | null
): Promise<string> {
  // 1. Call Flux 2 Pro
  const fluxRes = await fetch(FLUX_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FLUX_KEY}`,
    },
    body: JSON.stringify({
      prompt: buildPrompt(title, description),
      width: 1024,
      height: 1024,
      n: 1,
      model: 'FLUX.2-pro',
    }),
  });

  if (!fluxRes.ok) {
    const errText = await fluxRes.text();
    throw new Error(`Flux generation failed (${fluxRes.status}): ${errText}`);
  }

  const fluxJson = await fluxRes.json();
  const b64 = fluxJson?.data?.[0]?.b64_json as string | undefined;
  if (!b64) throw new Error('No image data in Flux response');

  // 2. Upload to Supabase Storage
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  await ensureBucket(supabase);

  const buffer = Buffer.from(b64, 'base64');
  const fileName = `${itemId}-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, { contentType: 'image/png', upsert: true });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  // 3. Return permanent public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  return urlData.publicUrl;
}
