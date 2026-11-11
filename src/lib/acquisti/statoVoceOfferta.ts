// ============================================================================
// Stato di una voce nell'offerta di un fornitore (confronto RDO)
// ----------------------------------------------------------------------------
// 11/11/2026 — Nel confronto ogni cella aveva una tendina «Disponibile»: sei
// voci per tre fornitori, diciotto tendine uguali. Di norma una voce quotata è
// disponibile; le eccezioni (non disponibile, parziale, alternativa) si
// impostano con un comando piccolo e si leggono come etichetta.
//
// Nel database c'è solo `disponibile` (boolean). «Parziale» e «alternativa»
// sono disponibili a tutti gli effetti (il prezzo conta, la voce va
// nell'ordine): si distinguono con un'etichetta in testa a `note` della quota,
// che nessun altro punto interpreta. Se un giorno servirà filtrarle in SQL, la
// strada è una colonna `stato` con questa stessa lista.
// ============================================================================

export type StatoVoceOfferta =
  | "da_quotare"
  | "disponibile"
  | "parziale"
  | "alternativa"
  | "non_disponibile";

export const STATI_VOCE_OFFERTA: Array<{
  valore: Exclude<StatoVoceOfferta, "da_quotare">;
  etichetta: string;
}> = [
  { valore: "disponibile", etichetta: "Disponibile" },
  { valore: "parziale", etichetta: "Disponibile in parte" },
  { valore: "alternativa", etichetta: "Propone un'alternativa" },
  { valore: "non_disponibile", etichetta: "Non disponibile" },
];

/** Etichetta corta, quella che si vede nella cella. */
export const ETICHETTA_CELLA: Record<StatoVoceOfferta, string> = {
  da_quotare: "Da quotare",
  disponibile: "Disponibile",
  parziale: "Parziale",
  alternativa: "Alternativa",
  non_disponibile: "Non disponibile",
};

const ETICHETTE_NOTA: Record<"parziale" | "alternativa", string> = {
  parziale: "[parziale]",
  alternativa: "[alternativa]",
};
const RE_ETICHETTA = /^\s*\[(parziale|alternativa)\]\s*/i;

export function statoVoceOfferta(
  q: { disponibile: boolean; note?: string | null } | null | undefined,
): StatoVoceOfferta {
  if (!q) return "da_quotare";
  if (!q.disponibile) return "non_disponibile";
  const m = RE_ETICHETTA.exec(q.note ?? "");
  return m ? (m[1].toLowerCase() as "parziale" | "alternativa") : "disponibile";
}

/** La nota senza l'etichetta di stato: è il testo del fornitore (o dell'AI). */
export function notaVoceOfferta(note: string | null | undefined): string | null {
  const resto = (note ?? "").replace(RE_ETICHETTA, "").trim();
  return resto || null;
}

/** Che cosa scrivere sulla quota per portarla allo stato scelto. */
export function aggiornamentoStatoVoce(
  stato: Exclude<StatoVoceOfferta, "da_quotare">,
  noteAttuali: string | null | undefined,
): { disponibile: boolean; note: string | null } {
  const testo = notaVoceOfferta(noteAttuali);
  if (stato === "parziale" || stato === "alternativa")
    return {
      disponibile: true,
      note: [ETICHETTE_NOTA[stato], testo].filter(Boolean).join(" "),
    };
  return { disponibile: stato === "disponibile", note: testo };
}
