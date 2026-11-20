import type { ContestoAcquisti } from "./pianoAcquisti";
import type { MaterialeCollegato } from "./collegaArticoli";
import { verificaDelMateriale } from "./verificaAcquisto";

/** Stessa ricostruzione delle righe per la pagina e per il controllo del fabbisogno salvato. */
export function materialiEsistentiPerPiano(esistenti: ContestoAcquisti["esistenti"]): MaterialeCollegato[] {
  return esistenti.filter(r => r.chiave_materiale && r.origini?.length).map((r): MaterialeCollegato => {
      const coda = r.specifiche ? ` · ${r.specifiche}` : "";
      const descrizione = coda && r.name?.endsWith(coda) ? r.name.slice(0, -coda.length) : r.name ?? r.riferimento ?? "Materiale";
      const fonte = r.origini?.find(o => o.tipo === "contratto");
      const computo = r.origini?.find(o => o.tipo === "computo");
      const noteOrigine = r.origini?.flatMap(o => o.tipo === "computo" ? o.note ?? [] : []) ?? [];
      const ai = computo?.tipo === "computo" && computo.fonte === "proposta_ai";
      const verifica = verificaDelMateriale({ name: descrizione, origini: r.origini });
      return { chiave: r.chiave_materiale!, descrizione, specifiche: r.specifiche ?? null,
        unita_misura: fonte?.tipo === "contratto" ? fonte.unita_materiale ?? r.unita_misura ?? "" : r.unita_misura ?? "", quantita_calcolata: r.quantita_calcolata ?? Number(r.quantity), quantita_netta: r.quantita_calcolata ?? Number(r.quantity),
        phase_id: r.phase_id ?? null, supplier_id: r.supplier_id ?? null, article_template_id: r.article_template_id ?? null,
        origine: "computo", origini: r.origini ?? [], sfrido: null, computo_voce_id: null, scomposizione_id: null,
        planimetria_documento_id: null, planimetria_documento: null, locale: null, categoria: null,
        fonte: computo?.tipo === "computo" ? computo.fonte : "fornitura", affidabilita: 1, proposta_ai: ai, verifica_acquisto: verifica,
        dati_documentali: computo?.tipo === "computo" ? computo.dati_documentali : fonte?.dati_documentali, note: [
          ...noteOrigine,
          ...(r.description && /da (?:confermare|controllare|verificare|definire)|ipotesi|dati mancanti|resa (?:della|e unità|media)/i.test(r.description) ? [r.description] : []),
          ...(r.origini?.some(o => o.tipo === "computo" && o.fonte === "libreria_standard") ? ["Resa della libreria standard: conferma il prodotto e le sue specifiche prima dell'acquisto."] : []),
        ],
        collegamento: r.article_template_id ? { tipo: "articolo", id: r.article_template_id, nome: r.name ?? descrizione,
          fonte: "scelto", prezzo: null, unita: r.unita_misura ?? null, supplier_id: r.supplier_id ?? null } : null,
        conversione: null, candidati: [], magazzino: null };
    });
}
