/**
 * quoteLegal — tutele legali della firma di un preventivo.
 *
 * PERCHÉ ESISTE: `quote-sign` accettava la firma con il solo nome digitato.
 * Nessuna accettazione delle condizioni, nessuna informativa sul recesso,
 * nessuna approvazione delle clausole vessatorie, nessuna prova di integrità
 * del documento firmato. Per un'impresa edile che vende a privati sono i tre
 * punti su cui un contratto si contesta.
 *
 * RIFERIMENTI (diritto italiano):
 *  - Recesso: D.Lgs. 206/2005 (Codice del Consumo), artt. 52-59. Un preventivo
 *    firmato online da un consumatore è un contratto a distanza: 14 giorni di
 *    ripensamento. Se l'informativa NON viene data, l'art. 53 estende il
 *    termine di 12 mesi — è il rischio concreto che questo modulo evita.
 *  - Lavori su misura: l'art. 59 c.1 lett. c) esclude il recesso per beni
 *    confezionati su misura, ma l'informativa resta dovuta; e se il cliente
 *    vuole l'inizio lavori entro i 14 giorni serve la sua richiesta espressa
 *    (art. 50 c.2), altrimenti l'azienda non può pretendere il corrispettivo
 *    per quanto già eseguito in caso di ripensamento.
 *  - Clausole vessatorie: art. 1341 c.c. comma 2 — senza approvazione
 *    SPECIFICA e separata sono NULLE (foro, limiti di responsabilità,
 *    decadenze, penali). Una spunta unica "accetto tutto" non basta.
 *
 * Modulo PURO: nessun import, così gira nelle edge function e nei test vitest.
 * Qui non si esprimono pareri legali: si raccoglie e si conserva la prova che
 * l'informativa è stata data e accettata.
 */

export type TipoFirmatario = "consumatore" | "professionista";

/** Consenso singolo raccolto al momento della firma. */
export interface ConsensoRaccolto {
  chiave: string;
  accettato: boolean;
  /** Testo esatto mostrato al firmatario: si conserva com'era quel giorno. */
  testo?: string;
}

export interface ClausolaVessatoria {
  codice: string;
  titolo: string;
  testo: string;
}

/** Chiavi dei consensi gestiti. */
export const CONSENSO = {
  CONDIZIONI: "condizioni_contrattuali",
  PRIVACY: "informativa_privacy",
  RECESSO: "informativa_recesso",
  /** Richiesta espressa di iniziare i lavori entro i 14 giorni (art. 50 c.2). */
  INIZIO_ANTICIPATO: "inizio_lavori_anticipato",
  VESSATORIE: "clausole_vessatorie",
} as const;

export const GIORNI_RECESSO = 14;

/** Informativa di recesso, in italiano leggibile da un cliente reale. */
export function testoRecesso(opts: { lavoriSuMisura?: boolean; nomeAzienda?: string } = {}): string {
  const azienda = opts.nomeAzienda?.trim() || "l'impresa";
  const base =
    `Hai ${GIORNI_RECESSO} giorni di tempo dalla firma per ripensarci e annullare l'ordine ` +
    `senza dover dare spiegazioni e senza penali. Per farlo basta una comunicazione scritta a ${azienda} ` +
    `(email o raccomandata). Se hai già versato un acconto, ti verrà restituito entro 14 giorni dalla ` +
    `tua comunicazione.`;
  if (!opts.lavoriSuMisura) return base;
  return (
    base +
    "\n\nAttenzione: per i lavori realizzati su tua misura o personalizzati (per esempio serramenti " +
    "costruiti sulle dimensioni della tua casa) il diritto di ripensamento non si applica una volta " +
    "che la produzione è avviata. Se chiedi di iniziare prima dei 14 giorni, dovrai indicarlo " +
    "espressamente qui sotto."
  );
}

