// Incassi delle fatture (25/09/2026).
//
// «Segna pagata» (nel dettaglio, nell'elenco e sulla selezione multipla)
// aggiornava la fattura a mano: stato 'pagata' e importo pagato, niente altro.
// L'incasso non esisteva: nessun movimento di cassa, nessuna riga di prima
// nota, la scadenza restava scoperta, e registro incassi, previsionale e
// scadenzario non lo vedevano. Chi poi lo registrava dal registro incassi si
// sentiva dire «superiore al residuo».
//
// Ora ogni incasso passa da registra_incasso_atomico, la stessa funzione del
// registro incassi: movimento, prima nota, scadenza e stato della fattura in
// una transazione sola. Lo stato verso lo SDI non si tocca: sta in sdi_stato.

/** I metodi del registro incassi (lo stesso valore finisce in prima nota). */
export const METODI_INCASSO = [
  { value: "bonifico", label: "Bonifico" },
  { value: "contanti", label: "Contanti" },
  { value: "assegno", label: "Assegno" },
  { value: "carta", label: "Carta" },
  { value: "riba", label: "RiBa" },
  { value: "sdd", label: "SDD" },
] as const;

/**
 * Il metodo del registro incassi dal codice di pagamento della fattura
 * (ModalitaPagamento della FatturaPA). Quello che non ha un corrispondente
 * diventa bonifico, il più comune.
 */
export function metodoIncassoDaCodice(codice: string | null | undefined): string {
  switch ((codice ?? "").trim().toUpperCase()) {
    case "MP01": return "contanti";
    case "MP02": // assegno
    case "MP03": // assegno circolare
      return "assegno";
    case "MP08": return "carta";
    case "MP12": return "riba";
    case "MP19": // SEPA Direct Debit
    case "MP20": // SDD CORE
    case "MP21": // SDD B2B
      return "sdd";
    default: return "bonifico";
  }
}

/** Quanto resta da incassare, al centesimo. */
export function residuoDaIncassare(doc: { totale_da_pagare?: number | null; importo_pagato?: number | null }): number {
  return Math.round(((doc.totale_da_pagare ?? 0) - (doc.importo_pagato ?? 0)) * 100) / 100;
}

export interface FatturaDaIncassare {
  id: string;
  numero: string;
  residuo: number;
}

export interface EsitoIncassi {
  /** Numeri delle fatture incassate. */
  registrati: string[];
  /** Quelle non riuscite, col motivo detto dal database. */
  falliti: { numero: string; motivo: string }[];
}

/** Quanto serve del client Supabase: solo la chiamata a funzione. */
export interface ChiamataRpc {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: { message?: string } | null }>;
}

/**
 * Un incasso per fattura, per il suo residuo, dalla funzione atomica. Una
 * fattura che non riesce non ferma le altre: finisce nel resoconto.
 */
export async function registraIncassi(
  db: ChiamataRpc,
  companyId: string,
  fatture: FatturaDaIncassare[],
  opzioni: { metodo: string; data: string },
): Promise<EsitoIncassi> {
  const esito: EsitoIncassi = { registrati: [], falliti: [] };
  for (const f of fatture) {
    if (!(f.residuo > 0)) {
      esito.falliti.push({ numero: f.numero, motivo: "Niente da incassare: è già pagata per intero." });
      continue;
    }
    try {
      const { error } = await db.rpc("registra_incasso_atomico", {
        p_company_id: companyId,
        p_documento_id: f.id,
        p_importo: f.residuo,
        p_metodo: opzioni.metodo,
        p_data_movimento: opzioni.data,
        p_riferimento: null,
        p_note: "Segnata pagata",
      });
      if (error) esito.falliti.push({ numero: f.numero, motivo: error.message || "Incasso non registrato." });
      else esito.registrati.push(f.numero);
    } catch (e) {
      esito.falliti.push({ numero: f.numero, motivo: e instanceof Error ? e.message : "Incasso non registrato." });
    }
  }
  return esito;
}

/** Il resoconto per l'avviso finale: quante riuscite, e quali no con il motivo. */
export function descriviEsitoIncassi(esito: EsitoIncassi): { titolo: string; dettaglio?: string; tutteRiuscite: boolean } {
  const n = esito.registrati.length;
  const titolo = n === 0
    ? "Nessun incasso registrato"
    : n === 1 ? "Incasso registrato" : `${n} incassi registrati`;
  if (esito.falliti.length === 0) return { titolo, tutteRiuscite: true };
  const primi = esito.falliti.slice(0, 3).map((f) => `${f.numero}: ${f.motivo}`);
  const altri = esito.falliti.length - primi.length;
  return {
    titolo: n === 0 ? titolo : `${titolo}, ${esito.falliti.length} non riusciti`,
    dettaglio: primi.join(" · ") + (altri > 0 ? ` · e altre ${altri}` : ""),
    tutteRiuscite: false,
  };
}
