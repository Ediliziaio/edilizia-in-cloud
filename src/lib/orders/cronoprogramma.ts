/**
 * Cronoprogramma della commessa (06/10/2026): le fasi nel tempo, previste e
 * reali, con ritardi, traguardi e avanzamento, per la vista «Cronoprogramma»
 * del cantiere.
 *
 * Date reali delle fasi:
 * - inizio: il primo rapportino inviato o approvato che indica la fase tra
 *   quelle lavorate (campo_rapportini.fasi_lavorate), anche con 0 ore;
 * - fine: per una fase completata, il giorno in cui è stata chiusa
 *   (completata_il), altrimenti l'ultimo rapportino sulla fase.
 * Le date sono giorni di calendario «yyyy-MM-dd»: i conti si fanno in UTC,
 * senza ore né fusi orari.
 */

export type StatoFase = "da_iniziare" | "in_corso" | "completata";

export interface RapportinoFasi {
  data_lavoro: string;
  stato: string | null;
  fasi_lavorate: unknown;
}

export interface LavoroReale {
  primo: string;
  ultimo: string;
  ore: number;
  rapportini: number;
}

export interface FaseInput {
  id: string;
  name: string;
  status: StatoFase;
  percentuale: number;
  start_date: string | null;
  end_date: string | null;
  /** Giorno di chiusura «yyyy-MM-dd», se registrato. */
  completata_il: string | null;
}

export interface FaseCrono {
  id: string;
  nome: string;
  stato: StatoFase;
  /** 0–100; una fase completata vale 100. */
  avanzamento: number;
  previstoInizio: string | null;
  previstoFine: string | null;
  realeInizio: string | null;
  realeFine: string | null;
  /** La fine reale è il giorno di chiusura registrato (non l'ultimo rapportino). */
  chiusuraRegistrata: boolean;
  /** Giorni oltre la fine prevista: chiusa tardi, o ancora aperta a fine prevista passata. */
  ritardoFine: number;
  /** Giorni di ritardo sull'inizio: iniziata tardi, o non ancora iniziata a inizio previsto passato. */
  ritardoInizio: number;
  /** Ore dichiarate nei rapportini. */
  ore: number;
}

export type TipoTraguardo = "contratto" | "apertura" | "inizio_lavori" | "fine_lavori" | "consegna";

export interface Traguardo {
  tipo: TipoTraguardo;
  data: string;
  etichetta: string;
}

export interface Asse {
  da: string;
  a: string;
  giorni: number;
}

const GIORNO_MS = 86_400_000;

/** Numero del giorno (UTC) di una data «yyyy-MM-dd». */
export function numeroGiorno(iso: string): number {
  const [anno, mese, giorno] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(anno, (mese || 1) - 1, giorno || 1) / GIORNO_MS;
}

/** Il giorno di calendario, nel fuso di chi guarda, di un istante (timestamptz). */
export function giornoLocale(istante: string): string {
  const d = new Date(istante);
  if (Number.isNaN(d.getTime())) return istante.slice(0, 10);
  const due = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}

export function giorniTra(da: string, a: string): number {
  return numeroGiorno(a) - numeroGiorno(da);
}

export function aggiungiGiorni(iso: string, giorni: number): string {
  return new Date((numeroGiorno(iso) + giorni) * GIORNO_MS).toISOString().slice(0, 10);
}

const STATI_VALIDI = new Set(["inviato", "approvato"]);

/** Per ogni fase: primo e ultimo giorno di lavoro e ore, dai rapportini inviati o approvati. */
export function lavoroRealeFasi(rapportini: ReadonlyArray<RapportinoFasi>): Map<string, LavoroReale> {
  const fasi = new Map<string, LavoroReale>();
  for (const r of rapportini) {
    if (!r.data_lavoro || !STATI_VALIDI.has(String(r.stato ?? ""))) continue;
    const giorno = r.data_lavoro.slice(0, 10);
    for (const voce of Array.isArray(r.fasi_lavorate) ? r.fasi_lavorate : []) {
      if (!voce || typeof voce !== "object") continue;
      const id = (voce as { phase_id?: unknown }).phase_id;
      if (typeof id !== "string" || !id) continue;
      const ore = Number((voce as { ore?: unknown }).ore) || 0;
      const lavoro = fasi.get(id);
      if (!lavoro) {
        fasi.set(id, { primo: giorno, ultimo: giorno, ore, rapportini: 1 });
        continue;
      }
      if (giorno < lavoro.primo) lavoro.primo = giorno;
      if (giorno > lavoro.ultimo) lavoro.ultimo = giorno;
      lavoro.ore += ore;
      lavoro.rapportini += 1;
    }
  }
  return fasi;
}

