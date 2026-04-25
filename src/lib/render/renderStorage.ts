import { supabase } from "@/integrations/supabase/client";

const FALLBACK_ORIGINALS_BUCKET = "render-originals";

function isMissingBucketError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("bucket not found") ||
    lower.includes("bucket_not_found") ||
    lower.includes("the resource was not found") ||
    lower.includes("storage bucket")
  );
}

function isRecoverableStoragePolicyError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("row-level security") ||
    lower.includes("violates row-level security") ||
    lower.includes("permission denied") ||
    lower.includes("not authorized")
  );
}

export async function uploadRenderOriginal(args: {
  bucket: string;
  path: string;
  file: File;
}): Promise<{ storagePath: string; bucket: string; usedFallback: boolean }> {
  const { bucket, path, file } = args;
  const uploadOptions = { contentType: file.type, upsert: true };
  const primary = await supabase.storage.from(bucket).upload(path, file, uploadOptions);

  if (!primary.error) {
    return { storagePath: path, bucket, usedFallback: false };
  }

  const canTryFallback =
    bucket !== FALLBACK_ORIGINALS_BUCKET &&
    (isMissingBucketError(primary.error.message) || isRecoverableStoragePolicyError(primary.error.message));

  if (!canTryFallback) {
    throw new Error(`Upload foto fallito: ${primary.error.message}`);
  }

  const fallbackPath = path;
  const fallback = await supabase.storage
    .from(FALLBACK_ORIGINALS_BUCKET)
    .upload(fallbackPath, file, uploadOptions);

  if (fallback.error) {
    throw new Error(`Upload foto fallito: ${fallback.error.message}`);
  }

  return {
    storagePath: fallbackPath,
    bucket: FALLBACK_ORIGINALS_BUCKET,
    usedFallback: true,
  };
}

export async function createRenderOriginalSignedUrl(
  bucket: string,
  path: string | null | undefined,
  expiresIn = 600,
): Promise<string> {
  if (!path) return "";

  const primary = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (primary.data?.signedUrl && !primary.error) return primary.data.signedUrl;

  const fallbackPaths = path.startsWith(`${bucket}/`) ? [path] : [`${bucket}/${path}`, path];
  for (const fallbackPath of fallbackPaths) {
    const fallback = await supabase.storage
      .from(FALLBACK_ORIGINALS_BUCKET)
      .createSignedUrl(fallbackPath, expiresIn);
    if (fallback.data?.signedUrl && !fallback.error) return fallback.data.signedUrl;
  }

  const errorMessage = primary.error?.message ?? "URL immagine mancante";
  throw new Error(`Signed URL non disponibile: ${errorMessage}`);
}
