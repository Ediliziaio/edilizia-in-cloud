/**
 * Cosa può essere un movimento della banca senza fattura.
 * «spesa» crea un costo; «nessun_costo» chiude e basta: stipendi e F24 il loro
 * costo ce l'hanno già altrove, giroconti e rimborsi non sono costi.
 */
export interface VoceSenzaFattura {
  etichetta: string;
  categoria: string;
  categoriaCosto: string;
  tipo: "spesa" | "nessun_costo";
}

const spesa = (etichetta: string, categoria: string, categoriaCosto: string): VoceSenzaFattura =>
  ({ etichetta, categoria, categoriaCosto, tipo: "spesa" });
const chiude = (etichetta: string, categoria = etichetta): VoceSenzaFattura =>
  ({ etichetta, categoria, categoriaCosto: "altro", tipo: "nessun_costo" });

const USCITE: VoceSenzaFattura[] = [
  spesa("Multa o sanzione", "Multa", "altro"),
  spesa("Ricevuta o scontrino", "Ricevuta", "altro"),
  spesa("Carburante", "Carburante", "viaggi_trasferte"),
  spesa("Pedaggi e parcheggi", "Pedaggi e parcheggi", "viaggi_trasferte"),
  spesa("Commissioni bancarie", "Bancario", "struttura_servizi"),
  spesa("Assicurazione", "Assicurazioni", "assicurazioni"),
  spesa("Altra spesa", "Altra spesa", "altro"),
  chiude("Stipendi"),
  chiude("F24 e tasse", "Tasse & Tributi"),
  chiude("Rata finanziamento o leasing", "Finanziamento"),
  chiude("Giroconto"),
  chiude("Prelievo contanti", "Prelievo"),
];

const ENTRATE: VoceSenzaFattura[] = [
  chiude("Rimborso"),
  chiude("Finanziamento o prestito", "Finanziamento"),
  chiude("Versamento soci"),
  chiude("Contributo"),
  chiude("Giroconto"),
  chiude("Versamento contanti"),
  chiude("Interessi", "Bancario"),
  chiude("Altra entrata"),
];

export const vociSenzaFattura = (uscita: boolean): VoceSenzaFattura[] => (uscita ? USCITE : ENTRATE);

/** Se la categoria del movimento dice già cos'è, la voce parte scelta. */
export function voceSenzaFatturaProposta(categoria: string | null | undefined, uscita: boolean): VoceSenzaFattura | null {
  const c = (categoria ?? "").toLowerCase();
  if (!c) return null;
  const trova = (etichetta: string) => vociSenzaFattura(uscita).find((v) => v.etichetta === etichetta) ?? null;
  if (c.includes("giroconto")) return trova("Giroconto");
  if (!uscita) return null;
  if (c.includes("stipend") || c.includes("personale")) return trova("Stipendi");
  if (c.includes("tasse") || c.includes("imposte") || c.includes("tribut")) return trova("F24 e tasse");
  if (c.includes("bancar")) return trova("Commissioni bancarie");
  if (c.includes("assicuraz")) return trova("Assicurazione");
  return null;
}
