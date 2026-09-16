/**
 * outreach-dispatch-logic — logica PURA del dispatcher cold (niente Deno/Supabase).
 * Isolata per essere testabile in vitest (come _shared/sequenze-logic.ts).
 * Gestisce: cap effettivo con warm-up, capacità residua giornaliera per casella,
 * assegnazione round-robin dei messaggi alle caselle rispettando i cap.
 */

export interface SenderState {
  id: string;
  status: string; // 'warming' | 'active' | 'paused' | 'disabled'
  daily_cap_target: number;
  warmup_base: number;
  warmup_step: number;
  warmup_day: number;
  daily_sent: number;
  daily_sent_date: string | null; // 'YYYY-MM-DD'
}

/** Cap del giorno con ramp di warm-up: min(target, base + giorno*step). Mai negativo. */
export function effectiveDailyCap(s: SenderState): number {
  const ramped = s.warmup_base + s.warmup_day * s.warmup_step;
  return Math.max(0, Math.min(s.daily_cap_target, ramped));
}

/** Hash deterministico (FNV-1a 32-bit) → intero non negativo. Per seedare la varianza per casella+data. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Cap giornaliero "umano": il cap effettivo (warm-up + target) ridotto di una
 * frazione DETERMINISTICA che varia per casella+data, così il tetto non è sempre
 * lo stesso numero tondo (segnale innaturale per i filtri). La varianza è SOLO
 * verso il basso: il risultato è SEMPRE ≤ effectiveDailyCap (quindi ≤ daily_cap_target),
 * mai sopra. Stesso (casella, giorno) → stesso valore (idempotente tra i tick).
 *
 * - `maxReductionPct` (default 0.15 = 15%): riduzione massima sotto il cap effettivo.
 * - Sotto una piccola soglia (cap ≤ `floor`, default 5, tipico warm-up iniziale) NON
 *   si applica varianza: a volumi minimi togliere invii fa più male che bene.
 * - Floor a 1 quando il cap effettivo è ≥ 1, così la varianza non azzera mai una
 *   casella attiva (continuerebbe a non spedire all'infinito).
 */
export function dailyCapWithVariance(
  s: SenderState,
  dateKey: string,
  maxReductionPct = 0.15,
  floor = 5,
): number {
  const base = effectiveDailyCap(s);
  if (base <= floor) return base; // volumi bassi (warm-up iniziale): nessuna riduzione
  const pct = Math.max(0, Math.min(0.5, maxReductionPct));
  // frazione in [0, pct] deterministica per casella+data (1000 step di granularità)
  const frac = (fnv1a(`${s.id}|${dateKey}`) % 1000) / 1000 * pct;
  const reduced = Math.floor(base * (1 - frac));
  return Math.max(1, Math.min(base, reduced));
}

/** Inviati oggi: se il contatore è di un altro giorno vale 0 (reset implicito). */
export function sentToday(s: SenderState, today: string): number {
  return s.daily_sent_date === today ? Math.max(0, s.daily_sent) : 0;
}

/**
 * Capacità residua oggi: cap effettivo − inviati oggi. Solo caselle attive/in
 * warm-up contribuiscono; altrimenti 0.
 *
 * `varianceKey` (opzionale): se passato (es. la data 'YYYY-MM-DD' usata come seed),
 * il tetto usa `dailyCapWithVariance` → tetto "umano" (varia per casella+giorno,
 * sempre ≤ cap effettivo). Senza `varianceKey` il comportamento è IDENTICO a prima
 * (cap effettivo pieno): così la UI/`poolCapacityStats` restano stabili e i test
 * legacy invariati. Il dispatcher passa la data per spalmare in modo naturale.
 */
export function remainingToday(s: SenderState, today: string, varianceKey?: string): number {
  if (s.status !== "active" && s.status !== "warming") return 0;
  const cap = varianceKey ? dailyCapWithVariance(s, varianceKey) : effectiveDailyCap(s);
  return Math.max(0, cap - sentToday(s, today));
}

/** Capacità totale del pool nel giorno. */
export function totalCapacity(senders: SenderState[], today: string): number {
  return senders.reduce((sum, s) => sum + remainingToday(s, today), 0);
}

