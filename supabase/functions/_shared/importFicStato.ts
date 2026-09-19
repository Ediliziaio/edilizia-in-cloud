/**
 * Stato dell'import da Fatture in Cloud a blocchi.
 *
 * Prima billing-import scaricava in una volta tutto lo storico (con un tetto
 * silenzioso di 20 pagine per tipo) e poi lo elaborava fattura per fattura:
 * con Best Infissi (2.079 emesse, 124 note di credito, 6.980 ricevute) la
 * funzione andava oltre i limiti (546) e non salvava niente, due volte al
 * giorno, dal 09/09/2026.
 *
 * Ora l'import va a GIRI. Un giro scorre tre flussi (fatture, note di credito,
 * ricevute) pagina per pagina, ordinate per id (stabile: i documenti nuovi
 * finiscono in fondo), e ogni invocazione ne elabora solo qualche pagina,
 * salvando il cursore. Il primo giro è completo; i successivi chiedono a FIC
 * solo i documenti con `updated_at` successivo alla partenza dell'ultimo giro
 * finito (meno un giorno di margine: FIC scrive l'ora locale senza fuso).
 *
 * Modulo puro: lo usa billing-import, lo provano i test in
 * src/test/logic/importFicStato.test.ts.
 */

export const FLUSSI = ["invoice", "credit_note", "received"] as const;
export type Flusso = (typeof FLUSSI)[number];

/** Documenti per pagina chiesti a FIC (il massimo che l'API accetta). */
export const PER_PAGINA = 100;
/** Dopo tanti giri falliti di fila il recupero si ferma per un'ora. */
export const ERRORI_PRIMA_DELLA_PAUSA = 3;
const MARGINE_AGGIORNAMENTO_MS = 24 * 3_600_000;
const PAUSA_MS = 3_600_000;

export interface StatoFlusso {
  /** Prossima pagina da chiedere (da 1). */
  pagina: number;
  ultima_pagina: number | null;
  /** Documenti che FIC dice di avere per questo giro. */
  totale: number | null;
  elaborati: number;
  fatto: boolean;
}

export interface StatoImport {
  versione: 1;
  in_corso: boolean;
  tipo: "completo" | "aggiornamento";
  /** ISO: quando è partito il giro in corso (o l'ultimo). */
  avviato_il: string;
  /** Filtro FIC `updated_at >= da` (formato FIC); null = tutto lo storico. */
  da: string | null;
  flussi: Record<Flusso, StatoFlusso>;
  /** ISO: partenza dell'ultimo giro FINITO. Base del prossimo aggiornamento. */
  aggiornato_fino_a: string | null;
  ultimo_giro_completo_il: string | null;
  importati: number;
  aggiornati: number;
  falliti: number;
  /** Primi errori del giro, per chi guarda l'integrazione. */
  errori: string[];
  permesso_ricevute_mancante: boolean;
  errori_consecutivi: number;
  /** ISO: fino a quando il recupero automatico ogni 2 minuti non riparte. */
  sospeso_fino_a: string | null;
}

const flussoVuoto = (): StatoFlusso => ({ pagina: 1, ultima_pagina: null, totale: null, elaborati: 0, fatto: false });

/** «2026-09-19 13:40:39» nell'ora di Roma, come FIC scrive created_at/updated_at. */
export function dataFic(d: Date): string {
  const parti = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const p = (t: string) => parti.find((x) => x.type === t)?.value ?? "00";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")}:${p("second")}`;
}

/** Legge lo stato salvato; qualunque cosa non riconosciuta vale «mai importato». */
export function leggiStato(raw: unknown): StatoImport | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<StatoImport>;
  if (s.versione !== 1 || !s.flussi) return null;
  return s as StatoImport;
}

/**
 * Nuovo giro. Senza un giro finito alle spalle è completo; altrimenti chiede
 * solo i documenti cambiati dalla partenza dell'ultimo giro finito, meno un
 * giorno di margine (reimportarli è innocuo: si aggiornano).
 */
