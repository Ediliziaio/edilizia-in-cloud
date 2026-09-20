/**
 * Quali moduli di una pagina Facebook si interrogano a ogni giro del recupero
 * (meta-leads-backfill), e quali no (20/09/2026).
 *
 * Il giro elencava TUTTI i moduli della pagina e di ognuno chiedeva i lead degli
 * ultimi due giorni: ~317 moduli per giro, 96 giri al giorno, ~30.000 chiamate a
 * Facebook che non trovavano niente, e giri lunghi fino a 118 secondi. Quasi
 * tutti sono moduli di campagne vecchie, che Meta stesso dà per archiviati.
 *
 * Le regole, dalla più esplicita alla più prudente:
 *   1. recupero chiesto da qualcuno (giorni, o un modulo da una data): si legge
 *      tutto come prima, lo stato su Meta non conta. Un modulo archiviato ieri
 *      ha ancora dentro i lead della settimana scorsa;
 *   2. modulo spento da noi (meta_lead_forms.status diverso da «active»): non si
 *      legge, come prima;
 *   3. giro automatico, modulo che Meta dà per ARCHIVED o DELETED: non può stare
 *      in un'inserzione nuova, quindi non si legge a ogni giro. Ma non ci si fida
 *      alla cieca, perché qui un lead perso è un cliente perso:
 *        - se negli ultimi 30 giorni ci è arrivato un lead da quel modulo, si
 *          continua a leggerlo a ogni giro;
 *        - se non si è riusciti a sapere quali moduli hanno lead recenti, non si
 *          salta niente;
 *        - ogni modulo archiviato si rilegge comunque un'ora al giorno (il suo
 *          «turno di controllo»): se la regola fosse sbagliata il lead arriva in
 *          ritardo, non si perde, e nel log resta scritto da dove è arrivato;
 *   4. tutto il resto (ACTIVE, DRAFT, stato mancante o mai visto) si legge.
 *
 * Il salto ha un interruttore (`saltaArchiviati`). Spento, si legge tutto come
 * prima e si conta soltanto quanti moduli si salterebbero: è così che la regola
 * è stata provata sui dati veri prima di accenderla, ed è il modo per tornare
 * indietro in un attimo se un giorno un lead arrivasse da un modulo archiviato.
 *
 * Modulo puro: provato in src/test/logic/metaModuliDaInterrogare.test.ts.
 */

export type StatoMeta = "ACTIVE" | "ARCHIVED" | "DELETED" | "DRAFT" | "SCONOSCIUTO";

const STATI_NOTI: ReadonlyArray<StatoMeta> = ["ACTIVE", "ARCHIVED", "DELETED", "DRAFT"];

/** Per quanti giorni un lead arrivato tiene «vivo» un modulo archiviato. */
export const GIORNI_LEAD_RECENTI = 30;

/** Lo stato come lo scrive Meta; tutto ciò che non si riconosce è SCONOSCIUTO. */
export function statoMeta(status: unknown): StatoMeta {
  const s = typeof status === "string" ? status.trim().toUpperCase() : "";
  return (STATI_NOTI as ReadonlyArray<string>).includes(s) ? (s as StatoMeta) : "SCONOSCIUTO";
}

/** Meta dice che il modulo non può più stare in un'inserzione nuova. */
export function chiusoSuMeta(stato: StatoMeta): boolean {
  return stato === "ARCHIVED" || stato === "DELETED";
}

/**
 * Il turno di controllo di un modulo archiviato: un'ora fissa del giorno (UTC),
 * ricavata dal suo id, così i controlli si spargono sulle 24 ore invece di
 * cadere tutti nello stesso giro. Si ragiona a ore e non a quarti d'ora apposta:
 * vale qualunque sia la cadenza del cron, purché giri almeno una volta l'ora.
 */
export function oraDiControllo(formId: string): number {
  let h = 5381;
  for (let i = 0; i < formId.length; i++) h = ((h * 33) ^ formId.charCodeAt(i)) >>> 0;
  return h % 24;
}

export type Esito =
  | "letto"
  | "saltato_altro_modulo"
  | "saltato_disattivato"
  | "saltato_archiviato";

