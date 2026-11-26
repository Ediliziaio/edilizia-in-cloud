/**
 * Cash flow mese per mese della commessa, per il conto economico che si stampa.
 *
 * Le stesse due fonti che il documento già elenca sotto — le rate incassate dal
 * cliente e le uscite pagate — messe in fila nel tempo, con il cumulato a fine
 * mese: quanto è entrato, quanto è uscito, quanto resta in cassa. Sotto zero il
 * cantiere lo sta finanziando l'impresa.
 *
 * NON è lo stesso numero della card «Chi finanzia il cantiere» a schermo: quella
 * legge anche la prima nota, la manodopera e le provvigioni. Qui le fonti sono
 * quelle del documento, così le tre sezioni stampate si sommano fra loro.
 *
 * Modulo puro: niente React, niente Supabase.
 */

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export interface MeseCassaQuadro {
  ym: string;
  label: string;
  entrate: number;
  uscite: number;
  /** Cumulato a fine mese: entrate meno uscite dall'inizio. */
  saldo: number;
}

export interface RataIncassata { paid_date?: string | null; amount?: number | null; incassato?: number | null }
export interface UscitaPagata { pagato_il?: string | null; pagato?: number | null }

const mese = (data: string | null | undefined) =>
  typeof data === "string" && /^\d{4}-\d{2}/.test(data) ? data.slice(0, 7) : null;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const c = (v: number) => Math.round(v * 100) / 100;

/** Il mese dopo, in forma `AAAA-MM`. */
function prossimo(ym: string): string {
  const [anno, m] = ym.split("-").map(Number);
  return m >= 12 ? `${anno + 1}-01` : `${anno}-${String(m + 1).padStart(2, "0")}`;
}

export function cashFlowMensileQuadro(
  rate: readonly RataIncassata[],
  uscite: readonly UscitaPagata[],
  /** Quanti mesi al massimo: oltre, il documento diventa illeggibile. */
  massimo = 36,
): MeseCassaQuadro[] {
  const per = new Map<string, { entrate: number; uscite: number }>();
  const aggiungi = (ym: string, entrate: number, usciti: number) => {
    const riga = per.get(ym) ?? { entrate: 0, uscite: 0 };
    riga.entrate += entrate;
    riga.uscite += usciti;
    per.set(ym, riga);
  };
  for (const r of rate) {
    const ym = mese(r.paid_date);
    if (!ym) continue;
    // `incassato` quando c'è (incassi parziali), altrimenti l'importo della rata.
    const importo = n(r.incassato) > 0 ? n(r.incassato) : n(r.amount);
    if (importo > 0) aggiungi(ym, importo, 0);
  }
  for (const u of uscite) {
    const ym = mese(u.pagato_il);
    if (!ym) continue;
    const importo = n(u.pagato);
    if (importo > 0) aggiungi(ym, 0, importo);
  }
  if (per.size === 0) return [];

  const mesi = [...per.keys()].sort();
  const righe: MeseCassaQuadro[] = [];
  let saldo = 0;
  // I mesi senza movimenti restano in elenco: il cumulato fermo racconta l'attesa.
  for (let ym = mesi[0]; ym <= mesi[mesi.length - 1] && righe.length < massimo; ym = prossimo(ym)) {
    const riga = per.get(ym) ?? { entrate: 0, uscite: 0 };
    saldo += riga.entrate - riga.uscite;
    const m = Number(ym.slice(5, 7));
    righe.push({
      ym,
      label: `${MESI[m - 1]} '${ym.slice(2, 4)}`,
      entrate: c(riga.entrate),
      uscite: c(riga.uscite),
      saldo: c(saldo),
    });
  }
  return righe;
}
