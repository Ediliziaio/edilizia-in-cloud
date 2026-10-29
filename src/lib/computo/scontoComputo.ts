/**
 * Lo sconto del preventivo con computo (29/10/2026, passo «Economia»): in
 * percentuale o in euro, sul totale dei lavori, prima dell'IVA. Le voci e il
 * computo restano ai loro prezzi: lo sconto è una riga del riepilogo, come la
 * scrive un'impresa («Sconto commerciale −5%»), e l'IVA si calcola sul netto.
 */
import { arrotondaDecimale } from "./editorNativo";

export type ScontoComputo = { tipo: "nessuno" | "percentuale" | "importo"; valore: string; descrizione: string };

const numero = (s: string) => {
  const t = s.trim().replace(/\s/g, "");
  if (!/^\d+(?:[.,]\d+)?$/.test(t)) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Lo sconto in euro su quel totale, o l'errore da mostrare. Un totale negativo o nullo non si sconta.
 * Gli oneri della sicurezza (`sicurezza`, le voci segnate «Oneri sicurezza») NON sono soggetti a ribasso
 * (D.lgs. 81/2008, all. XV): lo sconto si calcola sul resto. Prima del 29/10/2026 si scontavano anche loro.
 */
export function calcolaSconto(totaleLavori: number, s: ScontoComputo | undefined, sicurezza = 0): { importo: number; percentuale: number | null; errore: string; etichetta: string } {
  const totale = Math.max(0, totaleLavori - Math.max(0, sicurezza));
  const etichetta = s?.descrizione.trim() || "Sconto";
  if (!s || s.tipo === "nessuno" || !s.valore.trim()) return { importo: 0, percentuale: null, errore: "", etichetta };
  const n = numero(s.valore);
  if (n == null) return { importo: 0, percentuale: null, errore: "Scrivi lo sconto come numero, per esempio 5 o 1.250,00.", etichetta };
  if (s.tipo === "percentuale") {
    if (n > 100) return { importo: 0, percentuale: null, errore: "Lo sconto in percentuale va da 0 a 100.", etichetta };
    return { importo: totale > 0 ? arrotondaDecimale(totale * n / 100) : 0, percentuale: n, errore: "", etichetta };
  }
  if (totale > 0 && n > totale) return { importo: 0, percentuale: null, errore: "Lo sconto supera il totale dei lavori soggetti a ribasso.", etichetta };
  return { importo: arrotondaDecimale(n), percentuale: totale > 0 ? arrotondaDecimale(n / totale * 100, 2) : null, errore: "", etichetta };
}

/** Gli oneri della sicurezza di un elenco di voci già calcolate: si sommano le voci segnate come sicurezza. */
export const oneriSicurezza = (voci: { sicurezza?: boolean; is_sicurezza?: boolean; importo?: number | null; importo_computo?: number | null }[]) =>
  voci.reduce((t, v) => t + ((v.sicurezza ?? v.is_sicurezza) ? (v.importo ?? v.importo_computo ?? 0) : 0), 0);
