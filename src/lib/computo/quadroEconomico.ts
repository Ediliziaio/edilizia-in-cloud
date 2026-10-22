/**
 * Quadro economico di un lavoro pubblico: il ribasso d'asta si applica ai soli
 * lavori, gli oneri della sicurezza restano interi (non soggetti a ribasso).
 *
 *   importo contrattuale = (lavori − sicurezza) × (1 − ribasso) + sicurezza
 */
export interface QuadroEconomico {
  importo_lavori: number;
  oneri_sicurezza: number;
  soggetto_a_ribasso: number;
  ribasso_percentuale: number;
  ribasso_euro: number;
  importo_contrattuale: number;
}

const cent = (n: number) => Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;

export function quadroEconomico(importoLavori: number, oneriSicurezza: number, ribassoPercentuale: number | null | undefined): QuadroEconomico {
  const lavori = cent(importoLavori || 0);
  const sicurezza = cent(oneriSicurezza || 0);
  const ribasso = Math.min(100, Math.max(0, Number(ribassoPercentuale) || 0));
  const soggetto = cent(lavori - sicurezza);
  const ribassoEuro = cent(soggetto * ribasso / 100);
  return {
    importo_lavori: lavori, oneri_sicurezza: sicurezza, soggetto_a_ribasso: soggetto,
    ribasso_percentuale: ribasso, ribasso_euro: ribassoEuro,
    importo_contrattuale: cent(soggetto - ribassoEuro + sicurezza),
  };
}