/** Cap a REGIME di una casella (warm-up completato): il target. Solo se eleggibile. */
export function steadyCap(s: SenderState): number {
  if (s.status !== "active" && s.status !== "warming") return 0;
  return Math.max(0, s.daily_cap_target);
}

export interface PoolCapacityStats {
  /** Caselle che contano (active/warming). */
  eligible: number;
  /** Capacità EFFETTIVA oggi (somma residui = ciò che il dispatcher può spedire ora). */
  effectiveToday: number;
  /** Capacità a regime (somma dei target, a warm-up finito). */
  steady: number;
  /** Caselle ancora in riscaldamento (cap effettivo < target). */
  warming: number;
  /**
   * Quante caselle servono per coprire `target` invii/giorno a regime, stimate
   * sul cap medio per casella del pool (target medio delle caselle eleggibili).
   * 0 se non c'è alcuna casella; -1 se la capacità a regime già copre il target.
   */
  mailboxesNeededForTarget: number;
  /** Caselle ancora da aggiungere per il target (max(0, needed − eligible)). */
  mailboxesToAdd: number;
}

/**
 * Riepilogo capacità del pool per la UI "a scala" (es. ~1000/giorno). Calcolo
 * ONESTO: la stima del numero di caselle usa il cap-target MEDIO per casella del
 * pool reale; senza caselle ricade su un default ragionevole (`fallbackCap`).
 * Pura, niente Deno/Supabase, così la stessa matematica del dispatcher alimenta la UI.
 */
export function poolCapacityStats(
  senders: SenderState[], today: string, target: number, fallbackCap = 40,
): PoolCapacityStats {
  const eligibleSenders = senders.filter((s) => s.status === "active" || s.status === "warming");
  const eligible = eligibleSenders.length;
  const effectiveToday = eligibleSenders.reduce((sum, s) => sum + remainingToday(s, today), 0);
  const steady = eligibleSenders.reduce((sum, s) => sum + steadyCap(s), 0);
  const warming = eligibleSenders.filter((s) => effectiveDailyCap(s) < s.daily_cap_target).length;

  const tgt = Math.max(0, target);
  const avgCap = eligible > 0
    ? eligibleSenders.reduce((sum, s) => sum + Math.max(1, s.daily_cap_target), 0) / eligible
    : Math.max(1, fallbackCap);
  let mailboxesNeededForTarget: number;
  if (tgt === 0) mailboxesNeededForTarget = 0;
  else if (steady >= tgt && eligible > 0) mailboxesNeededForTarget = -1; // già coperto a regime
  else mailboxesNeededForTarget = Math.ceil(tgt / avgCap);
  const mailboxesToAdd = mailboxesNeededForTarget < 0 ? 0 : Math.max(0, mailboxesNeededForTarget - eligible);

  return { eligible, effectiveToday, steady, warming, mailboxesNeededForTarget, mailboxesToAdd };
}

/** Auto-pausa se bounce/lamentele superano le soglie assolute. */
export function shouldAutoPause(
  bounceCount: number, complaintCount: number,
  maxBounces = 10, maxComplaints = 2,
): boolean {
  return bounceCount >= maxBounces || complaintCount >= maxComplaints;
}

export interface Assignment { queueId: string; senderId: string; }

/**
 * Assegna i messaggi in coda alle caselle in ROUND-ROBIN, consumando i cap.
 * Distribuisce il volume per proteggere la reputazione invece di saturare
 * una casella sola. I messaggi oltre la capacità totale restano `unassigned`
 * (verranno ripresi al tick successivo).
 */
