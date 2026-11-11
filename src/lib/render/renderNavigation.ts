const RENDER_TYPE_PATHS: Record<string, string> = {
  infissi: "/azienda/render/infissi",
  bagno: "/azienda/render/bagno",
  stanza: "/azienda/render/stanza",
  pavimento: "/azienda/render/pavimento",
  facciata: "/azienda/render/facciata",
  persiane: "/azienda/render/persiane",
  tetto: "/azienda/render/tetto",
  pergole: "/azienda/render/pergole",
  piscine: "/azienda/render/piscine",
  ristrutturazioni: "/azienda/render/ristrutturazioni",
  "pavimenti-esterni": "/azienda/render/pavimenti-esterni",
  giardini: "/azienda/render/giardini",
  "porte-blindate": "/azienda/render/porte-blindate",
  "porte-interne": "/azienda/render/porte-interne",
};

export function getRenderTypeBasePath(renderType: string | null | undefined) {
  if (!renderType) return "/azienda/render";
  return RENDER_TYPE_PATHS[renderType] ?? `/azienda/render/${renderType}`;
}

export function getRenderDetailPath(renderType: string | null | undefined, id: string) {
  return `${getRenderTypeBasePath(renderType)}/gallery/${id}`;
}

export function renderArchiveReturn(value: string | null | undefined, fallback = "/azienda/render") {
  if (!value?.startsWith("/azienda/render")) return fallback;
  try {
    const url = new URL(value, "https://app.invalid");
    const allowed = ["/azienda/render", ...Object.values(RENDER_TYPE_PATHS).flatMap((path) => [path, `${path}/gallery`])];
    return url.origin === "https://app.invalid" && allowed.includes(url.pathname) ? `${url.pathname}${url.search}` : fallback;
  } catch { return fallback; }
}

export function isRenderDetailPath(path: string) {
  return Object.values(RENDER_TYPE_PATHS).some((base) => new RegExp(`^${base}/gallery/[0-9a-fA-F-]{36}$`).test(path));
}

export function renderDetailWithReturn(module: string, id: string, returnTo: string) {
  return `${getRenderDetailPath(module, id)}?torna=${encodeURIComponent(renderArchiveReturn(returnTo))}`;
}

export function saveRenderScroll(company: string, path: string) {
  try { sessionStorage.setItem(`render-scroll:v1:${company}`, JSON.stringify({ path, top: window.scrollY })); } catch { /* Navigazione disponibile anche senza storage del browser. */ }
}

export function restoreRenderScroll(company: string, path: string) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(`render-scroll:v1:${company}`) ?? "null");
    if (stored?.path !== path || typeof stored.top !== "number" || !Number.isFinite(stored.top) || stored.top < 0) return;
    window.scrollTo({ top: Math.min(stored.top, 10_000_000), behavior: "instant" });
  } catch { /* Nessuna posizione da ripristinare. */ }
}