export function fasiCronoprogramma(
  fasi: ReadonlyArray<FaseInput>,
  reale: ReadonlyMap<string, LavoroReale>,
  oggi: string,
): FaseCrono[] {
  return fasi.map((f) => {
    const lavoro = reale.get(f.id);
    const completata = f.status === "completata";
    const realeInizio = lavoro?.primo ?? null;
    const realeFine = completata ? (f.completata_il ?? lavoro?.ultimo ?? null) : null;

    let ritardoFine = 0;
    if (f.end_date) {
      if (completata && realeFine) ritardoFine = Math.max(0, giorniTra(f.end_date, realeFine));
      else if (!completata) ritardoFine = Math.max(0, giorniTra(f.end_date, oggi));
    }
    let ritardoInizio = 0;
    if (f.start_date) {
      if (realeInizio) ritardoInizio = Math.max(0, giorniTra(f.start_date, realeInizio));
      else if (f.status === "da_iniziare") ritardoInizio = Math.max(0, giorniTra(f.start_date, oggi));
    }

    return {
      id: f.id,
      nome: f.name,
      stato: f.status,
      avanzamento: completata ? 100 : Math.min(100, Math.max(0, Math.round(Number(f.percentuale) || 0))),
      previstoInizio: f.start_date,
      previstoFine: f.end_date,
      realeInizio,
      realeFine,
      chiusuraRegistrata: completata && !!f.completata_il,
      ritardoFine,
      ritardoInizio,
      ore: lavoro?.ore ?? 0,
    };
  });
}

/**
 * Il ritardo da mostrare per una fase. Conta la fine: chiusa dopo la fine
 * prevista, o ancora aperta con la fine prevista passata. Una fase chiusa in
 * tempo non è in ritardo anche se è partita tardi. Per una fase aperta con la
 * fine ancora davanti si segnala l'inizio mancato o tardivo, a parte.
 */
export function ritardoFase(f: Pick<FaseCrono, "stato" | "ritardoInizio" | "ritardoFine">): { giorni: number; su: "fine" | "inizio" } | null {
  if (f.ritardoFine > 0) return { giorni: f.ritardoFine, su: "fine" };
  if (f.stato !== "completata" && f.ritardoInizio > 0) return { giorni: f.ritardoInizio, su: "inizio" };
  return null;
}

/** Come sono andati i tempi di una fase, per la riga «Quando». */
export type EsitoTempi =
  /** chiusa entro la fine prevista */
  | "finita_in_tempo"
  /** chiusa dopo la fine prevista */
  | "finita_in_ritardo"
  /** chiusa, ma senza data di fine reale (né chiusura registrata né rapportini) */
  | "finita"
  /** ancora aperta (in corso o da iniziare) con la fine prevista passata */
  | "aperta_oltre"
  /** da iniziare con l'inizio previsto passato, la fine ancora davanti */
  | "in_ritardo_inizio"
  /** in corso entro la fine prevista */
  | "in_corso"
  /** da iniziare, nei tempi */
  | "da_iniziare";

export interface ConfrontoTempi {
  esito: EsitoTempi;
  /** Giorni previsti, inizio e fine compresi; null senza le due date. */
  giorniPrevisti: number | null;
  /** Giorni reali dal primo rapportino alla fine reale, o a oggi se aperta; null senza inizio reale. */
  giorniReali: number | null;
  /** Giorni di ritardo: sulla fine, o sull'inizio per «in_ritardo_inizio» e per una in corso partita tardi. */
  ritardo: number;
  /** Giorni che mancano alla fine prevista, per una fase in corso. */
  mancano: number | null;
}

/**
 * Il paragone tra tempi previsti e reali di una fase (06/10/2026): quanti
 * giorni erano previsti, quanti ce ne sono voluti (o da quanti è aperta) e di
 * quanto si è sforato. Le regole del ritardo sono quelle del cronoprogramma.
 */
export function confrontoTempi(f: FaseCrono, oggi: string): ConfrontoTempi {
  const giorniPrevisti = f.previstoInizio && f.previstoFine ? Math.max(1, giorniTra(f.previstoInizio, f.previstoFine) + 1) : null;
  const durata = (fine: string | null) => (f.realeInizio && fine ? Math.max(1, giorniTra(f.realeInizio, fine) + 1) : null);
  // Chiusa senza giorno di chiusura e con un giorno solo di rapportini: quel
  // giorno non dice quanto è durata (il resto del lavoro non ha rapportini).
  const durataChiusa = () => (!f.chiusuraRegistrata && f.realeInizio === f.realeFine ? null : durata(f.realeFine));
  const base = { giorniPrevisti, giorniReali: null as number | null, ritardo: 0, mancano: null as number | null };

  if (f.stato === "completata") {
    if (!f.realeFine || !f.previstoFine) return { ...base, esito: "finita", giorniReali: durataChiusa() };
    return {
      ...base,
      esito: f.ritardoFine > 0 ? "finita_in_ritardo" : "finita_in_tempo",
      giorniReali: durataChiusa(),
      ritardo: f.ritardoFine,
    };
  }
  if (f.ritardoFine > 0) return { ...base, esito: "aperta_oltre", giorniReali: durata(oggi), ritardo: f.ritardoFine };
  if (f.stato === "da_iniziare") {
    return f.ritardoInizio > 0 ? { ...base, esito: "in_ritardo_inizio", ritardo: f.ritardoInizio } : { ...base, esito: "da_iniziare" };
  }
  return {
    ...base,
    esito: "in_corso",
    giorniReali: durata(oggi),
    ritardo: f.ritardoInizio,
    mancano: f.previstoFine ? Math.max(0, giorniTra(oggi, f.previstoFine)) : null,
  };
}

