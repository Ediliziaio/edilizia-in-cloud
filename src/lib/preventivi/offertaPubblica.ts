/**
 * Le pagine pubbliche dell'offerta (/offerta/<token> e /preventivo/<id>?token=…)
 * mostrano al cliente le righe che sta per firmare. Le regole sono quelle del PDF:
 *
 *  - «nascosta al cliente» (mostra_nel_pdf = false): non si vede;
 *  - «subtotale»: nel builder è un'etichetta senza importo, qui non dice nulla;
 *  - «nota»: è solo testo, senza prezzo, quantità e IVA;
 *  - «opzionale»: si vede ma NON è nel totale. Va detto, altrimenti la somma delle
 *    righe non torna con il totale che il cliente firma (e il cliente crede di
 *    pagare ciò che è solo proposto);
 *  - posa, smaltimento, trasporto, nolo: righe figlie della voce sopra.
 */

export interface RigaOffertaGrezza {
  item_type?: string | null;
  item_category?: string | null;
  is_optional?: boolean | null;
  mostra_nel_pdf?: boolean | null;
}

export interface RigaOffertaPubblica<T extends RigaOffertaGrezza> {
  riga: T;
  genere: "riga" | "nota";
  figlia: boolean;
  opzionale: boolean;
}

const CATEGORIE_FIGLIE = ["posa", "smaltimento", "trasporto", "nolo"];

export function righeOffertaPubblica<T extends RigaOffertaGrezza>(righe: readonly T[]): RigaOffertaPubblica<T>[] {
  const visibili: RigaOffertaPubblica<T>[] = [];
  for (const riga of righe) {
    if (riga.mostra_nel_pdf === false) continue;
    if (riga.item_type === "section") continue;
    const categoria = riga.item_category || "prodotto";
    if (categoria === "subtotale") continue;
    visibili.push({
      riga,
      genere: categoria === "nota" ? "nota" : "riga",
      figlia: CATEGORIE_FIGLIE.includes(categoria),
      opzionale: riga.is_optional === true && categoria !== "nota",
    });
  }
  return visibili;
}

/**
 * Cosa dire al cliente quando la funzione risponde «non valido» (`valid: false`).
 * Prima la pagina /preventivo scriveva il codice così com'era («already_signed»,
 * «invalid_status») e la pagina /offerta non diceva niente: il tasto sembrava morto.
 */
export function messaggioOffertaNonDisponibile(motivo: string | null | undefined): string {
  switch (motivo) {
    case "expired":
      return "Questa offerta ha superato la data di validità. Contatta l'azienda per maggiori informazioni.";
    case "token_invalid":
      return "Il link che hai utilizzato non è valido o è stato rimosso.";
    case "already_signed":
      return "Questa offerta è già stata accettata.";
    case "invalid_status":
      return "Questa offerta non si può più accettare o rifiutare: è già stata decisa o l'azienda l'ha ritirata. Contatta l'azienda per maggiori informazioni.";
    default:
      return "Si è verificato un errore. Riprova più tardi.";
  }
}

/**
 * Il messaggio da mostrare quando la chiamata fallisce con un errore HTTP.
 * supabase-js mette in `error.message` il generico «Edge Function returned a
 * non-2xx status code»: la frase vera sta nel corpo della risposta. Per la firma
 * la frase per il cliente è `message` (consensi mancanti), poi `error`.
 */
export async function messaggioDaErroreFirma(errore: unknown, fallback: string): Promise<string> {
  try {
    const corpo = await (errore as {
      context?: { json?: () => Promise<{ error?: string; message?: string }> };
    }).context?.json?.();
    if (corpo?.message) return String(corpo.message);
    if (corpo?.error) return String(corpo.error);
  } catch {
    /* corpo non JSON o assente: si usa il testo di riserva */
  }
  return fallback;
}

/**
 * Il link di firma di un preventivo è /offerta/<token> e il token è un UUID
 * (quote-sign rifiuta ogni altra forma). La stessa rotta /offerta/<qualcosa>
 * serve però anche il checkout pubblico dei piani Edilizia in Cloud
 * (/offerta/clienti-marketing): dal percorso solo, le due non si distinguono.
 */
export function eTokenOffertaPreventivo(valore: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valore ?? "");
}

/**
 * Il percorso è il link di firma di un preventivo (/offerta/<token UUID>)?
 * Serve a nascondere sulla pagina del cliente la bolla «Scrivici su WhatsApp» di
 * Edilizia in Cloud (il cliente scriverebbe a noi credendo di scrivere alla sua
 * impresa), senza toglierla dal checkout dei piani (/offerta/clienti-marketing),
 * dove chi legge è un prospect di Edilizia in Cloud.
 */
export function eLinkFirmaPreventivo(percorso: string): boolean {
  const m = /^\/offerta\/([^/]+)\/?$/.exec(percorso);
  return !!m && eTokenOffertaPreventivo(m[1]);
}
