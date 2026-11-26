const ORIGINI_APP = new Set(["https://app.ediliziaincloud.com", "https://ediliziaincloud.com", "https://www.ediliziaincloud.com"]);

export function percorsoNotifica(valore: unknown, origine: string, appNativa = false): string | null {
  if (typeof valore !== "string" || !valore || valore !== valore.trim() || valore.includes("\\")) return null;
  if ([...valore].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;
  if (!valore.startsWith("/") && !/^https?:\/\//i.test(valore)) return null;
  if (valore.startsWith("//")) return null;
  try {
    const origineApp = new URL(origine);
    const link = new URL(valore, origine);
    if (link.username || link.password || link.pathname.startsWith("//")) return null;
    // URL.origin è "null" per capacitor://: confrontare schema e host mantiene i link interni su iOS.
    const interna = link.protocol === origineApp.protocol && link.host === origineApp.host;
    if (!interna && !(appNativa && ORIGINI_APP.has(link.origin))) return null;
    return link.pathname + link.search + link.hash;
  } catch {
    return null;
  }
}

export function percorsoPushNativa(data: Record<string, unknown>, origine: string, userId: string) {
  if (data.user_id !== undefined && data.user_id !== userId) return null;
  const percorso = percorsoNotifica(data.url ?? data.route, origine, true);
  if (percorso) return percorso;
  if (typeof data.id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data.id)) return null;
  switch (data.type) {
    case "order": return `/azienda/ordini/${data.id}`;
    case "invoice": return `/azienda/fatturazione/${data.id}`;
    case "intervention": return `/tecnico/interventi/${data.id}`;
    case "ticket": return `/azienda/ticket/${data.id}`;
    default: return null;
  }
}