export function testoInizioAnticipato(): string {
  return (
    `Chiedo espressamente che i lavori inizino prima che siano trascorsi i ${GIORNI_RECESSO} giorni. ` +
    "Ho capito che, se poi decidessi di annullare, dovrò comunque pagare quanto già eseguito."
  );
}

export function testoCondizioni(): string {
  return "Ho letto e accetto le condizioni contrattuali e i termini di questa offerta.";
}

export function testoPrivacy(): string {
  return "Ho letto l'informativa privacy e acconsento al trattamento dei miei dati per l'esecuzione del contratto.";
}

// ── PERSONALIZZAZIONE PER AZIENDA ───────────────────────────────────────────
// Ogni impresa ha il suo contratto: i testi qui sotto sono SUGGERIMENTI da
// proporre in fase di configurazione, mai qualcosa che viene imposto. Le
// clausole e i testi effettivi arrivano da `quote_clause_templates`, che è già
// per azienda; li marchiamo dentro `applicable_to` (jsonb libero) senza
// bisogno di toccare lo schema.

/** Riga di `quote_clause_templates` per quanto ci serve qui. */
export interface ClausolaAziendale {
  id?: string;
  category?: string | null;
  title?: string | null;
  content?: string | null;
  active?: boolean | null;
  sort_order?: number | null;
  /** { vessatoria: true } oppure { tipo_legale: "recesso" | "privacy" | "condizioni" } */
  applicable_to?: Record<string, unknown> | null;
}

/**
 * Clausole che l'azienda ha marcato come vessatorie.
 *
 * REGOLA: se l'azienda non ne ha configurate, NON se ne impone nessuna. Far
 * approvare al cliente clausole che l'impresa non ha scelto sarebbe peggio del
 * problema: le clausole vessatorie devono essere quelle del suo contratto.
 */
export function clausoleVessatorieAttive(righe: ClausolaAziendale[]): ClausolaVessatoria[] {
  return righe
    .filter((r) => r.active !== false && r.applicable_to?.vessatoria === true && (r.content ?? "").trim())
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100))
    .map((r) => ({
      codice: r.id ?? (r.category ?? "clausola"),
      titolo: (r.title ?? "Clausola").trim(),
      testo: (r.content ?? "").trim(),
    }));
}

/** Testi informativi effettivi: quelli dell'azienda quando ci sono, altrimenti i nostri. */
export function risolviTestiLegali(
  righe: ClausolaAziendale[],
  opts: { lavoriSuMisura?: boolean; nomeAzienda?: string } = {},
): Record<string, string> {
  const perTipo = (tipo: string): string | undefined => {
    const r = righe.find(
      (x) => x.active !== false && x.applicable_to?.tipo_legale === tipo && (x.content ?? "").trim(),
    );
    return r?.content?.trim();
  };
  return {
    [CONSENSO.CONDIZIONI]: perTipo("condizioni") ?? testoCondizioni(),
    [CONSENSO.PRIVACY]: perTipo("privacy") ?? testoPrivacy(),
    [CONSENSO.RECESSO]: perTipo("recesso") ?? testoRecesso(opts),
    [CONSENSO.INIZIO_ANTICIPATO]: perTipo("inizio_anticipato") ?? testoInizioAnticipato(),
  };
}

/**
 * Clausole vessatorie di uso comune nei contratti d'appalto edile. Sono un
 * PUNTO DI PARTENZA da proporre all'azienda nella configurazione: nessuna di
 * queste viene applicata se l'impresa non la sceglie e non la adatta.
 */
