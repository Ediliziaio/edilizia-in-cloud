// Server image loader: bounded, trusted asset origins and explicit failures.
// Browser-only transforms (WEBP conversion, resizing, grayscale) need a render
// worker; never silently drop an image here.
import resolveImage from "@react-pdf/image";
const MAX_BYTES = 6 * 1024 * 1024;
async function checked(data: string): Promise<string> {
  const image = await resolveImage({ uri: data as `data:image${string}` }, { cache: false });
  if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height) ||
      image.width < 1 || image.height < 1 || image.width * image.height > 12_000_000) {
    throw new Error("Immagine non decodificabile o risoluzione eccessiva per il server.");
  }
  return data;
}
function env(key: string): string | undefined {
  return (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno?.env?.get?.(key);
}
export async function toDataUrl(url: string | null | undefined, _options?: unknown): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) {
    if (!/^data:image\/(png|jpeg);base64,[a-z0-9+/=\s]+$/i.test(url) || url.length > MAX_BYTES * 1.4) {
      throw new Error("Immagine incorporata non supportata o troppo grande.");
    }
    return checked(url);
  }
  const app = env("APP_URL") ?? "https://app.ediliziaincloud.com";
  const parsed = new URL(url, app);
  const allowed = [app, env("SUPABASE_URL")].filter(Boolean).map(origin => new URL(origin!).origin);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !allowed.includes(parsed.origin)) {
    throw new Error("Origine immagine non autorizzata per il render server.");
  }
  const resp = await fetch(parsed.href, { redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!resp.ok || !resp.body) throw new Error("Immagine del modello non disponibile.");
  if (Number(resp.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("Immagine troppo grande.");
  const reader = resp.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new Error("Immagine troppo grande.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const buf = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.length; }
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  if (!isPng && !isJpg) throw new Error("Formato immagine non supportato dal server: converti in JPG/PNG nell’app.");
  let bin = ""; const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  return checked(`data:image/${isPng ? "png" : "jpeg"};base64,${btoa(bin)}`);
}
export function haTrasparenza(): boolean { return false; }
