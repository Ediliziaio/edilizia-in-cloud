export const CAMPI_TESTO_VIAGGIO = [
  ["carico", "Carico"],
  ["scarico", "Scarico"],
  ["mezzo", "Mezzo o targa"],
  ["ddt", "Riferimento DDT"],
] as const;
export const CAMPI_NUMERICI_VIAGGIO = [
  ["km", "Km percorsi"],
  ["oreUomo", "Ore uomo"],
  ["oreMezzo", "Ore mezzo"],
] as const;

type CampoTesto = (typeof CAMPI_TESTO_VIAGGIO)[number][0];
type CampoNumerico = (typeof CAMPI_NUMERICI_VIAGGIO)[number][0];
export type DettagliViaggio = Partial<Record<CampoTesto, string> & Record<CampoNumerico, number>>;
export type BozzaViaggio = Partial<Record<CampoTesto | CampoNumerico, string>>;

export function unitaChilometro(unita?: string | null): boolean {
  return /^(km\.?|chilometr[oi]|kilometr[oi])$/i.test(unita?.trim() ?? "");
}

export function unitaViaggio(unita?: string | null): boolean {
  return /^(viaggi[oi]|cad\.?|pz\.?)$/i.test(unita?.trim() ?? "");
}

export function voceTrasporto(descrizione: string, unita?: string | null): boolean {
  return /^viaggi[oi]$/i.test(unita?.trim() ?? "") || /^(trasport[oi]|viaggi[oi])\b/i.test(descrizione.trim());
}

function numeroViaggio(v: string | undefined): number | undefined {
  if (!v?.trim()) return undefined;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function misureViaggioValide(v: BozzaViaggio): boolean {
  return CAMPI_NUMERICI_VIAGGIO.every(([k]) => !v[k]?.trim() || numeroViaggio(v[k]) != null);
}

export function dettagliViaggio(v: BozzaViaggio, unita: string, quantita: string): DettagliViaggio {
  return {
    carico: v.carico?.trim() || undefined,
    scarico: v.scarico?.trim() || undefined,
    mezzo: v.mezzo?.trim() || undefined,
    ddt: v.ddt?.trim() || undefined,
    km: numeroViaggio(unitaChilometro(unita) ? quantita : v.km),
    oreUomo: numeroViaggio(v.oreUomo),
    oreMezzo: numeroViaggio(v.oreMezzo),
  };
}

export function leggiDettagliViaggio(dati: unknown): DettagliViaggio {
  if (dati == null || typeof dati !== "object" || Array.isArray(dati)) return {};
  const riga = dati as Record<string, unknown>;
  const dettagli: DettagliViaggio = {};
  for (const [chiave] of CAMPI_TESTO_VIAGGIO) {
    const valore = riga[chiave];
    if (typeof valore === "string" && valore.trim()) dettagli[chiave] = valore.trim();
  }
  for (const [chiave] of CAMPI_NUMERICI_VIAGGIO) {
    const valore = riga[chiave];
    if (typeof valore === "number" && Number.isFinite(valore) && valore >= 0) dettagli[chiave] = valore;
  }
  return dettagli;
}
