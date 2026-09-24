/**
 * L'esito della consegna di un messaggio WhatsApp inviato (24/09/2026).
 *
 * Meta avvisa (`statuses` nel webhook) quando il messaggio è partito, è
 * arrivato sul telefono, è stato letto, oppure non è stato consegnato — e in
 * quel caso dice perché, con un codice. Prima l'esito si scriveva solo sui
 * broadcast: un messaggio da Conversazioni rifiutato da Meta sembrava inviato.
 *
 * Gli avvisi possono arrivare fuori ordine (un «consegnato» dopo il «letto»):
 * lo stato non torna mai indietro.
 *
 * Nessun import: lo leggono sia Deno sia i test.
 */

/** Da quali stati si può passare al nuovo (null = nessuno stato ancora). */
export function statiSuperabili(nuovo: unknown): Array<string | null> {
  switch (nuovo) {
    case "sent":
      return [null];
    case "delivered":
      return [null, "sent"];
    case "read":
    case "failed":
      return [null, "sent", "delivered"];
    default:
      // «deleted», «warning» e ciò che Meta aggiungerà: non toccano lo stato.
      return [];
  }
}

/** Il filtro PostgREST (`.or(...)`) sugli stati superabili. */
export function filtroStatiSuperabili(stati: Array<string | null>): string {
  const parti: string[] = [];
  if (stati.includes(null)) parti.push("delivery_status.is.null");
  const valori = stati.filter((s): s is string => typeof s === "string");
  if (valori.length) parti.push(`delivery_status.in.(${valori.join(",")})`);
  return parti.join(",");
}

// I codici più frequenti (developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes).
const MOTIVI: Record<number, string> = {
  368: "account temporaneamente bloccato da Meta",
  130472: "numero escluso da Meta per una sperimentazione",
  131000: "errore di Meta, si può riprovare",
  131016: "servizio di Meta non disponibile, si può riprovare",
  131026: "il numero non è su WhatsApp o non può ricevere il messaggio",
  131031: "l'account WhatsApp Business è bloccato",
  131042: "problema di pagamento sull'account Meta",
  131045: "numero non registrato correttamente",
  131047: "sono passate più di 24 ore dall'ultimo messaggio del cliente: serve un modello",
  131048: "troppi messaggi segnalati come spam: Meta limita il numero",
  131049: "Meta limita i messaggi di marketing verso questo numero",
  131050: "il cliente ha bloccato i messaggi di marketing",
  131051: "tipo di messaggio non supportato",
  131052: "allegato non scaricabile",
  131053: "allegato non caricato",
  131056: "troppi messaggi allo stesso numero in poco tempo",
  132000: "il numero di variabili non corrisponde al modello",
  132001: "il modello non esiste o non è approvato in questa lingua",
  132005: "il testo del modello con le variabili è troppo lungo",
  132007: "il contenuto viola le regole di Meta",
  132012: "variabili del modello nel formato sbagliato",
  132015: "il modello è in pausa per bassa qualità",
  132016: "il modello è disattivato",
};

/** Perché Meta non ha consegnato il messaggio, in italiano e breve. */
export function motivoMancataConsegna(errori: unknown): string {
  const primo = Array.isArray(errori) ? errori[0] : null;
  if (!primo || typeof primo !== "object") return "Meta non ha detto il motivo";
  const e = primo as { code?: unknown; title?: unknown; message?: unknown };
  const codice = typeof e.code === "number" ? e.code : Number(e.code);
  if (Number.isFinite(codice) && MOTIVI[codice]) return MOTIVI[codice];
  const testo = [e.title, e.message].find((t) => typeof t === "string" && t.trim()) as string | undefined;
  const motivo = testo ? testo.trim() : "motivo non indicato";
  return (Number.isFinite(codice) ? `errore ${codice}: ${motivo}` : motivo).slice(0, 160);
}
