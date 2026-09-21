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
 * Provata il 20/09/2026: gli archiviati sono 25 su 336, il salto vale il 7% delle
 * chiamate e resta spento.
 *
 * IL CONTEGGIO DEI LEAD (21/09/2026). Meta dice quanti lead ha ogni modulo
 * (`leads_count`, nell'elenco dei moduli della pagina). Se il numero è lo
 * stesso dell'ultimo giro, nel modulo non è entrato niente: non serve chiedere
 * i suoi lead. È un dato di Meta, non una supposizione come lo stato. Le regole,
 * tutte dalla parte della prudenza:
 *   - conteggio mancante o non numerico → si legge (non si indovina);
 *   - modulo mai visto → si legge;
 *   - qualunque differenza dall'ultimo visto, anche in meno → si legge;
 *   - cambiato da meno di un'ora → si legge a ogni giro: Meta può contare il
 *     lead un attimo prima di renderlo leggibile, e una lettura sola lo perderebbe;
 *   - fermo, ma il modulo ha dei lead e non si rilegge da un'ora → si legge:
 *     il 21/09/2026 un modulo BeMade è sceso da 59 a 58 lead (Meta ne ha tolto
 *     uno). Un lead tolto e uno nuovo nello stesso quarto d'ora lascerebbero il
 *     numero uguale; così il nuovo arriva al più tardi un'ora dopo. Un modulo a
 *     zero lead non può nascondere niente in questo modo;
 *   - fermo, ma è il turno di controllo del modulo → si legge (un'ora al giorno,
 *     contro un conteggio che un giorno smettesse di muoversi);
 *   - un recupero chiesto (giorni, modulo, data) legge tutto come prima.
 * Anche qui c'è un interruttore (`saltaFermi`): spento, si legge tutto e si
 * conta quanti moduli si salterebbero, e soprattutto se in un modulo «fermo» è
 * comparso un lead che il conteggio non aveva segnalato.
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
  | "saltato_archiviato"
  | "saltato_conteggio_fermo";

export type MotivoLettura =
  | "normale"              // modulo che può ricevere lead
  | "recupero_chiesto"     // giorni o data: lo stato su Meta non conta
  | "lead_recenti"         // archiviato, ma con lead negli ultimi 30 giorni
  | "controllo_non_riuscito" // archiviato, ma non si sa se ha lead recenti
  | "turno_di_controllo"   // è l'ora di controllo del modulo
  | "controllo_orario"     // conteggio fermo, ma il modulo ha lead e non si rilegge da un'ora
  | "in_osservazione"      // archiviato e saltabile, ma il salto è spento
  | "mai_visto"            // conteggio: primo giro per questo modulo
  | "conteggio_cambiato"   // conteggio: diverso dall'ultimo visto
  | "appena_cambiato";     // conteggio: cambiato da meno di un'ora

export interface Decisione {
  esito: Esito;
  stato: StatoMeta;
  configurato: boolean;
  motivo?: MotivoLettura;
  /** Cosa dice il conteggio dei lead di Meta, quando la regola si applica. */
  conteggio?: MotivoConteggio;
}

// ── Il conteggio dei lead che dà Meta (leads_count) ─────────────────────────

/** Dopo un cambio di conteggio il modulo si rilegge a ogni giro per un'ora. */
export const FINESTRA_CALDA_MS = 60 * 60 * 1000;

/**
 * Un lead che Meta restituisce ma che il conteggio non ha mai segnalato conta
 * come «non contato» solo se era lì da più di un giro: se il conteggio arriva
 * in ritardo di qualche minuto, il giro dopo lo vede cambiato e legge.
 */
export const RITARDO_TOLLERATO_S = 15 * 60;

/**
 * Un modulo che ha dei lead si rilegge almeno ogni ora anche col conteggio
 * fermo. Un po' meno di un'ora apposta: col cron ogni 15 minuti la rilettura
 * cade proprio al quarto giro, non al quinto.
 */
export const CONTROLLO_ORARIO_MS = 55 * 60 * 1000;

/** L'ultimo conteggio visto di un modulo, come sta in meta_moduli_conteggi. */
export interface ConteggioVisto {
  n: number;
  /** Quando si è visto questo n per la prima volta (ISO). */
  cambiato: string;
  /** L'ultima lettura riuscita del modulo (ISO); manca nelle voci salvate prima del 21/09. */
  letto?: string;
}

export type MotivoConteggio =
  | "conteggio_assente"   // Meta non l'ha dato, o non è un numero: non si indovina
  | "mai_visto"           // primo giro per questo modulo
  | "conteggio_cambiato"  // è arrivato (o sparito) qualcosa
  | "appena_cambiato"     // cambiato da meno di un'ora: il lead può non essere ancora leggibile
  | "fermo";              // uguale da più di un'ora

const MOTIVI_CONTEGGIO: ReadonlyArray<MotivoConteggio> =
  ["conteggio_cambiato", "appena_cambiato", "fermo", "mai_visto", "conteggio_assente"];

/** leads_count come intero ≥ 0; null se manca o non è un intero. */
export function conteggioMeta(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Una voce della mappa salvata; null se manca o è rotta (e allora il modulo si rilegge). */
export function conteggioVisto(v: unknown): ConteggioVisto | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const n = conteggioMeta(r.n);
  const cambiato = typeof r.cambiato === "string" && Number.isFinite(Date.parse(r.cambiato)) ? r.cambiato : null;
  if (n === null || cambiato === null) return null;
  const letto = typeof r.letto === "string" && Number.isFinite(Date.parse(r.letto)) ? r.letto : null;
  return letto ? { n, cambiato, letto } : { n, cambiato };
}

/**
 * Un modulo che ha dei lead (n > 0) e non si rilegge da un'ora. Senza l'ora
 * dell'ultima lettura (voci salvate prima del 21/09) vale come da rileggere.
 */
export function daRicontrollare(visto: unknown, adessoMs: number): boolean {
  const v = conteggioVisto(visto);
  if (!v || v.n === 0) return false;
  const letto = v.letto ? Date.parse(v.letto) : NaN;
  return !Number.isFinite(letto) || adessoMs - letto >= CONTROLLO_ORARIO_MS;
}

/** Cosa dice il conteggio di questo giro rispetto all'ultimo visto. */
export function motivoConteggio(p: { attuale: unknown; visto: unknown; adessoMs: number }): MotivoConteggio {
  const n = conteggioMeta(p.attuale);
  if (n === null) return "conteggio_assente";
  const visto = conteggioVisto(p.visto);
  if (!visto) return "mai_visto";
  if (visto.n !== n) return "conteggio_cambiato";
  // Un cambio «nel futuro» (orologi diversi) vale come appena avvenuto.
  if (p.adessoMs - Date.parse(visto.cambiato) < FINESTRA_CALDA_MS) return "appena_cambiato";
  return "fermo";
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
  /**
   * Il conteggio dei lead: quello che dà Meta in questo giro e l'ultimo visto.
   * Senza, la regola del conteggio non si applica (si decide come prima).
   */
  conteggio?: { attuale: unknown; visto: unknown; adessoMs: number; saltaFermi: boolean } | null;
}): Decisione {
  const stato = statoMeta(p.statusMeta);
  const configurato = !!p.cfg;
  let base: { stato: StatoMeta; configurato: boolean; conteggio?: MotivoConteggio } = { stato, configurato };

  if (p.soloModulo && p.formId !== p.soloModulo) return { ...base, esito: "saltato_altro_modulo" };
  if (p.cfg && p.cfg.status !== "active") return { ...base, esito: "saltato_disattivato" };
  if (!p.giroAutomatico) return { ...base, esito: "letto", motivo: "recupero_chiesto" };

  if (p.conteggio) {
    const k = motivoConteggio(p.conteggio);
    base = { ...base, conteggio: k };
    if (k === "fermo") {
      if (oraDiControllo(p.formId) === p.oraUtc) return { ...base, esito: "letto", motivo: "turno_di_controllo" };
      if (daRicontrollare(p.conteggio.visto, p.conteggio.adessoMs)) {
        return { ...base, esito: "letto", motivo: "controllo_orario" };
      }
      if (p.conteggio.saltaFermi) return { ...base, esito: "saltato_conteggio_fermo" };
      // Salto spento: si prosegue con le regole di prima, e il modulo resta
      // contato fra quelli che col salto acceso non si leggerebbero.
    } else if (k !== "conteggio_assente") {
      // Il conteggio dice che qualcosa è cambiato (o non si sa da dove partire):
      // si legge, anche se il modulo è archiviato. Il conteggio è un fatto.
      return { ...base, esito: "letto", motivo: k };
    }
    // Conteggio assente: si decide come prima di averlo.
  }

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
  /** Moduli per quello che dice il loro conteggio (tutti quelli valutati). */
  perConteggio: Record<MotivoConteggio, number>;
  /** Moduli non letti perché il conteggio è fermo (salto acceso). */
  saltatiConteggio: number;
  /** Col salto spento: quanti moduli col conteggio fermo non si leggerebbero. */
  saltabiliConteggio: number;
  /** Moduli col conteggio fermo letti comunque nel loro turno di controllo. */
  fermiLettiPerControllo: number;
  /**
   * Lead nuovi (il webhook non li aveva portati) trovati in moduli col conteggio
   * fermo. Col salto acceso sarebbero arrivati più tardi: devono restare zero.
   */
  leadNuoviDaFermi: number;
  /**
   * Lead che Meta restituisce in moduli col conteggio fermo, creati dopo
   * l'ultimo cambio e da più di un giro: il conteggio non li ha segnalati.
   */
  leadNonContati: number;
  /** Chiamate fatte a Facebook. */
  chiamate: number;
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
    perConteggio: { conteggio_cambiato: 0, appena_cambiato: 0, fermo: 0, mai_visto: 0, conteggio_assente: 0 },
    saltatiConteggio: 0,
    saltabiliConteggio: 0,
    fermiLettiPerControllo: 0,
    leadNuoviDaFermi: 0,
    leadNonContati: 0,
    chiamate: 0,
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
  if (d.conteggio) c.perConteggio[d.conteggio]++;
  const fermo = d.conteggio === "fermo";
  if (d.esito === "saltato_disattivato") c.saltatiDisattivati++;
  else if (d.esito === "saltato_archiviato") c.saltatiArchiviati++;
  else if (d.esito === "saltato_conteggio_fermo") c.saltatiConteggio++;
  else {
    c.letti++;
    if (d.motivo === "lead_recenti") c.archiviatiConLeadRecenti++;
    if (d.motivo === "in_osservazione") c.saltabili++;
    if (fermo) {
      if (d.motivo === "turno_di_controllo" || d.motivo === "controllo_orario") c.fermiLettiPerControllo++;
      else c.saltabiliConteggio++;
    } else if (d.motivo === "turno_di_controllo" || d.motivo === "controllo_non_riuscito") {
      c.archiviatiLettiPerControllo++;
    }
  }
}

