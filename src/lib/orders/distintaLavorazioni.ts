/**
 * La distinta delle lavorazioni: una riga per ogni voce o sottofase della commessa, per
 * i cantieri con centinaia di voci. Modulo puro: righe, filtri e totali stanno qui.
 *
 * Una voce può non avere ancora una sottofase e una sottofase può non avere una voce:
 * nella distinta ci sono tutte e due, una riga sola quando sono collegate.
 */
import { fineLavorativa, fineDaGiorni, primoLavorativo, type GiornoLavorativo, type Sottofase } from "./sottofasi";

export interface FaseDistinta {
  id: string;
  name: string;
  position?: number;
  /** L'avanzamento vero della fase: da sottofasi, a mano o dai SAL. Le righe spuntate non lo dicono. */
  percentuale?: number | null;
  status?: string | null;
}

/** I numeri della fase, già al netto di sconti e IVA (economiaFasi). */
export interface EconomiaDistinta {
  venduto: number;
  costoPrevisto: number;
  costoConsuntivo: number;
}

export interface VoceDistinta {
  id: string;
  phase_id: string;
  position: number;
  descrizione: string;
  unita: string | null;
  quantita: number;
  costo_manodopera: number;
  costo_materiali: number;
  importo: number | null;
  origine_codice: string | null;
  subphase_id: string | null;
}

export interface RigaDistinta {
  key: string;
  faseId: string;
  faseNome: string;
  sottofaseId: string | null;
  voceId: string | null;
  codice: string | null;
  descrizione: string;
  quantita: number | null;
  unita: string | null;
  inizio: string | null;
  fine: string | null;
  giorni: number | null;
  /** Giorni di lavoro dichiarati dai rapportini approvati. */
  giorniLavorati: number;
  /** Dal primo rapportino approvato che la dichiara. */
  iniziata: boolean;
  fatta: boolean;
  venduto: number | null;
  /** Null se la riga non ha una voce o la voce non ha costi: non è un costo zero. */
  previsto: number | null;
}

export type FiltroDistinta = "tutte" | "da_fare" | "senza_date" | "senza_previsto" | "in_ritardo";

export const FILTRI_DISTINTA: ReadonlyArray<{ value: FiltroDistinta; label: string; soloCosti?: boolean }> = [
  { value: "tutte", label: "Tutte" },
  { value: "da_fare", label: "Da fare" },
  { value: "senza_date", label: "Senza date" },
  { value: "senza_previsto", label: "Senza previsto", soloCosti: true },
  { value: "in_ritardo", label: "In ritardo" },
];

const arrotonda = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Dalle commesse nate da un preventivo il campo contiene il numero del preventivo, uguale
 * per tutte le voci: non è il codice della lavorazione e non va mostrato come tale.
 */
function codiciVeri(voci: ReadonlyArray<VoceDistinta>): boolean {
  const codici = new Set(voci.map((v) => v.origine_codice).filter(Boolean));
  return codici.size > 1;
}

export function righeDistinta(
  fasi: ReadonlyArray<FaseDistinta>,
  sottofasiDi: ReadonlyMap<string, ReadonlyArray<Sottofase>>,
  voci: ReadonlyArray<VoceDistinta>,
): RigaDistinta[] {
  const mostraCodici = codiciVeri(voci);
  const vociDi = new Map<string, VoceDistinta[]>();
  for (const v of voci) vociDi.set(v.phase_id, [...(vociDi.get(v.phase_id) ?? []), v]);

  return fasi.flatMap((fase) => {
    const sottofasi = sottofasiDi.get(fase.id) ?? [];
    const perId = new Map(sottofasi.map((s) => [s.id, s]));
    const vociFase = [...(vociDi.get(fase.id) ?? [])].sort((a, b) => a.position - b.position);
    const conVoce = new Set(vociFase.map((v) => v.subphase_id).filter(Boolean));

    const daVoci = vociFase.map((v): RigaDistinta => {
      const s = v.subphase_id ? perId.get(v.subphase_id) : undefined;
      // Una sottofase rinominata a mano mostra il suo nome; quella nata dalla voce il testo intero.
      const rinominata = !!s && !v.descrizione.startsWith(s.name) && !s.name.includes("…");
      const costo = arrotonda(v.quantita * ((v.costo_manodopera || 0) + (v.costo_materiali || 0)));
      return {
        key: `v:${v.id}`,
        faseId: fase.id,
        faseNome: fase.name,
        sottofaseId: s?.id ?? null,
        voceId: v.id,
        codice: mostraCodici ? v.origine_codice : null,
        descrizione: rinominata ? s.name : v.descrizione,
        quantita: v.quantita,
        unita: v.unita,
        inizio: s?.data_inizio ?? null,
        fine: s?.data_fine ?? null,
        giorni: s?.giorni ?? null,
        giorniLavorati: s?.giorni_lavorati ?? 0,
        iniziata: !!s?.iniziata_il,
        // Una voce senza sottofase segue la fase: con la fase finita non resta «da fare».
        fatta: s?.fatta ?? (fase.status === "completata" || Number(fase.percentuale) >= 100),
        venduto: v.importo,
        previsto: costo > 0 ? costo : null,
      };
    });
    const soloSottofasi = sottofasi.filter((s) => !conVoce.has(s.id)).map((s): RigaDistinta => ({
      key: `s:${s.id}`,
      faseId: fase.id,
      faseNome: fase.name,
      sottofaseId: s.id,
      voceId: null,
      codice: null,
      descrizione: s.name,
      quantita: null,
      unita: null,
      inizio: s.data_inizio ?? null,
      fine: s.data_fine ?? null,
      giorni: s.giorni ?? null,
      giorniLavorati: s.giorni_lavorati ?? 0,
      iniziata: !!s.iniziata_il,
      fatta: s.fatta,
      venduto: null,
      previsto: null,
    }));
    // Prima le righe con la sottofase, nel loro ordine: è quello che Su e Giù cambiano. Poi le voci ancora senza.
    const posto = new Map(sottofasi.map((x) => [x.id, x.position]));
    const conPosto = [...daVoci.filter((r) => r.sottofaseId), ...soloSottofasi]
      .sort((a, b) => (posto.get(a.sottofaseId!) ?? 0) - (posto.get(b.sottofaseId!) ?? 0));
    return [...conPosto, ...daVoci.filter((r) => !r.sottofaseId)];
  });
}

