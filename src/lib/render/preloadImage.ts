/**
 * Pre-load an image URL with retry, to absorb CDN propagation lag right
 * after Supabase Storage upload. Resolves true on success, false after
 * `maxAttempts` failures.
 *
 * Use this BEFORE transitioning a wizard step to a "result" view that
 * renders <img src={url}> — otherwise the first render can hit a 404 and
 * the browser caches it, leaving an empty image until manual reload.
 */
export async function preloadImage(url: string, maxAttempts = 4): Promise<boolean> {
  if (!url) return false;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const ok = await new Promise<boolean>((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = attempt === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}`;
    });
    if (ok) return true;
    await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
  }
  return false;
}
