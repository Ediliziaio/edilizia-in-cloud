import type { QuoteChatRequest, QuoteChatResult, QuoteChatTurn } from "../../../supabase/functions/_shared/quoteConversation";
const result = (r: QuoteChatRequest, turn: QuoteChatTurn): QuoteChatResult => ({ version: 1, turnId: r.turnId, revision: r.revision, turn,
  references: [], model: "Simulazione planimetria · nessun LLM", simulated: true });
/** PL00: explicit replay, NOT OCR, NOT a fallback when the real provider fails. */
export async function simulatePlanConversation(r: QuoteChatRequest, signal: AbortSignal): Promise<QuoteChatResult> {
  signal.throwIfAborted();
  const input = r.messages.at(-1)!.text.trim().toLowerCase();
  const base: QuoteChatTurn = { version: 1, title: "Planimetria · ambito da confermare", message: "", questions: [], proposals: [], warnings: [], searches: [] };
  if (input === "analizza la planimetria di esempio") return result(r, { ...base,
    message: "SIMULAZIONE PREPARATA, non lettura automatica dell’immagine. Nel caso di prova sono indicati due WC, due camere, cucina, soggiorno, ripostiglio e terrazzi. Non ho una superficie totale verificata. La stanza senza nome resta tale. Non uso i dati del precedente trilocale da 80 m².",
    questions: ["Vuoi intervenire su tutta la casa o su un solo ambiente?", "Quale regione ed edizione del prezzario vuoi usare?", "Terrazzi e parti comuni sono inclusi?"],
    warnings: ["Quote nell’immagine, destinazioni e geometria richiedono conferma. Nessun OCR o modello vision è stato eseguito."],
  });
  if (input === "solo camera in alto a sinistra, terrazzi esclusi") return result(r, { ...base,
    title: "Camera in alto a sinistra · esempio locale",
    message: "Nel campione di prova le due quote candidate sono 4,61 × 4,25 m. Se riferite al rettangolo netto della camera, il prodotto è 19,5925 m²: 19,59 m² esposti. Il perimetro teorico è 17,72 m. Questi dati non misurano il resto della casa.",
    questions: ["Confermi il pavimento netto rettangolare 4,61 × 4,25 m?", "Quali opere vuoi: pavimento, massetto, tinteggiatura, infissi o impianti?"],
    warnings: ["Per tinteggiatura servono altezza, aperture e preparazione; per massetto serve lo spessore. Non deduco pareti o volumi dal pavimento."],
  });
  if (input === "confermo 4,61 × 4,25 m netti; rifai pavimento e tinteggiatura") return result(r, { ...base,
    title: "Camera · pavimento e tinteggiatura",
    message: "Aggiungo 3 voci da verificare. La quantità del pavimento è una conferma simulata, senza sfridi automatici. Pareti, prezzo e IVA restano da definire. Inserisci i prezzi manualmente sotto: in questa simulazione non uso né invento tariffe regionali.",
    proposals: [
      { id: "camera-rimozione", title: "Rimozione pavimento della camera", description: "Materiale, strati, trasporto e smaltimento da verificare: evitare duplicazioni con la voce di prezzario scelta.", unit: "m²", quantity: 19.59, quantityBasis: "Conferma DEMO: 4,61 × 4,25 = 19,5925 m², esposti a 2 decimali.", referenceId: null },
      { id: "camera-pavimento", title: "Fornitura e posa nuovo pavimento", description: "Scegliere materiale, formato, posa e sottofondo. Battiscopa, soglie e sfrido non ancora computati.", unit: "m²", quantity: 19.59, quantityBasis: "Stessa superficie netta confermata nel caso DEMO; nessuno sfrido assunto.", referenceId: null },
      { id: "camera-pareti", title: "Preparazione e tinteggiatura pareti", description: "Definire preparazione, finitura, altezza e aperture. Il soffitto è da computare separatamente se richiesto.", unit: "m²", quantity: null, quantityBasis: "Altezza e aperture mancanti; non uso la superficie del pavimento.", referenceId: null },
    ], questions: ["Quale materiale e formato di pavimento vuoi?", "Quali sono altezza della camera e misure delle aperture?"],
    warnings: ["Costi aziendali, rese, tempi e IVA non disponibili. Questo parziale non è un’offerta completa."],
  });
  return result(r, { ...base, message: "Questo percorso è una simulazione dichiarata, non un LLM libero. Puoi usare i suggerimenti per riprodurre il caso della planimetria oppure modificare le voci sotto. Il collegamento AI reale è predisposto, ma non è stato attivato o pubblicato.",
    questions: ["Vuoi riprodurre il caso della camera o continuare a correggere le voci manualmente?"] });
}