// Col salto spento i moduli si leggono tutti: si scrive quanti se ne salterebbero.
const saltabili = (c: ConteggiPagina): string => (c.saltabili > 0 ? ` (salto spento: saltabili=${c.saltabili})` : "");

// Cosa dice il conteggio: i motivi con almeno un modulo, nell'ordine di MOTIVI_CONTEGGIO.
const elencoConteggio = (c: ConteggiPagina): string =>
  MOTIVI_CONTEGGIO.filter((k) => c.perConteggio[k] > 0).map((k) => `${k}=${c.perConteggio[k]}`).join(" ") || "nessuno";

// Il conteggio: quanti moduli si sono saltati (o si salterebbero, col salto
// spento) e i due numeri che dicono se ci si può fidare.
const partiConteggio = (c: ConteggiPagina): string =>
  `conteggio(${elencoConteggio(c)}) saltati_per_conteggio=${c.saltatiConteggio}` +
  (c.saltabiliConteggio > 0 ? ` (salto spento: saltabili=${c.saltabiliConteggio})` : "") +
  ` fermi_letti_per_controllo=${c.fermiLettiPerControllo}` +
  ` lead_nuovi_da_fermi=${c.leadNuoviDaFermi} lead_non_contati=${c.leadNonContati}`;

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
    `${partiConteggio(c)} ` +
    `lead_nuovi=${c.leadNuovi} lead_nuovi_da_archiviati=${c.leadNuoviDaArchiviati} chiamate=${c.chiamate} errori=${c.errori} ms=${p.ms}`;
}

