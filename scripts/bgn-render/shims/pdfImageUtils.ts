// Shim server di toDataUrl (niente canvas): scarica jpg/png e li mette in base64.
// Le relative "/..." sono asset pubblici del front-end (APP_URL). webp/altro → null
// (react-pdf non li renderizza). Firma identica a quella client usata dal grafo.
const APP = "https://app.ediliziaincloud.com";
export async function toDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  const abs = /^https?:\/\//i.test(url) ? url : `${APP}${url.startsWith("/") ? url : "/" + url}`;
  try {
    const resp = await fetch(abs, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    if (!isPng && !isJpg) return null;
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH));
    return `data:image/${isPng ? "png" : "jpeg"};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}
export function haTrasparenza(): boolean { return false; }
