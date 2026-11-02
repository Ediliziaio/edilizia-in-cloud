/** Conti sugli orari di un appuntamento. Niente React qui. */

const minuti = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export interface ImpegnoGiorno { title: string; appointment_time: string | null; appointment_end_time?: string | null }

/** Gli impegni della persona che si sovrappongono all'orario scelto. Senza fine vale un'ora. */
export function sovrapposizioni<T extends ImpegnoGiorno>(inizio: string, fine: string, impegni: T[]): T[] {
  const da = minuti(inizio);
  if (da == null) return [];
  const a = minuti(fine) ?? da + 60;
  return impegni.filter((i) => {
    const iDa = minuti(i.appointment_time);
    if (iDa == null) return false;
    const iA = minuti(i.appointment_end_time) ?? iDa + 60;
    return iDa < a && iA > da;
  });
}

/** Minuti tra inizio e fine; null se la fine non viene dopo l'inizio. */
export function durataTra(inizio: string, fine: string): number | null {
  const da = minuti(inizio);
  const a = minuti(fine);
  return da != null && a != null && a > da ? a - da : null;
}

export function etichettaDurata(m: number): string {
  if (m < 60) return `${m} minuti`;
  const ore = Math.floor(m / 60);
  const resto = m % 60;
  const parola = ore === 1 ? "1 ora" : `${ore} ore`;
  return resto ? `${parola} e ${resto}` : parola;
}

/** Durate da proporre: quelle fisse, più quella in corso se è diversa. */
export function durateDisponibili(fisse: number[], attuale: number): number[] {
  return fisse.includes(attuale) || !(attuale > 0) ? fisse : [...fisse, attuale].sort((a, b) => a - b);
}

/** Il titolo proposto per un appuntamento su una commessa: segue il tipo finché nessuno lo cambia. */
export const titoloProposto = (tipo: string, riferimento: string) => `${tipo} — ${riferimento}`;
