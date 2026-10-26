/**
 * Tempi e personale stimati dalle voci del computo.
 *
 * Il computo non ha ore, ha il costo di manodopera di ogni voce (per unità). Le ore-persona sono quel costo
 * diviso il costo orario della squadra: un'IPOTESI, non una misura, e come tale mostra le sue assunzioni
 * (costo orario, operai, ore al giorno, resa) e le lascia modificare. Le voci senza manodopera (fornitura
 * pura) non hanno ore e sono contate a parte; non si inventa una produttività.
 */
import type { RigaCosto } from './obiettivoMargine';

export interface AssunzioniTempi {
  /** Costo orario pieno dell'operaio, in €/h. */
  costoOrario: number;
  operai: number;
  oreGiorno: number;
  /** Quota di ore davvero produttive (trasferte, attrezzatura, attese): 10–100. */
  resaPct: number;
  giorniSettimana: number;
}

export const ASSUNZIONI_TEMPI_PREDEFINITE: AssunzioniTempi = { costoOrario: 30, operai: 2, oreGiorno: 8, resaPct: 85, giorniSettimana: 5 };

export interface CapitoloOre { nome: string; ore: number; quotaPct: number }

export type EsitoTempi =
  | { stato: 'non_valido'; motivo: string }
  | { stato: 'senza_manodopera'; voci: number }
  | {
      stato: 'ok';
      orePersona: number;
      giorniLavorativi: number;
      settimane: number;
      perCapitolo: CapitoloOre[];
      vociConManodopera: number;
      vociSenzaManodopera: number;
      /** Operai che servono per chiudere nei giorni richiesti (se richiesti). */
      operaiPerTarget: { giorni: number; operai: number } | null;
    };

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r1 = (v: number): number => Math.round(v * 10) / 10;

export function validaAssunzioni(a: AssunzioniTempi): string | null {
  if (!(a.costoOrario > 0 && a.costoOrario <= 500)) return 'Il costo orario va da 1 a 500 €/h.';
  if (!(Number.isInteger(a.operai) && a.operai >= 1 && a.operai <= 100)) return 'Gli operai sono un numero intero da 1 a 100.';
  if (!(a.oreGiorno >= 1 && a.oreGiorno <= 12)) return 'Le ore al giorno vanno da 1 a 12.';
  if (!(a.resaPct >= 10 && a.resaPct <= 100)) return 'La resa va dal 10% al 100%.';
  if (!(Number.isInteger(a.giorniSettimana) && a.giorniSettimana >= 1 && a.giorniSettimana <= 7)) return 'I giorni a settimana vanno da 1 a 7.';
  return null;
}

export function stimaTempiDaComputo(righe: RigaCosto[], a: AssunzioniTempi, giorniTarget?: number | null): EsitoTempi {
  const errore = validaAssunzioni(a);
  if (errore) return { stato: 'non_valido', motivo: errore };
  const perCap = new Map<string, number>();
  let ore = 0, con = 0, senza = 0;
  for (const r of righe) {
    const q = Math.max(0, n(r.quantita));
    if (q <= 0) continue;
    const man = n(r.costo_manodopera) * q;
    if (man <= 0) { senza++; continue; }
    const h = man / a.costoOrario;
    ore += h; con++;
    const k = r.capitolo_nome || 'Generale';
    perCap.set(k, (perCap.get(k) ?? 0) + h);
  }
  if (!(ore > 0)) return { stato: 'senza_manodopera', voci: senza };
  const oreProduttiveGiorno = a.oreGiorno * (a.resaPct / 100);
  const giorni = Math.max(1, Math.ceil(ore / (a.operai * oreProduttiveGiorno) - 1e-9));
  const target = n(giorniTarget);
  return {
    stato: 'ok',
    orePersona: r1(ore),
    giorniLavorativi: giorni,
    settimane: r1(giorni / a.giorniSettimana),
    perCapitolo: [...perCap].map(([nome, h]) => ({ nome, ore: r1(h), quotaPct: r1((h / ore) * 100) })).sort((x, y) => y.ore - x.ore),
    vociConManodopera: con,
    vociSenzaManodopera: senza,
    operaiPerTarget: Number.isInteger(target) && target >= 1 && target <= 1000
      ? { giorni: target, operai: Math.max(1, Math.ceil(ore / (target * oreProduttiveGiorno) - 1e-9)) } : null,
  };
}
