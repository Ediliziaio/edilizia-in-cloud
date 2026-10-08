/** Sign saved project photos only; never make a service client a URL-signing oracle. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// deno-lint-ignore no-explicit-any -- narrow storage adapter; every path checked before its use
export async function signBathroomProjectMedia(db: any, companyId: string, projectId: string, media: Record<string, unknown>[], base: string) {
  const signed: Record<string, unknown>[] = [];
  for (let start = 0; start < media.length; start += 4) {
    signed.push(...await Promise.all(media.slice(start, start + 4).map(async row => {
      if (row.company_id !== companyId || row.progetto_id !== projectId || typeof row.url !== "string" || !row.url) {
        throw new Error("Foto del progetto non verificabile.");
      }
      if (row.tipo === "allegato" || /\.pdf($|\?)/i.test(row.url)) {
        throw new Error("Allegati documentali da verificare nell’app: non vengono omessi dal PDF senza avviso.");
      }
      if (/^https:\/\//i.test(row.url)) {
        // Stored expiring/private links cannot bypass the path/tenant guard.
        const remote = new URL(row.url);
        if (remote.origin === new URL(base).origin && /\/storage\/v1\/(?:object|render)\//.test(remote.pathname)) {
          throw new Error("Foto storage da collegare con riferimento privato verificato nell’app.");
        }
        return { ...row }; // The renderer still enforces trusted public origins and bounded image bytes.
      }
      if (/^data:image\/(png|jpeg);base64,/i.test(row.url)) return { ...row };
      const prefix = `progetti-media/${companyId}/bagni/${projectId}/`;
      const filename = row.url.slice(prefix.length);
      if (!row.url.startsWith(prefix) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png)$/i.test(filename)) {
        throw new Error("Foto private fuori dal progetto o formato non supportato: verifica nell’app.");
      }
      const path = row.url.slice("progetti-media/".length);
      const { data, error } = await db.storage.from("progetti-media").createSignedUrl(path, 300);
      if (error || !data?.signedUrl) throw new Error("Firma della foto privata non confermata.");
      const link = new URL(data.signedUrl);
      if (link.origin !== new URL(base).origin || link.protocol !== "https:" || link.username || link.password ||
          link.hash || !link.searchParams.get("token") ||
          decodeURIComponent(link.pathname) !== `/storage/v1/object/sign/progetti-media/${path}`) {
        throw new Error("Link della foto privata non verificabile.");
      }
      return { ...row, url: link.href };
    })));
  }
  return signed;
}