export const CLAUSOLE_VESSATORIE_TIPO: ClausolaVessatoria[] = [
  { codice: "foro", titolo: "Foro competente", testo: "Per ogni controversia è competente in via esclusiva il Foro della sede dell'impresa." },
  { codice: "responsabilita", titolo: "Limitazione di responsabilità", testo: "La responsabilità dell'impresa è limitata al valore del contratto, salvo dolo o colpa grave." },
  { codice: "decadenza", titolo: "Termini di decadenza", testo: "I vizi devono essere denunciati entro 8 giorni dalla scoperta, a pena di decadenza." },
  { codice: "penali", titolo: "Penali e recesso dell'impresa", testo: "In caso di recesso del committente a lavori avviati è dovuta una penale pari alle opere eseguite più il 10%." },
  { codice: "sospensione", titolo: "Sospensione dei lavori", testo: "L'impresa può sospendere i lavori in caso di mancato pagamento di una rata alla scadenza." },
];

export interface ContestoFirma {
  tipoFirmatario: TipoFirmatario;
  /** Il template ha condizioni contrattuali da accettare. */
  haCondizioni: boolean;
  /** Il template dichiara clausole vessatorie da approvare separatamente. */
  clausoleVessatorie: ClausolaVessatoria[];
  /** Lavori su misura (serramenti, arredi): cambia l'informativa di recesso. */
  lavoriSuMisura?: boolean;
}

/** Chiavi obbligatorie per quel contesto. L'ordine è quello mostrato a schermo. */
export function consensiObbligatori(ctx: ContestoFirma): string[] {
  const chiavi: string[] = [];
  if (ctx.haCondizioni) chiavi.push(CONSENSO.CONDIZIONI);
  chiavi.push(CONSENSO.PRIVACY);
  // Il recesso è una tutela del CONSUMATORE: non si applica tra imprese.
  if (ctx.tipoFirmatario === "consumatore") chiavi.push(CONSENSO.RECESSO);
  if (ctx.clausoleVessatorie.length > 0) chiavi.push(CONSENSO.VESSATORIE);
  return chiavi;
}

export interface EsitoValidazione {
  valido: boolean;
  mancanti: string[];
  messaggio?: string;
}

const ETICHETTE: Record<string, string> = {
  [CONSENSO.CONDIZIONI]: "accettazione delle condizioni contrattuali",
  [CONSENSO.PRIVACY]: "informativa privacy",
  [CONSENSO.RECESSO]: "presa visione del diritto di ripensamento",
  [CONSENSO.VESSATORIE]: "approvazione specifica delle clausole",
  [CONSENSO.INIZIO_ANTICIPATO]: "richiesta di inizio lavori anticipato",
};

/**
 * Verifica che tutti i consensi obbligatori siano stati dati.
 * Il consenso all'inizio anticipato NON è mai obbligatorio: è una facoltà.
 */
export function validaConsensi(ctx: ContestoFirma, raccolti: ConsensoRaccolto[]): EsitoValidazione {
  const dati = new Set(raccolti.filter((c) => c.accettato).map((c) => c.chiave));
  const mancanti = consensiObbligatori(ctx).filter((k) => !dati.has(k));
  if (mancanti.length === 0) return { valido: true, mancanti: [] };
  const elenco = mancanti.map((k) => ETICHETTE[k] ?? k).join(", ");
  return {
    valido: false,
    mancanti,
    messaggio: `Per firmare mancano: ${elenco}.`,
  };
}

/**
 * Impronta del documento firmato (SHA-256 esadecimale).
 *
 * Serve a rispondere alla domanda "cosa ha firmato esattamente il cliente?":
 * se il preventivo viene modificato dopo la firma, l'impronta non torna più e
 * la modifica è dimostrabile. Web Crypto è disponibile sia nelle edge function
 * sia nel browser.
 */
