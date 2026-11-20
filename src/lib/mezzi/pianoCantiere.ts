import { differenceInCalendarDays, parseISO, isValid } from "date-fns";
import type { MezzoTipo, UnitaQuantita } from "@/types/mezzi";
export type BaseCostoMezzo = "totale" | "giorno" | "settimana" | "mese";
export interface CostoPianoMezzo {
  tariffa: number;
  base: BaseCostoMezzo;
  extra: number;
  fornitore: string | null;
  supplier_id?: string | null;
  per_unita?: boolean;
  trasporto?: number;
  montaggio?: number;
  smontaggio?: number;
}
export interface PianoMezzo {
  id: string;
  company_id: string;
  order_id: string;
  mezzo_id: string;
  fase_ids: string[];
  responsabile_hr_id?: string | null;
  dal: string;
  al: string | null;
  quantita: number;
  note: string | null;
  annullato: boolean;
  rientrato_il?: string | null;
  al_concordato?: string | null;
  fornitore_id?: string | null;
  fornitore_noleggio?: string | null;
  riferimento_noleggio?: string | null;
  origine_computo_id?: string | null;
  origine_noleggio_id?: string | null;
}
export interface NuovoNoleggio {
  nome: string;
  tipo: MezzoTipo;
  unita: UnitaQuantita | null;
}
export type SalvataggioPianoMezzo = Partial<PianoMezzo> & {
  nuovo_noleggio?: NuovoNoleggio;
  arrivato_oggi?: boolean;
  costo?: CostoPianoMezzo | null;
};

export function unitaNoleggio(unita: string): UnitaQuantita | null {
  const u = unita.trim().toLowerCase();
  if (["mq", "m2", "m²"].includes(u)) return "mq";
  if (["m", "ml", "mt", "m.l."].includes(u)) return "ml";
  if (["pz", "cad", "cad.", "n", "n.", "pezzi"].includes(u)) return "pz";
  if (["mc", "m3", "m³"].includes(u)) return "mc";
  return u === "kg" ? "kg" : null;
}

export function quantitaMezzoValida(q: number, unita?: string | null) {
  return Number.isFinite(q) && q > 0 && q < 10000000000
    && Math.abs(q * 100 - Math.round(q * 100)) < 0.0001
    && (unita !== "pz" || Number.isInteger(q));
}
export function costoPianoMezzo(
  p: Pick<PianoMezzo, "dal" | "al"> & Partial<Pick<PianoMezzo, "quantita">>,
  c: CostoPianoMezzo,
): number | null {
  const extra = Number(c.extra) + Number(c.trasporto ?? 0) + Number(c.montaggio ?? 0) + Number(c.smontaggio ?? 0);
  const tariffa = Number(c.tariffa) * (c.per_unita ? (p.quantita ?? 1) : 1);
  if (c.base === "totale") return Math.round((tariffa + extra) * 100) / 100;
  if (!p.al || !isValid(parseISO(p.dal)) || !isValid(parseISO(p.al)))
    return null;
  const giorni = differenceInCalendarDays(parseISO(p.al), parseISO(p.dal)) + 1;
  if (giorni <= 0) return null;
  // Settimane e mesi sono pro rata. Le spese accessorie si aggiungono una sola volta.
  return (
    Math.round(
      ((tariffa * giorni) / { giorno: 1, settimana: 7, mese: 30 }[c.base] + extra) *
        100,
    ) / 100
  );
}
export function statoPianoMezzo(
  p: Pick<PianoMezzo, "annullato" | "dal" | "al" | "rientrato_il">,
  oggi: string,
) {
  return p.annullato
    ? "Annullato"
    : p.rientrato_il
      ? "Rientrato"
    : p.dal > oggi
      ? "Programmato"
      : p.al && p.al < oggi
        ? "Terminato"
        : "Nel periodo previsto";
}
export function pianoPerFase(p: Pick<PianoMezzo, "fase_ids">, faseId?: string) {
  return !faseId || p.fase_ids.length === 0 || p.fase_ids.includes(faseId);
}

