/**
 * «Ore e persone» della commessa: per ogni persona i giorni lavorati, le ore
 * registrate (da rapportino o dall'ufficio, confermate o in attesa) e le ore
 * timbrate sullo stesso cantiere, per vedere subito chi non torna.
 * Modulo puro: niente React, niente Supabase.
 */
import { summarizeCampoTime, campoDayWindow, type CampoPunch } from "@/lib/campo/timeSummary";
import { campoWorkDay, shiftWorkDay } from "@/lib/campo/workDay";
import type { DailyHoursLine, DailyHoursPerson } from "@/lib/orders/dailyHours";

export interface RigaPersona {
  employeeId: string;
  nome: string;
  giorni: number;
  ore: number;
  oreConfermate: number;
  oreInAttesa: number;
  oreUfficio: number;
  oreRapportino: number;
  ultimoGiorno: string | null;
  /** Ore timbrate su questa commessa nel periodo; null = la persona non timbra (o non ha l'app). */
  oreTimbrate: number | null;
  costo: number | null;
}

/** Oltre questa differenza (in ore) la riga va guardata. */
export const SCARTO_DA_GUARDARE = 0.5;

/** Ore timbrate per giorno su una commessa, a partire da tutte le timbrature della persona. */
export function oreTimbratePerGiorno(punches: readonly CampoPunch[], orderId: string, now = new Date()): Map<string, number> {
  const giorni = new Set(punches.map((p) => campoWorkDay(new Date(p.timestamp_evento))));
  const perGiorno = new Map<string, number>();
  for (const giorno of giorni) {
    const finestra = campoDayWindow(giorno);
    const r = summarizeCampoTime(punches, { start: finestra.start, end: finestra.end, now });
    const minuti = r.byOrder.get(orderId)?.workMinutes ?? 0;
    if (minuti > 0) perGiorno.set(giorno, Math.round((minuti / 60) * 100) / 100);
  }
  return perGiorno;
}

export function righePerPersona(
  lines: readonly DailyHoursLine[],
  persone: readonly DailyHoursPerson[],
  timbrate: ReadonlyMap<string, number> = new Map(),
): RigaPersona[] {
  const perId = new Map<string, RigaPersona & { giorniSet: Set<string>; costoNoto: boolean }>();
  const nome = (id: string) => persone.find((p) => p.id === id)?.name || "Persona non più in elenco";
  for (const l of lines) {
    const r = perId.get(l.employeeId) ?? {
      employeeId: l.employeeId, nome: nome(l.employeeId), giorni: 0, ore: 0, oreConfermate: 0, oreInAttesa: 0,
      oreUfficio: 0, oreRapportino: 0, ultimoGiorno: null, oreTimbrate: null, costo: 0, giorniSet: new Set<string>(), costoNoto: true,
    };
    r.giorniSet.add(l.day);
    r.ore += l.hours;
    if (l.pending) r.oreInAttesa += l.hours; else r.oreConfermate += l.hours;
    if (l.office) r.oreUfficio += l.hours; else r.oreRapportino += l.hours;
    if (!r.ultimoGiorno || l.day > r.ultimoGiorno) r.ultimoGiorno = l.day;
    if (!l.pending) {
      if (l.cost == null) r.costoNoto = false; else r.costo = (r.costo ?? 0) + l.cost;
    }
    perId.set(l.employeeId, r);
  }
  // Chi ha timbrato sulla commessa ma non ha ore registrate: proprio quelli da guardare.
  for (const [employeeId, ore] of timbrate) {
    if (!perId.has(employeeId) && ore > 0) {
      perId.set(employeeId, {
        employeeId, nome: nome(employeeId), giorni: 0, ore: 0, oreConfermate: 0, oreInAttesa: 0, oreUfficio: 0,
        oreRapportino: 0, ultimoGiorno: null, oreTimbrate: null, costo: 0, giorniSet: new Set(), costoNoto: true,
      });
    }
  }
  return [...perId.values()].map(({ giorniSet, costoNoto, ...r }) => ({
    ...r,
    giorni: giorniSet.size,
    ore: arrotonda(r.ore), oreConfermate: arrotonda(r.oreConfermate), oreInAttesa: arrotonda(r.oreInAttesa),
    oreUfficio: arrotonda(r.oreUfficio), oreRapportino: arrotonda(r.oreRapportino),
    oreTimbrate: timbrate.has(r.employeeId) ? arrotonda(timbrate.get(r.employeeId)!) : null,
    costo: costoNoto ? r.costo : null,
  })).sort((a, b) => b.ore - a.ore || a.nome.localeCompare(b.nome, "it"));
}

/** Ore registrate e timbrate non tornano: c'è un dato da controllare. */
export function daGuardare(r: RigaPersona): boolean {
  return r.oreTimbrate != null && Math.abs(r.ore - r.oreTimbrate) > SCARTO_DA_GUARDARE;
}

/** Il periodo «tutta la commessa»: dall'inizio lavori (o dalla creazione) a oggi, al massimo un anno. */
export function periodoCommessa(inizio: string | null | undefined, oggi = campoWorkDay()): { da: string; a: string; tagliato: boolean } {
  const unAnnoFa = shiftWorkDay(oggi, -366);
  const partenza = inizio && /^\d{4}-\d{2}-\d{2}/.test(inizio) ? inizio.slice(0, 10) : unAnnoFa;
  const da = partenza > oggi ? oggi : partenza < unAnnoFa ? unAnnoFa : partenza;
  return { da, a: oggi, tagliato: partenza < unAnnoFa };
}

/** I giorni tra due date (comprese), opzionalmente senza sabato e domenica. */
export function giorniTra(da: string, a: string, soloFeriali: boolean): string[] {
  const giorni: string[] = [];
  if (!da || !a || a < da) return giorni;
  for (let g = da, i = 0; g <= a && i < 62; g = shiftWorkDay(g, 1), i++) {
    const giornoSettimana = new Date(`${g}T12:00:00Z`).getUTCDay();
    if (soloFeriali && (giornoSettimana === 0 || giornoSettimana === 6)) continue;
    giorni.push(g);
  }
  return giorni;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;