export function rispettaFiltro(r: RigaDistinta, filtro: FiltroDistinta, oggi: string): boolean {
  switch (filtro) {
    case "da_fare": return !r.fatta;
    case "senza_date": return !r.fatta && !r.fine;
    case "senza_previsto": return r.voceId !== null && r.previsto === null;
    case "in_ritardo": return !r.fatta && !!r.fine && r.fine < oggi;
    default: return true;
  }
}

const normalizza = (s: string) => s.toLocaleLowerCase("it-IT").normalize("NFD").replace(/\p{M}/gu, "");

/** Ogni parola cercata deve comparire, in qualunque ordine, nella descrizione o nel codice. */
export function filtraDistinta(
  righe: ReadonlyArray<RigaDistinta>,
  opzioni: { testo?: string; faseId?: string | null; filtro?: FiltroDistinta; oggi: string },
): RigaDistinta[] {
  const parole = normalizza(opzioni.testo ?? "").split(/\s+/).filter(Boolean);
  return righe.filter((r) => {
    if (opzioni.faseId && r.faseId !== opzioni.faseId) return false;
    if (!rispettaFiltro(r, opzioni.filtro ?? "tutte", opzioni.oggi)) return false;
    if (parole.length === 0) return true;
    const testo = normalizza(`${r.codice ?? ""} ${r.descrizione}`);
    return parole.every((p) => testo.includes(p));
  });
}

export interface TotaliDistinta {
  righe: number;
  fatte: number;
  venduto: number;
  previsto: number;
  /** Righe con una voce ma senza costo previsto: il previsto è parziale. */
  senzaPrevisto: number;
}

export function totaliDistinta(righe: ReadonlyArray<RigaDistinta>): TotaliDistinta {
  const t: TotaliDistinta = { righe: righe.length, fatte: 0, venduto: 0, previsto: 0, senzaPrevisto: 0 };
  for (const r of righe) {
    if (r.fatta) t.fatte += 1;
    t.venduto += r.venduto ?? 0;
    t.previsto += r.previsto ?? 0;
    if (r.voceId !== null && r.previsto === null) t.senzaPrevisto += 1;
  }
  t.venduto = arrotonda(t.venduto);
  t.previsto = arrotonda(t.previsto);
  return t;
}

export function contaFiltri(righe: ReadonlyArray<RigaDistinta>, oggi: string): Record<FiltroDistinta, number> {
  const conti: Record<FiltroDistinta, number> = { tutte: righe.length, da_fare: 0, senza_date: 0, senza_previsto: 0, in_ritardo: 0 };
  for (const r of righe) {
    for (const f of ["da_fare", "senza_date", "senza_previsto", "in_ritardo"] as const) {
      if (rispettaFiltro(r, f, oggi)) conti[f] += 1;
    }
  }
  return conti;
}

/** Oltre questa soglia si parte dalla distinta: le schede una sotto l'altra non si scorrono più. */
export const SOGLIA_DISTINTA = 30;