export async function improntaDocumento(contenuto: string): Promise<string> {
  const dati = new TextEncoder().encode(contenuto);
  const digest = await crypto.subtle.digest("SHA-256", dati);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stringa canonica del preventivo su cui calcolare l'impronta: solo i dati che
 * contano per il contratto, in ordine STABILE (le chiavi ordinate) — altrimenti
 * due serializzazioni dello stesso preventivo darebbero impronte diverse.
 */
export function contenutoCanonico(q: {
  quote_number?: string | null;
  total?: number | null;
  subtotal?: number | null;
  vat_amount?: number | null;
  discount_amount?: number | null;
  title?: string | null;
  terms_and_conditions?: string | null;
  items?: Array<{ name?: string | null; quantity?: number | null; unit_price?: number | null; line_total?: number | null }>;
}): string {
  const righe = (q.items ?? []).map((i) =>
    [i.name ?? "", i.quantity ?? 0, i.unit_price ?? 0, i.line_total ?? 0].join("|"),
  );
  return JSON.stringify({
    numero: q.quote_number ?? "",
    titolo: q.title ?? "",
    subtotale: q.subtotal ?? 0,
    sconto: q.discount_amount ?? 0,
    iva: q.vat_amount ?? 0,
    totale: q.total ?? 0,
    condizioni: q.terms_and_conditions ?? "",
    righe,
  });
}

export interface ProvaFirma {
  versione: 1;
  firmato_il: string;
  firmato_da: string;
  tipo_firmatario: TipoFirmatario;
  ip: string;
  user_agent: string;
  impronta_documento: string;
  consensi: ConsensoRaccolto[];
  clausole_approvate: string[];
  recesso: {
    applicabile: boolean;
    giorni: number;
    scade_il: string | null;
    inizio_anticipato_richiesto: boolean;
  };
}

/**
 * Pacchetto di prova da conservare insieme al preventivo: chi, quando, da dove,
 * cosa ha accettato e su quale versione del documento.
 */
export function costruisciProvaFirma(params: {
  firmatoDa: string;
  tipoFirmatario: TipoFirmatario;
  ip: string;
  userAgent: string;
  improntaDocumento: string;
  consensi: ConsensoRaccolto[];
  clausoleVessatorie: ClausolaVessatoria[];
  quando: Date;
}): ProvaFirma {
  const dati = new Set(params.consensi.filter((c) => c.accettato).map((c) => c.chiave));
  const consumatore = params.tipoFirmatario === "consumatore";
  const inizioAnticipato = dati.has(CONSENSO.INIZIO_ANTICIPATO);
  // Il termine decorre dalla firma; se il cliente ha chiesto l'inizio anticipato
  // la data resta indicata, ma la facoltà di ripensamento si riduce a quanto
  // non ancora eseguito: la scadenza serve all'azienda per sapere quando è al sicuro.
  const scade = consumatore
    ? new Date(params.quando.getTime() + GIORNI_RECESSO * 24 * 3600 * 1000).toISOString()
    : null;

  return {
    versione: 1,
    firmato_il: params.quando.toISOString(),
    firmato_da: params.firmatoDa,
    tipo_firmatario: params.tipoFirmatario,
    ip: params.ip,
    user_agent: params.userAgent.slice(0, 400),
    impronta_documento: params.improntaDocumento,
    consensi: params.consensi,
    clausole_approvate: dati.has(CONSENSO.VESSATORIE)
      ? params.clausoleVessatorie.map((c) => c.codice)
      : [],
    recesso: {
      applicabile: consumatore,
      giorni: GIORNI_RECESSO,
      scade_il: scade,
      inizio_anticipato_richiesto: inizioAnticipato,
    },
  };
}

/** Riepilogo leggibile da mettere nell'email di conferma al firmatario. */
export function riepilogoPerEmail(prova: ProvaFirma): string {
  const righe = [
    `Firmato da: ${prova.firmato_da}`,
    `Data e ora: ${new Date(prova.firmato_il).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`,
    `Impronta del documento: ${prova.impronta_documento.slice(0, 16)}…`,
  ];
  if (prova.recesso.applicabile && prova.recesso.scade_il) {
    righe.push(
      `Ripensamento: hai tempo fino al ${new Date(prova.recesso.scade_il).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` +
        (prova.recesso.inizio_anticipato_richiesto ? " (hai chiesto l'inizio anticipato dei lavori)" : ""),
    );
  }
  return righe.join("\n");
}
