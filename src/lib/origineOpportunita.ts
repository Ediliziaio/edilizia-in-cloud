/**
 * Da dove arriva un'opportunità, detto in poche parole per la scheda.
 *
 * Richiesta del titolare (14/09/2026): accanto a «Creato il» vedere anche da
 * CHI o da COSA è nata — la persona che l'ha inserita a mano, oppure la fonte.
 *
 * `created_by` esiste dal 14/09/2026 (migrazione 20280916800001) e si riempie
 * solo quando la inserisce qualcuno dall'app. Moduli, webhook Meta,
 * importazioni e automazioni lo lasciano vuoto: allora parla `source`, che è
 * testo libero scritto da chi ha configurato il canale («facebook», «Google
 * nuovo», «Vecchio Cliente») oppure, per i moduli del sito più vecchi, un
 * codice `form_<id>` che qui torna il nome del modulo.
 */

export interface DatiOrigine {
  created_by?: string | null;
  source?: string | null;
  tags?: string[] | null;
  meta_lead_id?: string | null;
}

export interface Origine {
  /** «utente» si legge «da …», «fonte» si legge «fonte: …». */
  tipo: "utente" | "fonte";
  testo: string;
  /** Arrivata con un'importazione (etichetta `import…`). */
  importata: boolean;
}

const MODULO_SITO = /^form_([0-9a-f-]{36})$/i;

/** L'id del modulo del sito dentro una fonte `form_<id>`, se c'è. */
export function idModuloDaFonte(source: string | null | undefined): string | null {
  const m = (source ?? "").trim().match(MODULO_SITO);
  return m ? m[1] : null;
}

export function origineOpportunita(
  o: DatiOrigine,
  nomeUtente: (id: string) => string | null | undefined,
  nomeModulo: (id: string) => string | null | undefined,
): Origine | null {
  const importata = (o.tags ?? []).some((t) => /^import/i.test(t));

  if (o.created_by) {
    const nome = nomeUtente(o.created_by)?.trim();
    return { tipo: "utente", testo: nome || "un utente", importata };
  }

  const fonte = (o.source ?? "").trim();
  const idModulo = idModuloDaFonte(fonte);
  if (idModulo) {
    const nome = nomeModulo(idModulo)?.trim();
    return { tipo: "fonte", testo: nome ? `modulo «${nome}»` : "modulo del sito", importata };
  }
  if (/^facebook$/i.test(fonte)) {
    return { tipo: "fonte", testo: o.meta_lead_id ? "Facebook (modulo Lead Ads)" : "Facebook", importata };
  }
  if (/^google$/i.test(fonte)) return { tipo: "fonte", testo: "Google", importata };
  if (fonte) return { tipo: "fonte", testo: fonte, importata };
  if (o.meta_lead_id) return { tipo: "fonte", testo: "Facebook (modulo Lead Ads)", importata };
  if (importata) return { tipo: "fonte", testo: "importazione", importata };
  return null;
}
