/**
 * Esiti SDI letti da openapi.it — traduzione verso i nostri stati.
 *
 * Fino al 20/09/2026 una fattura trasmessa restava «in attesa esito» per sempre:
 * a openapi non veniva registrato nessun indirizzo di richiamo, nessuno andava a
 * chiedere com'era finita, e il webhook che c'era cercava il documento con un
 * identificativo diverso da quello salvato. Risultato: sdi_log vuoto, nessuna
 * ricevuta, nessuno scarto. Ora ci pensa sdi-stato-tick a chiedere.
 *
 * Il vocabolario di openapi non è documentato in modo stabile, e finché nessuna
 * fattura vera è partita non lo possiamo verificare sul campo. Quindi qui si
 * riconoscono le sigle dello SDI (quelle sì, fissate dalle specifiche) e le
 * parole che i gestionali usano di solito, in italiano e in inglese. Quello che
 * non si riconosce NON cambia lo stato: viene scritto in sdi_log perché la prima
 * fattura vera ci insegni il resto.
 *
 * Modulo puro: lo usa sdi-stato-tick, lo provano i test in
 * src/test/logic/sdiStatoOpenapi.test.ts.
 */

/** Stato nostro corrispondente a una notifica SDI. */
export interface EsitoSdi {
  /** Sigla della notifica SDI: AT, RC, MC, NS, DT, EC01, EC02. */
  sdi_stato: string;
  /** Stato del documento; null = non cambiarlo (la notifica non è definitiva). */
  stato: string | null;
  /** Frase per lo storico e per l'utente. */
  messaggio: string;
}

const ESITI: Record<string, EsitoSdi> = {
  AT: { sdi_stato: "AT", stato: null, messaggio: "Trasmessa allo SDI, in attesa di esito." },
  RC: { sdi_stato: "RC", stato: "consegnata", messaggio: "Consegnata al destinatario." },
  MC: {
    sdi_stato: "MC",
    stato: "inviata_sdi",
    messaggio: "Mancata consegna: lo SDI la mette a disposizione nel cassetto fiscale del cliente. La fattura è valida.",
  },
  NS: { sdi_stato: "NS", stato: "rifiutata", messaggio: "Scartata dallo SDI: va corretta e reinviata." },
  DT: { sdi_stato: "DT", stato: "accettata", messaggio: "Accettata per decorrenza dei termini." },
  EC01: { sdi_stato: "EC01", stato: "accettata", messaggio: "Accettata dal destinatario." },
  EC02: { sdi_stato: "EC02", stato: "rifiutata", messaggio: "Rifiutata dal destinatario." },
};

/**
 * La fattura ha ancora un esito da aspettare?
 *
 * Tra aziende e verso i privati (FPR12) l'ultima notifica è la consegna (RC) o
 * la mancata consegna (MC): dopo non arriva più niente. Solo verso la Pubblica
 * Amministrazione (FPA12) alla consegna seguono accettazione, rifiuto o
 * decorrenza dei termini (15 giorni). Fino al 24/09/2026 RC e MC non
 * chiudevano mai il controllo: ogni fattura consegnata si chiedeva a openapi
 * ogni 15 minuti per sempre (96 chiamate al giorno, gratis solo le prime 1.000
 * al giorno per tutto l'account), e con 40 fatture consegnate le nuove non si
 * guardavano più.
 */
export function esitoDefinitivo(sdiStato: string | null | undefined, versoPa: boolean): boolean {
  const s = String(sdiStato ?? "").trim().toUpperCase();
  if (s === "NS" || s === "EC01" || s === "EC02" || s === "DT") return true;
  return !versoPa && (s === "RC" || s === "MC");
}

/**
 * Lo stato SDI come lo scrive openapi: `details.sdi_status` nella fattura
 * (schema OAS dell'API Invoice, letto il 24/09/2026). Fino ad allora qui si
 * indovinava, e quel campo non si guardava: ogni esito vero sarebbe finito in
 * «non riconosciuto» e la fattura sarebbe rimasta «inviata» per sempre.
 * RECEIVED riguarda solo le fatture dei fornitori, NEW/DONE lo stato del lavoro
 * di openapi: non dicono niente dello SDI.
 */
const STATI_OPENAPI: Record<string, string> = {
  BOOKED: "AT",
  SENT: "AT",
  DELIVERED: "RC",
  NOT_DELIVERED: "MC",
  ACCEPTED: "EC01",
  REJECTED: "NS",
  TERMS_EXPIRED: "DT",
  ERROR: "NS",
};

