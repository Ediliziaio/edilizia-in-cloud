/**
 * Lo scontrino letto dall'AI (24/11/2026), ripulito prima di toccare il modulo della spesa.
 * Prudente: un importo fuori misura, una data nel futuro o un tipo che non esiste non si scrivono;
 * l'operaio vede quello che c'è e corregge.
 */
// Niente import: questo file lo usa anche la funzione del server (Deno), che vuole i percorsi con l'estensione.
type TipoSpesa = "carburante" | "pedaggio" | "parcheggio" | "pasto" | "materiale" | "altro";

export interface ScontrinoLetto { importo: number | null; giorno: string | null; tipo: TipoSpesa | null; esercente: string | null }

const TIPI: readonly TipoSpesa[] = ["carburante", "pedaggio", "parcheggio", "pasto", "materiale", "altro"];

export function pulisciScontrino(grezzo: unknown, oggiIso: string): ScontrinoLetto {
  const r = (grezzo && typeof grezzo === "object" ? grezzo : {}) as Record<string, unknown>;
  const n = typeof r.importo === "number" ? r.importo : typeof r.importo === "string" ? Number(r.importo.replace(",", ".")) : NaN;
  const importo = Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n * 100) / 100 : null;
  const g = typeof r.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.data) ? r.data : null;
  // Niente date future, né più vecchie di un anno (sono quasi sempre letture sbagliate).
  const unAnnoFa = `${Number(oggiIso.slice(0, 4)) - 1}${oggiIso.slice(4)}`;
  const giorno = g && g <= oggiIso && g >= unAnnoFa ? g : null;
  const tipo = typeof r.tipo === "string" && (TIPI as readonly string[]).includes(r.tipo) ? (r.tipo as TipoSpesa) : null;
  const esercente = typeof r.esercente === "string" && r.esercente.trim() ? r.esercente.trim().slice(0, 80) : null;
  return { importo, giorno, tipo, esercente };
}