export function assignSenders(
  queueIds: string[], senders: SenderState[], today: string, varianceKey?: string,
): { assignments: Assignment[]; unassigned: string[] } {
  // Ordine ROTAZIONE deterministico (per id): a scala (100 caselle) il round-robin
  // resta stabile e prevedibile tra i tick a prescindere dall'ordine di riga del DB,
  // così il volume si spalma in modo equo e ripetibile sul pool.
  // `varianceKey` (opzionale): se passato, il cap per-casella usa la varianza umana
  // deterministica (≤ cap effettivo); senza, comportamento legacy invariato.
  const eligible = senders
    .filter((s) => remainingToday(s, today, varianceKey) > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const remaining = new Map<string, number>();
  for (const s of eligible) remaining.set(s.id, remainingToday(s, today, varianceKey));

  const assignments: Assignment[] = [];
  const unassigned: string[] = [];
  let cursor = 0;

  for (const queueId of queueIds) {
    let placed = false;
    for (let tries = 0; tries < eligible.length; tries++) {
      const s = eligible[(cursor + tries) % eligible.length];
      const cap = remaining.get(s.id) ?? 0;
      if (cap > 0) {
        assignments.push({ queueId, senderId: s.id });
        remaining.set(s.id, cap - 1);
        cursor = (cursor + tries + 1) % eligible.length;
        placed = true;
        break;
      }
    }
    if (!placed) unassigned.push(queueId);
  }
  return { assignments, unassigned };
}

/**
 * UNA sola assegnazione per casella (`senderId`) nell'elenco: tiene la prima
 * occorrenza per casella nell'ORDINE d'ingresso, le successive tornano in coda
 * (`deferred`). `assignSenders` round-robina bene quando le caselle eleggibili
 * bastano per la coda dovuta, ma se in un tick sono dovuti più messaggi che
 * caselle il round-robin può assegnarne 2+ alla STESSA casella nello stesso
 * giro: partirebbero a pochi secondi l'uno dall'altro, non "a orari diversi".
 * Tenendo solo la prima, le altre ripartono al tick successivo — distanziati
 * per davvero (il cron gira a intervalli fissi) — così una casella non spedisce
 * mai due volte nello stesso momento. L'ordine d'ingresso decide chi vince a
 * parità di casella: il chiamante mette prima ciò che vuole prioritario (es.
 * il follow-up "sticky" di un thread aperto prima di un primo contatto nuovo).
 */
export function unaAssegnazionePerCasella(assignments: Assignment[]): { kept: Assignment[]; deferred: number } {
  const viste = new Set<string>();
  const kept: Assignment[] = [];
  let deferred = 0;
  for (const a of assignments) {
    if (viste.has(a.senderId)) { deferred++; continue; }
    viste.add(a.senderId);
    kept.push(a);
  }
  return { kept, deferred };
}

/**
 * UNA sola email per destinatario nel giro. Lo stesso indirizzo può stare in
 * più iscrizioni: il contatto di prova in otto flussi, due contatti con la
 * stessa email, un'iscrizione fatta a mano. Il 16/09/2026 quattro email di
 * Edilizia in Cloud sono arrivate a flo.andriciuc@gmail.com tra le 13:18:06 e
 * le 13:18:11, da quattro caselle diverse: nello stesso minuto, alla stessa
 * persona. Resta la prima assegnazione per indirizzo (maiuscole e spazi non
 * contano); le altre tornano in coda e ripartono al giro dopo.
 */
export function unaEmailPerDestinatario(
  assignments: Assignment[],
  indirizzo: (queueId: string) => string | null | undefined,
): { kept: Assignment[]; deferred: number } {
  const visti = new Set<string>();
  const kept: Assignment[] = [];
  let deferred = 0;
  for (const a of assignments) {
    const email = (indirizzo(a.queueId) ?? "").trim().toLowerCase();
    if (email && visti.has(email)) { deferred++; continue; }
    if (email) visti.add(email);
    kept.push(a);
  }
  return { kept, deferred };
}

/** Frazione deterministica in [0,1) da un seme testuale. */
function frazione(seme: string): number {
  return (fnv1a(seme) % 10_000) / 10_000;
}

export interface CadenzaInput {
  senderId: string;
  /** Giorno 'YYYY-MM-DD': seme della variazione, cambia ogni giorno. */
  dateKey: string;
  /** Tetto di oggi della casella (quello che userà il dispatcher). */
  capGiorno: number;
  /** Invii già fatti oggi dalla casella. */
  inviatiOggi: number;
  /** Ultimo invio della casella (`last_sent_at`), se c'è. */
  ultimoInvio: Date | null;
  ora: Date;
  /** Durata della finestra di invio effettiva, in minuti. */
  minutiFinestra: number;
  /** Minuti passati dall'apertura della finestra di oggi (negativo se non è ancora aperta). */
  minutiDallApertura: number;
}

/**
 * La casella può spedire in questo giro? Serve a SPALMARE il tetto del giorno
 * sulla finestra di invio. Con una coda lunga (una lista appena arruolata, o i
 * contatti accumulati nella notte) il dispatcher trova sempre qualcosa di
 * dovuto: senza questa regola ogni casella brucerebbe il suo tetto nei primi
 * giri — 8:00, 8:10, 8:20 — e poi silenzio fino al giorno dopo, un ritmo da
 * macchina, identico ogni giorno.
 *
 *  - Primo invio del giorno: dopo uno scarto proprio della casella, tra 0 e
 *    metà dell'intervallo medio (finestra/tetto), così le caselle non partono
 *    tutte all'apertura.
 *  - Invii successivi: la finestra RIMASTA dopo l'ultimo invio, divisa per
 *    gli invii ancora disponibili, per un fattore tra 0,5 e 0,9. Resta sempre
 *    spazio per chiudere il tetto dentro la finestra, e se si parte tardi
 *    (flusso attivato nel pomeriggio, dispatcher fermo al mattino) gli invii
 *    si stringono invece di perdersi.
 *
 * Tutto deterministico per casella, giorno e numero d'invio: due giri
 * sovrapposti danno la stessa risposta, e ogni pausa è diversa dalla prima.
 */
export function cadenzaCasella(c: CadenzaInput): { pronta: boolean; attesaMinuti: number } {
  const cap = Math.max(1, Math.floor(c.capGiorno));
  const finestra = Math.max(60, c.minutiFinestra);
  if (c.inviatiOggi <= 0 || !c.ultimoInvio) {
    const scarto = (finestra / cap) * 0.5 * frazione(`${c.senderId}|${c.dateKey}|primo`);
    const attesa = Math.max(0, scarto - c.minutiDallApertura);
    return { pronta: attesa <= 0, attesaMinuti: Math.ceil(attesa) };
  }
  const trascorsi = Math.max(0, (c.ora.getTime() - c.ultimoInvio.getTime()) / 60_000);
  const aperturaAllUltimo = c.minutiDallApertura - trascorsi;
  const rimastiMinuti = Math.max(10, finestra - aperturaAllUltimo);
  const rimastiInvii = Math.max(1, cap - c.inviatiOggi);
  const pausa = (rimastiMinuti / rimastiInvii) * (0.5 + 0.4 * frazione(`${c.senderId}|${c.dateKey}|${c.inviatiOggi}`));
  const attesa = Math.max(0, pausa - trascorsi);
  return { pronta: attesa <= 0, attesaMinuti: Math.ceil(attesa) };
}

/**
 * Tetto dei PRIMI contatti al giorno per casella, separato dai follow-up.
 *
 * Il tetto totale contava tutto insieme: con «5 nuovi al giorno» e sei
 * follow-up, a regime una casella ne spedisce 30-35, non 5 — ed è il numero
 * di sconosciuti raggiunti a decidere la reputazione, non le risposte a chi
 * già ci conosce.
 *
 * Restituisce lo stato casella da passare ad `assignSenders` per i SOLI primi
 * contatti: i posti disponibili diventano min(posti totali rimasti oggi,
 * nuovi al giorno − nuovi già spediti oggi). I follow-up spediti oggi non
 * consumano il budget dei nuovi, ma restano dentro il tetto totale.
 */
export function statoPerPrimiContatti(
  s: SenderState,
  nuoviAlGiorno: number | null | undefined,
  nuoviSpeditiOggi: number,
  today: string,
): SenderState {
  if (nuoviAlGiorno == null || !Number.isFinite(nuoviAlGiorno) || nuoviAlGiorno <= 0) return s;
  const speditiOggi = s.daily_sent_date === today ? Math.max(0, s.daily_sent) : 0;
  const postiTotali = Math.max(0, effectiveDailyCap(s) - speditiOggi);
  const postiNuovi = Math.max(0, Math.floor(nuoviAlGiorno) - Math.max(0, nuoviSpeditiOggi));
  const posti = Math.min(postiTotali, postiNuovi);
  // `effectiveDailyCap` non supera mai `daily_cap_target`: fissandolo a
  // «spediti oggi + posti» i rimanenti diventano esattamente `posti`, senza
  // toccare la rampa del warm-up.
  return { ...s, daily_cap_target: Math.min(s.daily_cap_target, speditiOggi + posti), daily_sent: speditiOggi, daily_sent_date: today };
}