export type MotivoLettura =
  | "normale"              // modulo che può ricevere lead
  | "recupero_chiesto"     // giorni o data: lo stato su Meta non conta
  | "lead_recenti"         // archiviato, ma con lead negli ultimi 30 giorni
  | "controllo_non_riuscito" // archiviato, ma non si sa se ha lead recenti
  | "turno_di_controllo"   // archiviato, è la sua ora
  | "in_osservazione";     // archiviato e saltabile, ma il salto è spento

export interface Decisione {
  esito: Esito;
  stato: StatoMeta;
  configurato: boolean;
  motivo?: MotivoLettura;
}

export function decidiModulo(p: {
  formId: string;
  statusMeta: unknown;
  /** La riga di meta_lead_forms, se c'è. */
  cfg?: { status: string | null } | null;
  /** false quando qualcuno ha chiesto un recupero (giorni, modulo, data). */
  giroAutomatico: boolean;
  /** Recupero esplicito di un modulo solo. */
  soloModulo?: string | null;
  /** Moduli con lead negli ultimi 30 giorni; null = non si è potuto sapere. */
  conLeadRecenti: ReadonlySet<string> | null;
  /** Ora UTC del giro (0-23). */
  oraUtc: number;
  /** false = si osserva soltanto: si conta cosa si salterebbe, ma si legge tutto. */
  saltaArchiviati: boolean;
}): Decisione {
  const stato = statoMeta(p.statusMeta);
  const configurato = !!p.cfg;
  const base = { stato, configurato };

  if (p.soloModulo && p.formId !== p.soloModulo) return { ...base, esito: "saltato_altro_modulo" };
  if (p.cfg && p.cfg.status !== "active") return { ...base, esito: "saltato_disattivato" };
  if (!p.giroAutomatico) return { ...base, esito: "letto", motivo: "recupero_chiesto" };
  if (!chiusoSuMeta(stato)) return { ...base, esito: "letto", motivo: "normale" };

  if (p.conLeadRecenti === null) return { ...base, esito: "letto", motivo: "controllo_non_riuscito" };
  if (p.conLeadRecenti.has(p.formId)) return { ...base, esito: "letto", motivo: "lead_recenti" };
  if (oraDiControllo(p.formId) === p.oraUtc) return { ...base, esito: "letto", motivo: "turno_di_controllo" };
  if (!p.saltaArchiviati) return { ...base, esito: "letto", motivo: "in_osservazione" };
  return { ...base, esito: "saltato_archiviato" };
}

/** I numeri di un giro su una pagina: diventano UNA riga di log. */
export interface ConteggiPagina {
  moduli: number;
  perStato: Record<StatoMeta, number>;
  nonConfigurati: number;
  nonConfiguratiPerStato: Record<StatoMeta, number>;
  letti: number;
  saltatiArchiviati: number;
  /** Col salto spento: quanti se ne salterebbero. */
  saltabili: number;
  saltatiDisattivati: number;
  archiviatiConLeadRecenti: number;
  archiviatiLettiPerControllo: number;
  leadNuovi: number;
  leadNuoviDaArchiviati: number;
  errori: number;
}

const zeriPerStato = (): Record<StatoMeta, number> =>
  ({ ACTIVE: 0, ARCHIVED: 0, DELETED: 0, DRAFT: 0, SCONOSCIUTO: 0 });

export function conteggiVuoti(): ConteggiPagina {
  return {
    moduli: 0,
    perStato: zeriPerStato(),
    nonConfigurati: 0,
    nonConfiguratiPerStato: zeriPerStato(),
    letti: 0,
    saltatiArchiviati: 0,
    saltabili: 0,
    saltatiDisattivati: 0,
    archiviatiConLeadRecenti: 0,
    archiviatiLettiPerControllo: 0,
    leadNuovi: 0,
    leadNuoviDaArchiviati: 0,
    errori: 0,
  };
}

/** Segna nei conteggi la decisione presa su un modulo. */
export function conta(c: ConteggiPagina, d: Decisione): void {
  // Nel recupero di un modulo solo gli altri non fanno numero: non li si guarda.
  if (d.esito === "saltato_altro_modulo") return;
  c.moduli++;
  c.perStato[d.stato]++;
  if (!d.configurato) {
    c.nonConfigurati++;
    c.nonConfiguratiPerStato[d.stato]++;
  }
  if (d.esito === "saltato_disattivato") c.saltatiDisattivati++;
  else if (d.esito === "saltato_archiviato") c.saltatiArchiviati++;
  else {
    c.letti++;
    if (d.motivo === "lead_recenti") c.archiviatiConLeadRecenti++;
    if (d.motivo === "in_osservazione") c.saltabili++;
    if (d.motivo === "turno_di_controllo" || d.motivo === "controllo_non_riuscito") c.archiviatiLettiPerControllo++;
  }
}

