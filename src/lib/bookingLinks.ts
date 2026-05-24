export function normalizeBookingSlug(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export function getAppOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export function buildBookingUrl(slug: string | null | undefined, origin = getAppOrigin()) {
  const cleanSlug = normalizeBookingSlug(slug);
  if (!cleanSlug || !origin) return "";
  return `${origin}/prenota/${cleanSlug}`;
}

export function buildBookingEmbedCode(url: string) {
  if (!url) return "";
  return `<iframe title="Prenotazione appuntamento" src="${url}" width="100%" height="760" style="border:0;border-radius:12px;overflow:hidden;" loading="lazy"></iframe>`;
}

export function buildBookingButtonCode(url: string, label = "Prenota appuntamento") {
  if (!url) return "";
  return `<a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:8px;background:#0f172a;color:#fff;text-decoration:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-weight:600;">${label}</a>`;
}
