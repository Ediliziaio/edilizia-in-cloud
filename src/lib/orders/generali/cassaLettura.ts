import type { MeseOperazione } from "./cassaOperazione";

export type BaseCassa = "registrati" | "attesi";
export type PeriodoCassa = "tutto" | "passato" | "futuro";
export const sommaMesi = (
  righe: MeseOperazione[],
  chiave: Exclude<keyof MeseOperazione, "mese">,
) => righe.reduce((n, r) => n + r[chiave], 0);

/** Le fonti restano fuori dal cumulato operativo: possono essere già presenti in prima nota. */
export function serieCassaEffettiva(righe: MeseOperazione[], base: BaseCassa) {
  let cumulato = 0;
  return [...righe]
    .sort((a, b) => a.mese.localeCompare(b.mese))
    .map((r) => {
      const entrate =
        (base === "registrati" ? r.incassato : r.entrateAttese) / 100;
      const pagamenti =
        (base === "registrati" ? r.pagato : r.usciteAttese) / 100;
      cumulato = Math.round((cumulato + entrate - pagamenti) * 100) / 100;
      return {
        mese: r.mese,
        entrate,
        pagamenti,
        uscite: -pagamenti,
        netto: Math.round((entrate - pagamenti) * 100) / 100,
        cumulato,
      };
    });
}

export const nelPeriodoCassa = (
  mese: string,
  periodo: PeriodoCassa,
  oggi: string,
) =>
  periodo === "tutto" ||
  (periodo === "passato" ? mese < oggi.slice(0, 7) : mese >= oggi.slice(0, 7));

export const asseEuro = (n: number) =>
  Math.abs(n) >= 1000
    ? `${(n / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k`
    : n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