/** Parole d'uso comune → sigla SDI. Si confronta per contenuto, non per uguaglianza. */
const PAROLE: Array<[RegExp, string]> = [
  [/scartat|rifiutata dallo sdi|\brejected\b|\bdiscarded\b|\bnotifica_scarto\b/i, "NS"],
  [/rifiutat.*(destinatar|cliente)|\brefused\b|\bec02\b/i, "EC02"],
  [/accettat|\baccepted\b|\bec01\b/i, "EC01"],
  [/decorrenza|\bexpired\b|\btimeout\b/i, "DT"],
  [/mancata consegna|non consegnat|\bnot_?delivered\b|\bundelivered\b|impossibilit/i, "MC"],
  [/consegnat|\bdelivered\b|\bricevuta di consegna\b/i, "RC"],
  [/in attesa|\bpending\b|\bsent\b|\bprocessing\b|\binviata\b|\btrasmessa\b|\bqueued\b/i, "AT"],
];

/**
 * Traduce quello che openapi dice sullo stato di una fattura.
 * Ritorna null se non si riconosce: chi chiama non cambia niente e lo annota.
 */
export function leggiEsitoOpenapi(grezzo: unknown): EsitoSdi | null {
  const testo = estraiStato(grezzo);
  if (!testo) return null;

  const openapi = STATI_OPENAPI[testo.trim().toUpperCase()];
  if (openapi) {
    const esito = ESITI[openapi];
    // Uno scarto o un errore: la frase dello SDI dice cosa correggere.
    const motivo = openapi === "NS" ? messaggioSdi(grezzo) : null;
    return motivo ? { ...esito, messaggio: `${esito.messaggio} Motivo: ${motivo}` } : esito;
  }

  const sigla = testo.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (ESITI[sigla]) return ESITI[sigla];

  for (const [regola, esito] of PAROLE) {
    if (regola.test(testo)) return ESITI[esito];
  }
  return null;
}

/** Il campo con lo stato, cercato nei posti dove i provider lo mettono di solito. */
export function estraiStato(grezzo: unknown): string | null {
  if (typeof grezzo === "string") return grezzo || null;
  if (!grezzo || typeof grezzo !== "object") return null;
  const o = grezzo as Record<string, unknown>;
  const dentro = (o.data ?? o.result ?? o.invoice) as Record<string, unknown> | undefined;
  const dettagli = (dentro?.details ?? o.details) as Record<string, unknown> | undefined;
  const candidati = [
    // Prima lo stato SDI di openapi, poi i nomi che usano gli altri provider.
    dettagli?.sdi_status,
    o.status, o.stato, o.sdi_status, o.sdiStatus, o.esito, o.notification, o.notifica,
    dentro?.status, dentro?.stato, dentro?.sdi_status, dentro?.sdiStatus, dentro?.esito,
    dentro?.notification, dentro?.notifica,
  ];
  for (const c of candidati) {
    if (typeof c === "string" && c.trim()) return c;
    if (typeof c === "number") return String(c);
  }
  // Lo stato del lavoro di openapi, solo se dice errore o spedita.
  const lavoro = String(dentro?.state ?? o.state ?? "").trim().toUpperCase();
  return lavoro === "ERROR" || lavoro === "SENT" ? lavoro : null;
}

/** La frase dello SDI o di openapi su uno scarto (details.sdi_message). */
export function messaggioSdi(grezzo: unknown): string | null {
  if (!grezzo || typeof grezzo !== "object") return null;
  const o = grezzo as Record<string, unknown>;
  const dentro = (o.data ?? o.result ?? o.invoice) as Record<string, unknown> | undefined;
  const dettagli = (dentro?.details ?? o.details) as Record<string, unknown> | undefined;
  const m = dettagli?.sdi_message;
  return typeof m === "string" && m.trim() ? m.trim().slice(0, 500) : null;
}

/** L'IdentificativoSdI, quando il provider lo restituisce: serve al webhook. */
export function estraiIdentificativoSdi(grezzo: unknown): string | null {
  if (!grezzo || typeof grezzo !== "object") return null;
  const o = grezzo as Record<string, unknown>;
  const dentro = (o.data ?? o.result ?? o.invoice) as Record<string, unknown> | undefined;
  const dettagli = (dentro?.details ?? o.details) as Record<string, unknown> | undefined;
  const candidati = [
    dettagli?.sdi_id,
    o.identificativo_sdi, o.identificativoSdI, o.sdi_identifier, o.id_sdi, o.idSdi,
    dentro?.identificativo_sdi, dentro?.identificativoSdI, dentro?.sdi_identifier,
    dentro?.id_sdi, dentro?.idSdi,
  ];
  for (const c of candidati) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (typeof c === "number") return String(c);
  }
  return null;
}