// ── Un solo elenco dei mezzi del cantiere (31/10/2026) ──────────────────────
// La prenotazione (mezzi_piani_cantiere) e la presenza (mezzi_assegnazioni per
// i mezzi singoli, mezzi_allocazioni per quelli a quantità) restano due cose
// nel database; nella commessa diventano una riga per mezzo con uno stato.

export type StatoMezzoCantiere = "prenotato" | "atteso" | "sul_cantiere";
export interface PresenzaMezzo {
  mezzo_id: string;
  dal: string;
  /** Montaggio a quantità: serve per il rientro. */
  allocazione_id?: string;
  piano_id?: string | null;
  quantita?: number;
}
export interface RigaMezzoCantiere {
  chiave: string;
  mezzo_id: string;
  piano: PianoMezzo | null;
  presenza: PresenzaMezzo | null;
  stato: StatoMezzoCantiere;
}

/** Prenotazione ancora valida: non annullata e non finita prima di oggi. */
export function pianoAttivo(p: Pick<PianoMezzo, "annullato" | "al" | "rientrato_il">, oggi: string) {
  return !p.annullato && !p.rientrato_il && (!p.al || p.al >= oggi);
}

export function righeMezziCantiere(piani: PianoMezzo[], presenti: PresenzaMezzo[], oggi: string): RigaMezzoCantiere[] {
  const righe: RigaMezzoCantiere[] = [];
  const associate = new Set<string>();
  const iniziate = piani.filter(p => !p.annullato && !p.rientrato_il && p.dal <= oggi);
  for (const presenza of presenti) {
    const candidati = iniziate.filter(p => p.mezzo_id === presenza.mezzo_id && !associate.has(p.id));
    const compatibili = candidati.filter(p => p.dal <= presenza.dal && (!p.al || p.al >= presenza.dal));
    const piano = (presenza.piano_id
      ? candidati.find(p => p.id === presenza.piano_id)
      : compatibili.length === 1 ? compatibili[0] : null) ?? null;
    if (piano) associate.add(piano.id);
    righe.push({ chiave: piano?.id ?? `presenza-${presenza.allocazione_id ?? presenza.mezzo_id}`,
      mezzo_id: presenza.mezzo_id, piano, presenza, stato: "sul_cantiere" });
  }
  for (const piano of piani.filter(p => !associate.has(p.id) && pianoAttivo(p, oggi)).sort((a, b) => a.dal.localeCompare(b.dal))) {
    righe.push({ chiave: piano.id, mezzo_id: piano.mezzo_id, piano, presenza: null, stato: piano.dal > oggi ? "prenotato" : "atteso" });
  }
  const ordine: Record<StatoMezzoCantiere, number> = { sul_cantiere: 0, atteso: 1, prenotato: 2 };
  return righe.sort((a, b) => ordine[a.stato] - ordine[b.stato]);
}

/** Il periodo delle fasi di una prenotazione: dal primo inizio all'ultima fine. */
export function finestraFasi(
  faseIds: string[],
  fasi: Array<{ id: string; start_date: string | null; end_date: string | null }>,
): { dal: string; al: string } | null {
  const scelte = fasi.filter((f) => faseIds.includes(f.id));
  const inizi = scelte.map((f) => f.start_date).filter((x): x is string => !!x).sort();
  const fini = scelte.map((f) => f.end_date).filter((x): x is string => !!x).sort();
  return inizi.length && fini.length ? { dal: inizi[0], al: fini.at(-1)! } : null;
}

/**
 * Le fasi sono state spostate e la prenotazione è rimasta alle date vecchie.
 * Le date della prenotazione restano quelle concordate (col noleggiatore):
 * qui si segnala soltanto, l'allineamento è un clic di chi decide.
 */
export function pianoDaAllineare(
  p: Pick<PianoMezzo, "fase_ids" | "dal" | "al">,
  fasi: Array<{ id: string; start_date: string | null; end_date: string | null }>,
) {
  if (!p.fase_ids.length) return null;
  const f = finestraFasi(p.fase_ids, fasi);
  return f && (f.dal !== p.dal || f.al !== p.al) ? f : null;
}
