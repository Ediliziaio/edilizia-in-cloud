/**
 * «Meno SAL precedenti»: quanto del SAL è nuovo rispetto a quelli già emessi.
 * Gli importi dei verbali sono cumulativi (contrattuale × % per voce): per
 * fatturare serve la differenza. Due copie identiche (app e funzione edge,
 * che non può importare da src/): src/test/logic/salNetto.test.ts le prova
 * entrambe sugli stessi casi.
 */
export interface SalPerNetto {
  id: string;
  numero_sal: number;
  stato: string;
  importo_totale: number;
}

const STATI_MATURATI = new Set(["emesso", "approvato", "firmato"]);
const arrotonda = (n: number): number => Math.round(n * 100) / 100;

/** Somma dei SAL precedenti già emessi, approvati o firmati (le bozze non contano). */
export function maturatoPrecedente(sal: Pick<SalPerNetto, "id" | "numero_sal">, tutti: ReadonlyArray<SalPerNetto>): number {
  return arrotonda(
    tutti
      .filter((s) => s.id !== sal.id && s.numero_sal < sal.numero_sal && STATI_MATURATI.has(s.stato))
      .reduce((n, s) => n + (Number(s.importo_totale) || 0), 0),
  );
}

export function nettoSal(totale: number, precedente: number): { totale: number; precedente: number; daFatturare: number } {
  return { totale, precedente, daFatturare: arrotonda(totale - precedente) };
}
