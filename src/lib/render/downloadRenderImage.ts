import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";

export async function downloadRenderImage(resultUrl: string, filename: string): Promise<void> {
  if (!resultUrl) throw new Error("URL del render non disponibile.");

  // Render image puo' essere CDN signed URL — timeout 30s
  const resp = await fetchWithTimeout(resultUrl, {
    timeoutMs: 30_000,
    context: "render.download-image",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename || `render-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
