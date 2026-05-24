export type QuoteTemplatesTopTab = "documenti" | "moduli-vendita";

const SALES_MODULE_SLUGS = new Set(["serramenti", "fotovoltaico"]);

export function isSalesModuleSlug(value: string | null | undefined): value is string {
  return typeof value === "string" && SALES_MODULE_SLUGS.has(value);
}

export function resolveQuoteTemplatesTopTab(
  tab: string | null | undefined,
  modulo: string | null | undefined,
): QuoteTemplatesTopTab {
  if (isSalesModuleSlug(modulo)) return "moduli-vendita";
  return tab === "moduli-vendita" ? "moduli-vendita" : "documenti";
}

export function normalizeQuoteTemplatesParams(params: URLSearchParams): URLSearchParams | null {
  const next = new URLSearchParams(params);
  let changed = false;
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

  if (tab === "documenti") {
    next.delete("modulo");
    next.delete("section");
  } else if (!isSalesModuleSlug(next.get("modulo"))) {
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

  if (isSalesModuleSlug(modulo)) {
    next.set("modulo", modulo);
  } else {
    next.delete("modulo");
    next.delete("section");
  }

  return next;
}
