import { differenceInCalendarDays, parseISO, isValid } from "date-fns";
export type BaseCostoMezzo = "totale" | "giorno" | "settimana" | "mese";
export interface CostoPianoMezzo {
  tariffa: number;
  base: BaseCostoMezzo;
  extra: number;
  fornitore: string | null;
  supplier_id?: string | null;
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
}
export function costoPianoMezzo(
  p: Pick<PianoMezzo, "dal" | "al">,
  c: CostoPianoMezzo,
): number | null {
  if (c.base === "totale") return Math.round((c.tariffa + c.extra) * 100) / 100;
  if (!p.al || !isValid(parseISO(p.dal)) || !isValid(parseISO(p.al)))
    return null;
  const giorni = differenceInCalendarDays(parseISO(p.al), parseISO(p.dal)) + 1;
  if (giorni <= 0) return null;
  // Tariffa dell'assegnazione, non per pezzo; settimana e mese sono pro-rata.
  return (
    Math.round(
      ((c.tariffa * giorni) / { giorno: 1, settimana: 7, mese: 30 }[c.base] +
        c.extra) *
        100,
    ) / 100
  );
}
export function statoPianoMezzo(
  p: Pick<PianoMezzo, "annullato" | "dal" | "al">,
  oggi: string,
) {
  return p.annullato
    ? "Annullato"
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
export function pianoAttivo(p: Pick<PianoMezzo, "annullato" | "al">, oggi: string) {
  return !p.annullato && (!p.al || p.al >= oggi);
}

export function righeMezziCantiere(piani: PianoMezzo[], presenti: PresenzaMezzo[], oggi: string): RigaMezzoCantiere[] {
  const usate = new Set<PresenzaMezzo>();
  const righe: RigaMezzoCantiere[] = piani
    .filter((p) => pianoAttivo(p, oggi))
    .sort((a, b) => a.dal.localeCompare(b.dal))
    .map((p) => {
      const presenza = presenti.find((x) => x.mezzo_id === p.mezzo_id && !usate.has(x)) ?? null;
      if (presenza) usate.add(presenza);
      const stato: StatoMezzoCantiere = presenza ? "sul_cantiere" : p.dal > oggi ? "prenotato" : "atteso";
      return { chiave: p.id, mezzo_id: p.mezzo_id, piano: p, presenza, stato };
    });
  // Sul cantiere senza prenotazione: messo lì direttamente, o dal telefono.
  for (const x of presenti)
    if (!usate.has(x))
      righe.push({ chiave: `presenza-${x.allocazione_id ?? x.mezzo_id}`, mezzo_id: x.mezzo_id, piano: null, presenza: x, stato: "sul_cantiere" });
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