export function nuovoGiro(prec: StatoImport | null, adesso: Date): StatoImport {
  const base = prec?.aggiornato_fino_a ?? null;
  return {
    versione: 1,
    in_corso: true,
    tipo: base ? "aggiornamento" : "completo",
    avviato_il: adesso.toISOString(),
    da: base ? dataFic(new Date(new Date(base).getTime() - MARGINE_AGGIORNAMENTO_MS)) : null,
    flussi: { invoice: flussoVuoto(), credit_note: flussoVuoto(), received: flussoVuoto() },
    aggiornato_fino_a: base,
    ultimo_giro_completo_il: prec?.ultimo_giro_completo_il ?? null,
    importati: 0,
    aggiornati: 0,
    falliti: 0,
    errori: [],
    permesso_ricevute_mancante: false,
    errori_consecutivi: 0,
    sospeso_fino_a: null,
  };
}

/** Il flusso su cui lavorare adesso, o null se il giro è finito. */
export function prossimoFlusso(s: StatoImport): Flusso | null {
  return FLUSSI.find((f) => !s.flussi[f].fatto) ?? null;
}

/** Aggiorna il cursore di un flusso dopo aver elaborato una pagina. */
export function dopoPagina(
  f: StatoFlusso,
  pagina: { ricevuti: number; ultimaPagina?: number | null; totale?: number | null },
): StatoFlusso {
  const ultima = pagina.ultimaPagina ?? f.ultima_pagina;
  const fatto = pagina.ricevuti < PER_PAGINA || (ultima != null && f.pagina >= ultima);
  return {
    pagina: fatto ? f.pagina : f.pagina + 1,
    ultima_pagina: ultima,
    totale: pagina.totale ?? f.totale,
    elaborati: f.elaborati + pagina.ricevuti,
    fatto,
  };
}

/** Chiude il giro se tutti i flussi sono finiti: la sua partenza diventa la base del prossimo. */
export function chiudiSeFinito(s: StatoImport, adesso: Date): StatoImport {
  if (prossimoFlusso(s) !== null) return s;
  return {
    ...s,
    in_corso: false,
    aggiornato_fino_a: s.avviato_il,
    ultimo_giro_completo_il: adesso.toISOString(),
    errori_consecutivi: 0,
    sospeso_fino_a: null,
  };
}

/** Un'invocazione andata male: dopo qualche errore di fila il recupero si ferma un'ora. */
export function dopoErrore(s: StatoImport, messaggio: string, adesso: Date): StatoImport {
  const errori_consecutivi = s.errori_consecutivi + 1;
  return {
    ...s,
    errori: s.errori.length < 5 ? [...s.errori, messaggio] : s.errori,
    errori_consecutivi,
    sospeso_fino_a: errori_consecutivi >= ERRORI_PRIMA_DELLA_PAUSA
      ? new Date(adesso.getTime() + PAUSA_MS).toISOString()
      : s.sospeso_fino_a,
  };
}

/** Avanzamento per la pagina fatture: documenti elaborati su quelli che FIC dichiara. */
export function avanzamento(s: StatoImport): { elaborati: number; totale: number | null } {
  let elaborati = 0;
  let totale = 0;
  let totaleNoto = true;
  for (const f of FLUSSI) {
    elaborati += s.flussi[f].elaborati;
    const t = s.flussi[f].totale;
    if (t == null && !s.flussi[f].fatto) totaleNoto = false;
    totale += t ?? s.flussi[f].elaborati;
  }
  return { elaborati, totale: totaleNoto ? totale : null };
}

/** Parametri della lista FIC per una pagina di un flusso. */
export function parametriPagina(s: StatoImport, flusso: Flusso): Record<string, string> {
  const p: Record<string, string> = {
    fieldset: "detailed",
    per_page: String(PER_PAGINA),
    page: String(s.flussi[flusso].pagina),
    sort: "id",
  };
  if (flusso !== "received") p.type = flusso;
  if (s.da) p.q = `updated_at >= '${s.da}'`;
  return p;
}
