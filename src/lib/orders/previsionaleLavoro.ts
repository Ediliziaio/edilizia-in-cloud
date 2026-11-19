import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import type { GiornoLavorativo } from "./sottofasi";
import { plannedLaborCost } from "./laborEconomics";

export const INTERA_COMMESSA = "commessa";

export interface AmbitoLavoro {
  id: string;
  nome: string;
  faseId: string | null;
  voceId?: string | null;
  sottofaseId?: string | null;
  dal?: string | null;
  al?: string | null;
}

export function ambitiOperativi(scelte: readonly AmbitoLavoro[]): AmbitoLavoro[] {
  const fasi = new Set(scelte.filter((s) => s.id === s.faseId).map((s) => s.id));
  const visti = new Set<string>();
  return scelte.filter((s) => {
    if (s.id !== s.faseId && s.faseId && fasi.has(s.faseId)) return false;
    const chiave = s.sottofaseId ?? s.id;
    if (visti.has(chiave)) return false;
    visti.add(chiave);
    return true;
  });
}

export function vociDelSubappalto(scelte: readonly AmbitoLavoro[], albero: readonly AmbitoLavoro[]): string[] {
  const ids = new Set(scelte.flatMap((s) => s.voceId ? [s.voceId] : []));
  const fasi = new Set(scelte.filter((s) => s.id === s.faseId).map((s) => s.id));
  const intera = scelte.some((s) => s.id === INTERA_COMMESSA);
  for (const voce of albero) {
    if (voce.voceId && (intera || (voce.faseId && fasi.has(voce.faseId)))) ids.add(voce.voceId);
  }
  return [...ids];
}

export function giorniPrevisti(dal: string, al: string, lavorativo: GiornoLavorativo): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dal) || !/^\d{4}-\d{2}-\d{2}$/.test(al)) return null;
  const inizio = parseISO(dal);
  const fine = parseISO(al);
  if (!isValid(inizio) || !isValid(fine)) return null;
  const distanza = differenceInCalendarDays(fine, inizio);
  if (distanza < 0 || distanza >= 3650) return null;
  let giorni = 0;
  for (let i = 0; i <= distanza; i++) {
    if (lavorativo(format(addDays(inizio, i), "yyyy-MM-dd"))) giorni++;
  }
  return giorni;
}

export function previsionalePersone(
  persone: readonly { id: string; tariffa: number | null }[],
  orePerPersona: number,
  lavorazioni: number,
) {
  const uniche = [...new Map(persone.map((p) => [p.id, p])).values()];
  const ripartizione = Array.from({ length: lavorazioni }, (_, indice) => {
    const totale = Math.round(orePerPersona * 1_000_000);
    return (Math.floor(totale / lavorazioni) + Number(indice < totale % lavorazioni)) / 1_000_000;
  });
  let centesimi = 0;
  let mancanti = 0;
  for (const p of uniche) {
    const costi = ripartizione.map((ore) => plannedLaborCost(ore, p.tariffa));
    if (p.tariffa == null || costi.some((costo) => costo == null)) {
      mancanti++;
      continue;
    }
    for (const costo of costi) centesimi += Math.round((costo ?? 0) * 100);
  }
  return { costo: centesimi / 100, mancanti, ripartizione };
}
