import { numeroEditor, arrotondaDecimale } from "./editorNativo";
import type { VoceComputo } from "./alberoComputo";

export interface BozzaRevisioneVoce {
  descrizione: string; codice: string; capitolo: string; unita: string; quantita: string; prezzo: string; nota: string;
}
export const bozzaRevisioneVoce = (v?: VoceComputo): BozzaRevisioneVoce => ({
  descrizione: v?.descrizione_breve ?? "", codice: v?.codice_tariffa ?? v?.codice_voce ?? "",
  capitolo: v?.categoria ?? "", unita: v?.unita_misura ?? "",
  quantita: v?.quantita == null ? "" : String(v.quantita),
  prezzo: v?.prezzo_unitario_computo == null ? "" : String(v.prezzo_unitario_computo), nota: "",
});
export function modificaDaBozza(b: BozzaRevisioneVoce, prima?: VoceComputo) {
  if (!b.descrizione.trim()) throw new Error("Scrivi la descrizione della voce.");
  if (!b.unita.trim()) throw new Error("Indica l'unità di misura.");
  const q = numeroEditor(b.quantita), p = b.prezzo.trim() ? numeroEditor(b.prezzo) : null;
  if (q == null || q < 0) throw new Error("La quantità deve essere un numero maggiore o uguale a zero, senza separatori delle migliaia.");
  if (b.prezzo.trim() && (p == null || p < 0)) throw new Error("Il prezzo deve essere un numero positivo o zero; lascialo vuoto se manca.");
  const nota = [
    "Revisione manuale.",
    prima ? "Lettura precedente: " + prima.descrizione_breve.slice(0, 200) + "; codice " + (prima.codice_tariffa ?? prima.codice_voce ?? "assente") + "; quantità " + (prima.quantita ?? "assente") + " " + (prima.unita_misura ?? "") + "; prezzo " + (prima.prezzo_unitario_computo ?? "assente") + "." : "Voce aggiunta a mano.",
    prima?.misure.length ? "Le righe di misura del documento restano conservate; la quantità è stata revisionata a mano." : "",
    b.nota.trim(),
  ].filter(Boolean).join(" ");
  const codice = b.codice.trim() || null;
  const cambiaCodice = !prima || codice !== (prima.codice_tariffa ?? prima.codice_voce ?? null);
  return {
    descrizione_breve: b.descrizione.trim(), codice_tariffa: codice,
    ...(cambiaCodice ? { codice_voce: codice, codice_prezzario: null } : {}),
    categoria: b.capitolo.trim() || null, unita_misura: b.unita.trim(), quantita: q,
    prezzo_unitario_computo: p, importo_computo: p == null ? null : arrotondaDecimale(q * p, 2),
    is_modified: true, warnings: [...(prima?.warnings ?? []), nota],
  };
}