/** La riga di log del giro intero: i totali di tutte le pagine e quanto è durato. */
export function rigaGiro(p: { pagine: number; ms: number; c: ConteggiPagina; automatico: boolean }): string {
  const c = p.c;
  return `meta-leads-backfill: giro ${p.automatico ? "automatico" : "di recupero"} — pagine=${p.pagine} ` +
    `moduli=${c.moduli} (${elencoStati(c.perStato)}) ` +
    `non_configurati=${c.nonConfigurati} (${elencoStati(c.nonConfiguratiPerStato)}) ` +
    `letti=${c.letti} saltati_archiviati=${c.saltatiArchiviati}${saltabili(c)} saltati_disattivati=${c.saltatiDisattivati} ` +
    `archiviati_con_lead_recenti=${c.archiviatiConLeadRecenti} ` +
    `${partiConteggio(c)} ` +
    `lead_nuovi=${c.leadNuovi} lead_nuovi_da_archiviati=${c.leadNuoviDaArchiviati} chiamate=${c.chiamate} errori=${c.errori} ms=${p.ms}`;
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
  totale.saltatiConteggio += c.saltatiConteggio;
  totale.saltabiliConteggio += c.saltabiliConteggio;
  totale.fermiLettiPerControllo += c.fermiLettiPerControllo;
  totale.leadNuoviDaFermi += c.leadNuoviDaFermi;
  totale.leadNonContati += c.leadNonContati;
  totale.chiamate += c.chiamate;
  for (const k of MOTIVI_CONTEGGIO) totale.perConteggio[k] += c.perConteggio[k];
  for (const k of Object.keys(c.perStato) as StatoMeta[]) {
    totale.perStato[k] += c.perStato[k];
    totale.nonConfiguratiPerStato[k] += c.nonConfiguratiPerStato[k];
  }
}

