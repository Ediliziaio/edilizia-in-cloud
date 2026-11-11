/** Le password applicative Apple non devono mai raggiungere un URL arbitrario
 * letto da impostazioni, mappe o redirect. Anche ogni destinazione intermedia
 * viene validata prima di inoltrare l'header Authorization. */
export function appleCalDavUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443"
    || !(host === "icloud.com" || host.endsWith(".icloud.com"))) {
    throw new Error("Indirizzo Apple Calendar non valido");
  }
  return url;
}

export async function appleCalDavFetch(url: string, init: RequestInit, fetcher: typeof fetch = fetch): Promise<Response> {
  let target = appleCalDavUrl(url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(target.href, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("Location");
    await response.body?.cancel();
    if (!location || redirects === 3 || response.status === 303 && !["GET", "HEAD"].includes(init.method || "GET")) {
      throw new Error("Reindirizzamento Apple Calendar non valido");
    }
    target = appleCalDavUrl(new URL(location, target).href);
  }
  throw new Error("Troppi reindirizzamenti Apple Calendar");
}
