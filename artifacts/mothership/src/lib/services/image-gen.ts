import { createClient } from '@supabase/supabase-js';

// Persistence authority: Supabase Storage is the durable asset store for
// generated vision images. Database rows remain the source of truth for image
// metadata and any higher-level workflow state that references these assets.

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name} for vision image generation.`);
  }
  return value;
}

function getVisionBucket(): string {
  return process.env.SUPABASE_VISION_BUCKET?.trim() || 'vision-images';
}

function storageErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error ?? 'unknown storage error');
}

function buildPrompt(title: string, description: string | null, customPrompt?: string | null): string {
  const detail = description ? ` ${description}.` : '';
  const base =
    `Aspirational vision board photograph representing: ${title}.${detail} ` +
    `Cinematic, photorealistic, warm golden hour light, magazine-quality lifestyle photography. ` +
    `No text, no words, no logos, no watermarks, no people's faces.`;
  return customPrompt ? `${base} Style/scene direction: ${customPrompt}.` : base;
}

async function ensureBucket(supabase: ReturnType<typeof createClient>, bucketName: string) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Supabase listBuckets failed for bucket ${bucketName}: ${storageErrorMessage(listError)}`);
  }

  if (!buckets?.find((bucket) => bucket.name === bucketName)) {
    // The app returns public asset URLs, so the backing bucket must stay public.
    const { error: createError } = await supabase.storage.createBucket(bucketName, { public: true });
    if (createError) {
      throw new Error(`Supabase createBucket failed for bucket ${bucketName}: ${storageErrorMessage(createError)}`);
    }
  }
}

export async function generateVisionImage(
  itemId: string,
  title: string,
  description: string | null,
  customPrompt?: string | null
): Promise<string> {
  const fluxEndpoint = requireEnv('FLUX_ENDPOINT');
  const fluxKey = requireEnv('FLUX_KEY');
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const bucketName = getVisionBucket();

  const fluxRes = await fetch(fluxEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fluxKey}`,
    },
    body: JSON.stringify({
      prompt: buildPrompt(title, description, customPrompt),
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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  await ensureBucket(supabase, bucketName);

  const buffer = Buffer.from(b64, 'base64');
  const fileName = `${itemId}-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, buffer, { contentType: 'image/png', upsert: true });

  if (uploadError) {
    throw new Error(`Storage upload failed for ${bucketName}/${fileName}: ${storageErrorMessage(uploadError)}`);
  }

  const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
  return urlData.publicUrl;
}
