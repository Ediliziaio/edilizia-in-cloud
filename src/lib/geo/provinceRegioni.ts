/**
 * Da sigla di provincia a regione.
 *
 * Serve al confronto col prezzario regionale: `companies.region` esiste nel
 * database ma NON è modificabile da nessuna schermata dell'app, quindi per
 * quasi tutte le aziende è vuoto e resterà vuoto. La provincia invece si
 * compila (sede legale e operativa), ed è sufficiente: la corrispondenza
 * provincia → regione è fissa.
 *
 * I nomi delle regioni sono scritti come li usa la libreria prezzari.
 */

const PROVINCE_PER_REGIONE: Record<string, string[]> = {
  Abruzzo: ["AQ", "CH", "PE", "TE"],
  Basilicata: ["MT", "PZ"],
  Calabria: ["CS", "CZ", "KR", "RC", "VV"],
  Campania: ["AV", "BN", "CE", "NA", "SA"],
  "Emilia-Romagna": ["BO", "FC", "FE", "MO", "PC", "PR", "RA", "RE", "RN"],
  "Friuli-Venezia Giulia": ["GO", "PN", "TS", "UD"],
  Lazio: ["FR", "LT", "RI", "RM", "VT"],
  Liguria: ["GE", "IM", "SP", "SV"],
  Lombardia: ["BG", "BS", "CO", "CR", "LC", "LO", "MB", "MI", "MN", "PV", "SO", "VA"],
  Marche: ["AN", "AP", "FM", "MC", "PU"],
  Molise: ["CB", "IS"],
  Piemonte: ["AL", "AT", "BI", "CN", "NO", "TO", "VB", "VC"],
  Puglia: ["BA", "BR", "BT", "FG", "LE", "TA"],
  Sardegna: ["CA", "NU", "OR", "SS", "SU"],
  Sicilia: ["AG", "CL", "CT", "EN", "ME", "PA", "RG", "SR", "TP"],
  Toscana: ["AR", "FI", "GR", "LI", "LU", "MS", "PI", "PO", "PT", "SI"],
  "Trentino-Alto Adige": ["BZ", "TN"],
  Umbria: ["PG", "TR"],
  "Valle d'Aosta": ["AO"],
  Veneto: ["BL", "PD", "RO", "TV", "VE", "VI", "VR"],
};

/** Indice inverso, costruito una volta sola. */
const REGIONE_PER_SIGLA: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [regione, sigle] of Object.entries(PROVINCE_PER_REGIONE)) {
    for (const s of sigle) m[s] = regione;
  }
  return m;
})();

/** Regione di una sigla di provincia. `null` se la sigla non esiste. */
export function regioneDaProvincia(sigla: string | null | undefined): string | null {
  const s = (sigla ?? "").trim().toUpperCase();
  if (s.length !== 2) return null;
  return REGIONE_PER_SIGLA[s] ?? null;
}

/**
 * Regione dell'azienda: quella dichiarata se c'è, altrimenti dedotta dalla
 * provincia della sede operativa e in ultimo da quella legale. La sede
 * operativa viene prima perché è dove si lavora, ed è quella che conta per il
 * prezzario che si applica al cantiere.
 */
export function regioneAzienda(azienda: {
  region?: string | null;
  operational_province?: string | null;
  legal_province?: string | null;
} | null | undefined): string | null {
  if (!azienda) return null;
  const dichiarata = (azienda.region ?? "").trim();
  if (dichiarata) return dichiarata;
  return regioneDaProvincia(azienda.operational_province)
    ?? regioneDaProvincia(azienda.legal_province);
}
