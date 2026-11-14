/**
 * Prima le regole, poi l'AI (fase 5 del piano anomalie, 14/11/2026).
 *
 * La classificazione di una fattura ricevuta dà due cose: la categoria di spesa e la commessa. La
 * commessa si riconosce senza AI dai codici della fattura (CUP, CIG, codice commessa: funzione SQL
 * `commessa_da_codici`). L'AI si chiama solo per ciò che le regole non sanno dire, e il motivo finisce
 * nel registro dei costi AI. Modulo puro: lo usa ai-fattura-classify, lo provano i test.
 */

export interface CommessaDaRegole {
  order_id: string;
  motivo: string;
}

export interface Decisione {
  /** true = serve il modello. */
  chiamaAi: boolean;
  /** Perché serve, per il registro; null se non serve. */
  motivo: string | null;
}

export function decidiClassificazione(regola: CommessaDaRegole | null, categoriaGia: string | null | undefined): Decisione {
  const haCategoria = !!categoriaGia && categoriaGia.trim() !== "";
  if (regola && haCategoria) return { chiamaAi: false, motivo: null };
  if (regola) return { chiamaAi: true, motivo: "categoria mancante (commessa già riconosciuta da " + regola.motivo.split(" ")[0] + ")" };
  return { chiamaAi: true, motivo: haCategoria ? "commessa non riconosciuta da CUP/CIG/codice" : "categoria mancante e commessa non riconosciuta da CUP/CIG/codice" };
}

/** La commessa da salvare: quella delle regole vince su quella del modello. */
export function commessaFinale(
  regola: CommessaDaRegole | null,
  ai: { orderId: string | null; confidenza: number },
): { orderId: string | null; confidenza: number; motivo: string | null } {
  if (regola) return { orderId: regola.order_id, confidenza: 1, motivo: regola.motivo };
  return { orderId: ai.orderId, confidenza: ai.confidenza, motivo: null };
}