/**
 * La mappa dei conteggi da salvare dopo il giro di una pagina.
 *
 * Il conteggio di un modulo si aggiorna SOLO se il modulo è stato letto fino in
 * fondo in questo giro: se la lettura è fallita, o il modulo non si è letto,
 * resta quello di prima — così al giro dopo il conteggio risulta ancora
 * diverso e il modulo si rilegge. È la stessa regola di last_pull_at.
 *
 * `cambiato` è l'ora in cui si è visto un numero nuovo per la prima volta: da lì
 * parte l'ora in cui il modulo si rilegge comunque. `letto` è l'ultima lettura
 * riuscita: un modulo con dei lead si rilegge quando è passata un'ora.
 */
export function conteggiDaSalvare(p: {
  /** La mappa letta dal database, anche rotta o vuota. */
  precedenti: unknown;
  /** leads_count dato da Meta in questo giro, per modulo. */
  visti: ReadonlyMap<string, unknown>;
  /** I moduli letti fino in fondo in questo giro. */
  lettiBene: ReadonlySet<string>;
  /** Tutti i moduli elencati da Meta; null se l'elenco è incompleto (allora non si butta via niente). */
  moduliSuMeta: ReadonlySet<string> | null;
  /** Quando si è osservato il conteggio (inizio del giro sulla pagina). */
  adessoIso: string;
}): Record<string, ConteggioVisto> {
  const fuori: Record<string, ConteggioVisto> = {};
  const prec = p.precedenti && typeof p.precedenti === "object" && !Array.isArray(p.precedenti)
    ? p.precedenti as Record<string, unknown>
    : {};
  for (const [formId, v] of Object.entries(prec)) {
    // Un modulo che Meta non elenca più (eliminato) si toglie, ma solo se
    // l'elenco è completo.
    if (p.moduliSuMeta && !p.moduliSuMeta.has(formId)) continue;
    const visto = conteggioVisto(v);
    if (visto) fuori[formId] = visto;
  }
  for (const formId of p.lettiBene) {
    const n = conteggioMeta(p.visti.get(formId));
    if (n === null) continue; // senza conteggio non c'è niente da ricordare
    const prima = fuori[formId];
    const cambiato = prima && prima.n === n ? prima.cambiato : p.adessoIso;
    fuori[formId] = { n, cambiato, letto: p.adessoIso };
  }
  return fuori;
}

/**
 * L'ora di creazione di un lead in secondi Unix. Graph la dà come
 * «2026-09-20T12:02:43+0000», il webhook in secondi: si accettano tutte e due.
 */
export function secondiCreazione(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.floor(v) : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const t = v.trim();
  if (/^\d+$/.test(t)) return Number(t);
  // «+0000» senza i due punti non piace a tutti i lettori di date
  const ms = Date.parse(t.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