/**
 * I traguardi della commessa: il contratto (la firma del preventivo collegato;
 * senza firma l'apertura della commessa, che si chiama così e non «contratto»),
 * e se ci sono inizio e fine lavori previsti e consegna.
 */
export function traguardiCommessa(input: {
  firmaPreventivo: string | null;
  aperturaCommessa: string;
  inizioLavori: string | null;
  fineLavori: string | null;
  consegna: string | null;
}): Traguardo[] {
  const traguardi: Traguardo[] = [
    input.firmaPreventivo
      ? { tipo: "contratto", data: input.firmaPreventivo, etichetta: "Contratto firmato" }
      : { tipo: "apertura", data: input.aperturaCommessa, etichetta: "Commessa aperta" },
  ];
  if (input.inizioLavori) traguardi.push({ tipo: "inizio_lavori", data: input.inizioLavori, etichetta: "Inizio lavori previsto" });
  if (input.fineLavori) traguardi.push({ tipo: "fine_lavori", data: input.fineLavori, etichetta: "Fine lavori prevista" });
  if (input.consegna) traguardi.push({ tipo: "consegna", data: input.consegna, etichetta: "Consegna prevista" });
  return traguardi.sort((a, b) => a.data.localeCompare(b.data));
}

/** L'asse del tempo: da tre giorni prima della data più vecchia a tre dopo la più recente, oggi compreso. */
export function intervalloCronoprogramma(
  fasi: ReadonlyArray<FaseCrono>,
  traguardi: ReadonlyArray<Traguardo>,
  oggi: string,
): Asse {
  const date: string[] = [oggi, ...traguardi.map((t) => t.data)];
  for (const f of fasi) {
    for (const d of [f.previstoInizio, f.previstoFine, f.realeInizio, f.realeFine]) if (d) date.push(d);
  }
  date.sort();
  const da = aggiungiGiorni(date[0], -3);
  const a = aggiungiGiorni(date[date.length - 1], 3);
  return { da, a, giorni: giorniTra(da, a) + 1 };
}

/** Posizione e larghezza, in % dell'asse, di un intervallo di giorni (estremi compresi), tagliato ai bordi. */
export function barra(da: string, a: string, asse: Pick<Asse, "da" | "giorni">): { left: number; width: number } {
  const inizio = Math.max(0, giorniTra(asse.da, da));
  const fine = Math.min(asse.giorni - 1, giorniTra(asse.da, a));
  return {
    left: (inizio / asse.giorni) * 100,
    width: (Math.max(0, fine - inizio + 1) / asse.giorni) * 100,
  };
}

/** Le tacche dell'asse: i lunedì fino a 120 giorni, oltre i primi del mese. */
export function tacche(asse: Asse): Array<{ data: string; left: number; mese: boolean }> {
  const mese = asse.giorni > 120;
  const out: Array<{ data: string; left: number; mese: boolean }> = [];
  for (let i = 0; i < asse.giorni; i++) {
    const data = aggiungiGiorni(asse.da, i);
    const d = new Date(numeroGiorno(data) * GIORNO_MS);
    const segna = mese ? d.getUTCDate() === 1 : d.getUTCDay() === 1;
    if (segna) out.push({ data, left: (i / asse.giorni) * 100, mese });
  }
  return out;
}

/**
 * Avanzamento della commessa: la media delle percentuali delle fasi, una fase
 * completata vale 100. È lo stesso conto della testata della commessa
 * («Avanzamento» sotto lo stato), che alimenta anche eseguito-contro-incassato
 * e la proiezione del margine: due numeri diversi sulla stessa pagina
 * sembrerebbero un errore.
 */
export function avanzamentoComplessivo(fasi: ReadonlyArray<Pick<FaseCrono, "avanzamento">>): number {
  if (fasi.length === 0) return 0;
  return Math.round(fasi.reduce((s, f) => s + f.avanzamento, 0) / fasi.length);
}
