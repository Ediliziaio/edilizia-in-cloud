/**
 * I numeri della commessa in due righe (31/10/2026, richiesta di Florin):
 * PREVISTO, quello che il contratto prometteva, e REALE, quello che è
 * successo finora. Ogni numero viene da UNA fonte che la pagina usa già:
 *
 * - ricavo: l'imponibile della commessa (la stessa base di v_ordine_marginalita);
 * - costo previsto: le lavorazioni (economiaFasi: assegnazioni, righe
 *   collegate, voci del preventivo/computo) più le provvigioni, che si
 *   conoscono già alla firma;
 * - costi sostenuti e margine reale: v_ordine_marginalita (costi registrati
 *   davvero: acquisti emessi, magazzino, manodopera, ditte, costi diretti…);
 * - da pagare: i costi registrati e non ancora pagati (useEsposizioneCommessa,
 *   lo stesso numero della cassa), IVA compresa.
 *
 * Qui non si somma niente due volte: si confrontano soltanto.
 *
 * A metà lavori il margine reale è ottimista per forza (ricavo intero, costi
 * fin qui): per questo c'è anche la STIMA A FINE LAVORI, in cui i costi sono
 * il più alto tra sostenuti e previsti. Finché si spende meno del previsto si
 * conta il previsto (il resto arriverà); quando lo si supera, il reale.
 */

export interface PrevistoCommessa {
  costo: number;
  margine: number;
  marginePct: number | null;
  /** Lavorazioni senza un costo previsto: il previsto è parziale. */
  lavorazioniSenzaPrevisto: number;
}

export interface NumeriCommessa {
  /** null = non c'è un costo previsto da confrontare. */
  previsto: PrevistoCommessa | null;
  reale: { costi: number; margine: number; marginePct: number | null };
  /** Costi reali meno costo previsto: sopra zero si spende più del previsto. */
  scostamento: number | null;
  /** null senza previsto. */
  aFinire: {
    costo: number;
    margine: number;
    marginePct: number | null;
    /** Previsto ancora da spendere (mai sotto zero). */
    residuo: number;
    /** Quanto del previsto è già speso, in % (può superare 100). */
    spesoPct: number;
  } | null;
}

const centesimi = (n: number) => Math.round(n * 100) / 100;
const pct = (margine: number, ricavo: number) => (ricavo > 0 ? Math.round((margine / ricavo) * 1000) / 10 : null);

export function numeriCommessa(input: {
  ricavo: number;
  costoPrevistoLavorazioni: number;
  lavorazioniSenzaPrevisto: number;
  provvigioni: number;
  costiReali: number;
  margineReale: number;
}): NumeriCommessa {
  const ricavo = Math.max(0, input.ricavo || 0);
  const lavori = Math.max(0, input.costoPrevistoLavorazioni || 0);
  const previsto = lavori > 0
    ? (() => {
      const costo = centesimi(lavori + Math.max(0, input.provvigioni || 0));
      const margine = centesimi(ricavo - costo);
      return { costo, margine, marginePct: pct(margine, ricavo), lavorazioniSenzaPrevisto: input.lavorazioniSenzaPrevisto };
    })()
    : null;
  const costi = centesimi(input.costiReali || 0);
  const margine = centesimi(input.margineReale || 0);
  const aFinire = previsto
    ? (() => {
      const costo = Math.max(costi, previsto.costo);
      const m = centesimi(ricavo - costo);
      return {
        costo, margine: m, marginePct: pct(m, ricavo),
        residuo: centesimi(Math.max(0, previsto.costo - costi)),
        spesoPct: Math.round((costi / previsto.costo) * 100),
      };
    })()
    : null;
  return {
    previsto,
    reale: { costi, margine, marginePct: pct(margine, ricavo) },
    scostamento: previsto ? centesimi(costi - previsto.costo) : null,
    aFinire,
  };
}
