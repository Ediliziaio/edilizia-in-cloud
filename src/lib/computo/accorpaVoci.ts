/**
 * Il computo che nasce dalla pianta ha una voce per ogni parete, ogni stanza, ogni apertura:
 * «Nuovo tramezzo · 2,045 m», «Nuovo tramezzo · 0,907 m»… e un SOMMANO a testa. Callimaco: 457
 * voci, 98 pagine (25/11/2026). Un computo metrico si legge per lavorazione: una voce per
 * lavorazione e per piano, con una riga di misura per ogni parete e un solo SOMMANO.
 *
 * Si accorpa solo nel documento: la bozza resta voce per voce, perché editor, revisioni e confronto
 * con la pianta lavorano per voce. Si accorpano le voci dello stesso capitolo con la stessa
 * lavorazione (prima riga della descrizione), lo stesso piano, la stessa unità, lo stesso prezzo e
 * la stessa tariffa; le altre restano com'erano.
 */
import type { MisuraComputo, VoceComputo } from "./alberoComputo";

/** «Nuovo tramezzo\nPiano primo · 2,045 m × 3,19 m» → lavorazione, piano, misura. */
export function partiDescrizione(descrizione: string): { lavorazione: string; piano: string | null; misura: string | null } {
  // Il segno meno tipografico (U+2212) non c'è nei caratteri del PDF: jsPDF spaziava tutta la riga.
  const [prima, ...resto] = descrizione.replace(/\u2212/g, "-").split("\n");
  const seconda = resto.join(" ").trim();
  const m = /^([^·]+?)\s·\s(.+)$/.exec(seconda);
  return { lavorazione: prima.trim(), piano: m ? m[1].trim() : seconda || null, misura: m ? m[2].trim() : null };
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/** Una riga di misura che porta solo descrizione e quantità. */
const SENZA_DIMENSIONI: Pick<MisuraComputo, "parti_uguali" | "lunghezza" | "larghezza" | "altezza_peso" | "formula"> = {
  parti_uguali: null, lunghezza: null, larghezza: null, altezza_peso: null, formula: null,
};

export function accorpaVociPerLavorazione(voci: VoceComputo[]): VoceComputo[] {
  const gruppi = new Map<string, VoceComputo[]>();
  const ordine: string[] = [];
  for (const v of voci) {
    const { lavorazione, piano } = partiDescrizione(v.descrizione_estesa || v.descrizione_breve);
    const accorpabile = !v.is_detrazione && !v.is_sicurezza && !v.a_corpo && !v.da_quantificare && v.quantita != null && v.importo_computo != null;
    const chiave = accorpabile
      ? [v.super_categoria, v.categoria, v.sotto_categoria, lavorazione, piano, v.unita_misura, v.prezzo_unitario_computo, v.codice_tariffa, v.fonte_prezzo, v.descrizione_comune].join("\u0001")
      : `sola:${v.id}`;
    if (!gruppi.has(chiave)) { gruppi.set(chiave, []); ordine.push(chiave); }
    gruppi.get(chiave)!.push(v);
  }
  return ordine.map((chiave, indice) => {
    const gruppo = gruppi.get(chiave)!;
    const [prima] = gruppo;
    const numero = String(indice + 1);
    const { lavorazione, piano, misura } = partiDescrizione(prima.descrizione_estesa || prima.descrizione_breve);
    if (gruppo.length === 1) {
      // Anche da sola: la misura sta nella riga di misura, non ripetuta nella descrizione.
      if (!piano || !misura || prima.misure.length !== 1) return { ...prima, ordine: indice + 1, numero_ordine: numero };
      const d = `${lavorazione}\n${piano}`;
      return { ...prima, ordine: indice + 1, numero_ordine: numero, descrizione_breve: d, descrizione_estesa: d,
        misure: [{ ...prima.misure[0], descrizione: misura, ...SENZA_DIMENSIONI }] };
    }
    const descrizione = piano ? `${lavorazione}\n${piano}` : lavorazione;
    const misure: MisuraComputo[] = gruppo.map((v, k) => ({
      ordine: k + 1,
      descrizione: partiDescrizione(v.descrizione_estesa || v.descrizione_breve).misura ?? v.misure[0]?.descrizione ?? null,
      ...SENZA_DIMENSIONI,
      quantita: v.quantita,
    }));
    return {
      ...prima, ordine: indice + 1, numero_ordine: numero,
      descrizione_breve: descrizione, descrizione_estesa: descrizione, misure,
      quantita: arrotonda(gruppo.reduce((s, v) => s + (v.quantita ?? 0), 0)),
      importo_computo: arrotonda(gruppo.reduce((s, v) => s + (v.importo_computo ?? 0), 0)),
    };
  });
}

/** Il piano della voce, per i subtotali di capitolo: la seconda riga della descrizione. */
export const pianoDellaVoce = (v: Pick<VoceComputo, "descrizione_breve" | "descrizione_estesa">) =>
  partiDescrizione(v.descrizione_estesa || v.descrizione_breve).piano;
