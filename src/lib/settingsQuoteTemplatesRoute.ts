export type QuoteTemplatesTopTab = "documenti" | "computo" | "moduli-vendita" | "varianti";

// Tutti i verticali che possono essere aperti nella griglia Moduli Vendita
// devono essere validi anche nel deeplink. Prima qui erano ammessi soltanto
// Serramenti e Fotovoltaico: Bagni e Ristrutturazione venivano quindi rimossi
// dall'URL appena aperti, perdendo anche la sezione corrente al refresh.
const SALES_MODULE_SLUGS = new Set([
  "serramenti",
  "fotovoltaico",
  "ristrutturazione",
  "bagni",
  "tetti",
  "climatizzazione",
  "elettrico",
  "termoidraulico",
  "pavimenti",
  "piscine",
  "cappotto",
]);

export function isSalesModuleSlug(value: string | null | undefined): value is string {
  return typeof value === "string" && SALES_MODULE_SLUGS.has(value);
}

export function resolveQuoteTemplatesTopTab(
  tab: string | null | undefined,
  modulo: string | null | undefined,
): QuoteTemplatesTopTab {
  if (tab === "varianti") return "varianti";
  if (tab === "computo") return "computo";
  if (isSalesModuleSlug(modulo)) return "moduli-vendita";
  return tab === "moduli-vendita" ? "moduli-vendita" : "documenti";
}

export function normalizeQuoteTemplatesParams(params: URLSearchParams): URLSearchParams | null {
  const next = new URLSearchParams(params);
  let changed = false;
  if (next.get("tab") === "varianti" || next.get("tab") === "computo") {
    for (const key of ["modulo", "modello", "section"]) { if (next.has(key)) { next.delete(key); changed = true; } }
    return changed ? next : null;
  }
  const modulo = next.get("modulo");

  if (modulo && !isSalesModuleSlug(modulo)) {
    next.delete("modulo");
    changed = true;
  }

  if (isSalesModuleSlug(next.get("modulo")) && next.get("tab") !== "moduli-vendita") {
    next.set("tab", "moduli-vendita");
    changed = true;
  }

  return changed ? next : null;
}

export function buildQuoteTemplatesTabParams(
  params: URLSearchParams,
  tab: QuoteTemplatesTopTab,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set("tab", tab);

  if (tab !== "moduli-vendita") {
    next.delete("modello");
    next.delete("modulo");
    next.delete("section");
  } else if (!isSalesModuleSlug(next.get("modulo"))) {
    next.delete("modello");
    next.delete("modulo");
    next.delete("section");
  }

  return next;
}

export function buildQuoteTemplatesModuleParams(
  params: URLSearchParams,
  modulo: string | null,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set("tab", "moduli-vendita");
  if (next.get("modulo") !== modulo) {
    next.delete("modello");
    next.delete("section");
  }

  if (isSalesModuleSlug(modulo)) {
    next.set("modulo", modulo);
  } else {
    next.delete("modulo");
    next.delete("section");
  }

  return next;
}