// Col salto spento i moduli si leggono tutti: si scrive quanti se ne salterebbero.
const saltabili = (c: ConteggiPagina): string => (c.saltabili > 0 ? ` (salto spento: saltabili=${c.saltabili})` : "");

const elencoStati = (r: Record<StatoMeta, number>): string =>
  (Object.keys(r) as StatoMeta[]).filter((k) => r[k] > 0).map((k) => `${k}=${r[k]}`).join(" ") || "nessuno";

/**
 * La riga di log di una pagina: una per giro, non una per modulo (erano 30.437
 * righe al giorno). Dentro c'è anche la prova che la regola regge: quanti dei
 * moduli mai configurati sono davvero attivi, e se da un modulo che Meta dà per
 * archiviato è arrivato qualcosa.
 */
export function rigaPagina(p: { companyId: string; pageId: string; ms: number; c: ConteggiPagina }): string {
  const c = p.c;
  return `meta-leads-backfill: pagina ${p.pageId} azienda ${p.companyId} — ` +
    `moduli=${c.moduli} (${elencoStati(c.perStato)}) ` +
    `non_configurati=${c.nonConfigurati} (${elencoStati(c.nonConfiguratiPerStato)}) ` +
    `letti=${c.letti} saltati_archiviati=${c.saltatiArchiviati}${saltabili(c)} saltati_disattivati=${c.saltatiDisattivati} ` +
    `archiviati_con_lead_recenti=${c.archiviatiConLeadRecenti} archiviati_letti_per_controllo=${c.archiviatiLettiPerControllo} ` +
    `lead_nuovi=${c.leadNuovi} lead_nuovi_da_archiviati=${c.leadNuoviDaArchiviati} errori=${c.errori} ms=${p.ms}`;
}

/** La riga di log del giro intero: i totali di tutte le pagine e quanto è durato. */
export function rigaGiro(p: { pagine: number; ms: number; c: ConteggiPagina; automatico: boolean }): string {
  const c = p.c;
  return `meta-leads-backfill: giro ${p.automatico ? "automatico" : "di recupero"} — pagine=${p.pagine} ` +
    `moduli=${c.moduli} (${elencoStati(c.perStato)}) ` +
    `non_configurati=${c.nonConfigurati} (${elencoStati(c.nonConfiguratiPerStato)}) ` +
    `letti=${c.letti} saltati_archiviati=${c.saltatiArchiviati}${saltabili(c)} saltati_disattivati=${c.saltatiDisattivati} ` +
    `archiviati_con_lead_recenti=${c.archiviatiConLeadRecenti} ` +
    `lead_nuovi=${c.leadNuovi} lead_nuovi_da_archiviati=${c.leadNuoviDaArchiviati} errori=${c.errori} ms=${p.ms}`;
}

/** Somma i conteggi di una pagina in quelli del giro. */
export function somma(totale: ConteggiPagina, c: ConteggiPagina): void {
  totale.moduli += c.moduli;
  totale.nonConfigurati += c.nonConfigurati;
  totale.letti += c.letti;
  totale.saltatiArchiviati += c.saltatiArchiviati;
  totale.saltabili += c.saltabili;
  totale.saltatiDisattivati += c.saltatiDisattivati;
  totale.archiviatiConLeadRecenti += c.archiviatiConLeadRecenti;
  totale.archiviatiLettiPerControllo += c.archiviatiLettiPerControllo;
  totale.leadNuovi += c.leadNuovi;
  totale.leadNuoviDaArchiviati += c.leadNuoviDaArchiviati;
  totale.errori += c.errori;
  for (const k of Object.keys(c.perStato) as StatoMeta[]) {
    totale.perStato[k] += c.perStato[k];
    totale.nonConfiguratiPerStato[k] += c.nonConfiguratiPerStato[k];
  }
}