export const distintaConsigliata = (righe: number) => righe > SOGLIA_DISTINTA;

/** Una data scritta a mano è valida se la fine non viene prima dell'inizio. */
export function dateValide(inizio: string | null, fine: string | null): boolean {
  return !inizio || !fine || fine >= inizio;
}

/**
 * Le date in blocco: quelle scritte sostituiscono, le altre restano. Il database rifiuta una
 * riga incoerente e il salvataggio si fermerebbe a metà: si controlla tutto prima di inviare.
 */
export function pianoInBlocco(
  righe: ReadonlyArray<Pick<RigaDistinta, "sottofaseId" | "descrizione" | "inizio" | "fine" | "giorni">>,
  inizio: string | null,
  fine: string | null,
): { passi: Array<{ id: string; data_inizio: string | null; data_fine: string | null; giorni: number | null }>; incoerenti: string[] } {
  const passi: Array<{ id: string; data_inizio: string | null; data_fine: string | null; giorni: number | null }> = [];
  const incoerenti: string[] = [];
  for (const r of righe) {
    if (!r.sottofaseId) continue;
    const dataInizio = inizio ?? r.inizio;
    const dataFine = fine ?? r.fine;
    if (!dateValide(dataInizio, dataFine)) incoerenti.push(r.descrizione);
    else passi.push({ id: r.sottofaseId, data_inizio: dataInizio, data_fine: dataFine, giorni: r.giorni });
  }
  return { passi, incoerenti };
}

/**
 * L'avanzamento di più fasi insieme: pesato sul venduto, se ogni fase ne ha uno;
 * altrimenti la media semplice. Null se non ci sono fasi.
 */
export function avanzamentoFasi(
  fasi: ReadonlyArray<FaseDistinta>,
  economiaDi?: ReadonlyMap<string, EconomiaDistinta>,
): number | null {
  if (fasi.length === 0) return null;
  const pesi = fasi.map((f) => economiaDi?.get(f.id)?.venduto ?? 0);
  const pesato = pesi.every((p) => p > 0);
  const totale = pesato ? pesi.reduce((s, p) => s + p, 0) : fasi.length;
  const somma = fasi.reduce((s, f, i) => s + (Number(f.percentuale) || 0) * (pesato ? pesi[i] : 1), 0);
  return Math.round(somma / totale);
}

/**
 * Le righe scelte una dopo l'altra, dalla data indicata, contando solo i giorni di lavoro. I giorni
 * scritti valgono per tutte; altrimenti quelli della riga. Le righe già fatte e quelle senza giorni restano fuori.
 */
export function dateInFila(
  righe: ReadonlyArray<Pick<RigaDistinta, "sottofaseId" | "descrizione" | "giorni" | "fatta">>,
  inizio: string,
  giorni: number | null,
  lavorativo: GiornoLavorativo,
): { passi: Array<{ id: string; data_inizio: string; data_fine: string; giorni: number }>; senzaGiorni: string[] } {
  const passi: Array<{ id: string; data_inizio: string; data_fine: string; giorni: number }> = [];
  const senzaGiorni: string[] = [];
  let cursore = primoLavorativo(inizio, lavorativo);
  for (const r of righe) {
    if (!r.sottofaseId || r.fatta) continue;
    const durata = giorni ?? r.giorni;
    if (!durata || durata < 1) { senzaGiorni.push(r.descrizione); continue; }
    const fine = fineLavorativa(cursore, durata, lavorativo);
    passi.push({ id: r.sottofaseId, data_inizio: cursore, data_fine: fine, giorni: durata });
    cursore = primoLavorativo(fineDaGiorni(fine, 2), lavorativo);
  }
  return { passi, senzaGiorni };
}

/** Il nuovo ordine di una fase spostando una sottofase di un posto; null se è già in cima o in fondo. */
export function ordineSpostando(ids: ReadonlyArray<string>, id: string, verso: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + verso;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const nuovo = [...ids];
  [nuovo[i], nuovo[j]] = [nuovo[j], nuovo[i]];
  return nuovo;
}

/** Lo stato di una voce in parole: quello che ne dicono spunta e rapportini. */
export function statoVoce(r: Pick<RigaDistinta, "fatta" | "iniziata" | "giorniLavorati" | "giorni">): { testo: string; tono: "fatta" | "corso" | "fare" } {
  if (r.fatta) return { testo: "Fatta", tono: "fatta" };
  if (r.iniziata || r.giorniLavorati > 0) return { testo: r.giorni ? `${r.giorniLavorati}/${r.giorni} gg` : `${r.giorniLavorati} gg`, tono: "corso" };
  return { testo: r.giorni ? `${r.giorni} gg` : "Da fare", tono: "fare" };
}
