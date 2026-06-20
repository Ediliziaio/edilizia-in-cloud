/**
 * calcolaSimulazione — funzione PURA che dal documento (voci/fasi/scenari)
 * produce il risultato denormalizzato mostrato in UI e salvato a DB.
 *
 * Economia & trattativa (spese generali / utile / sconto): da `calcolaEconomia`.
 *   - `costo_diretto` = somma costi voci; `spese_generali` = costo_diretto ×
 *     spese_generali_pct/100; `costo_pieno` = costo_diretto + spese_generali.
 *   - `ricavo_lordo` = somma prezzi voci; `sconto_valore` = ricavo_lordo ×
 *     sconto_pct/100; `ricavo_netto` = ricavo_lordo − sconto_valore.
 *   - `margine_netto` = ricavo_netto − costo_pieno. I campi legacy
 *     `margine_valore`/`margine_pct` rispecchiano il margine NETTO, così i KPI e
 *     la riga denormalizzata riflettono sconto + spese generali.
 *
 * IVA: delegata a `calcolaIva(doc.voci, doc.scenari, fattoreSconto)`, dove
 * `fattoreSconto = ricavo_netto/ricavo_lordo` scala gli imponibili al netto
 * scontato (coerente anche in mista 10/22 con beni significativi).
 * `prezzo_cliente` = ricavo_netto + `iva_totale`; `confronto_iva` enumera il
 * prezzo cliente per ogni aliquota in `scenari.iva_confronto`, anch'esso sul
 * ricavo netto.
 *
 * Cronoprogramma: `durata_settimane` da `calcolaFasi(doc.fasi, doc.voci)`
 * (max offset+durata sulle fasi). `rata_mensile` (finanziamenti) resta neutra
 * fino al task dedicato.
 */
import { calcolaTotali, calcolaIva, calcolaFasi, calcolaEconomia, round2 } from "./calcoli";
import type { SimulazioneDoc, SimulazioneRisultato } from "./tipi";

export function calcolaSimulazione(doc: SimulazioneDoc): SimulazioneRisultato {
  const { costo_totale, ricavo_imponibile } = calcolaTotali(doc.voci);
  const { spese_generali_pct, utile_pct, sconto_pct } = doc.scenari;

  // ── Economia & trattativa (spese generali / utile / sconto) ────────────────
  const costo_diretto = costo_totale;
  const ricavo_lordo = ricavo_imponibile;
  const eco = calcolaEconomia({
    costo_diretto,
    ricavo_lordo,
    spese_generali_pct,
    utile_pct,
    sconto_pct,
  });

  // Fattore di sconto applicato agli imponibili IVA (netto/lordo). Con ricavo
  // lordo nullo non c'è sconto da scalare → fattore neutro 1.
  const fattoreSconto = ricavo_lordo > 0 ? eco.ricavo_netto / ricavo_lordo : 1;

  // ── IVA (singola o mista 10/22 + beni significativi), sul ricavo NETTO ──────
  const { riepilogo_iva, iva_totale } = calcolaIva(doc.voci, doc.scenari, fattoreSconto);
  const prezzo_cliente = round2(eco.ricavo_netto + iva_totale);

  // ── Confronto IVA (prezzo cliente per ogni aliquota richiesta) sul netto ───
  const confronto_iva = doc.scenari.iva_confronto.map((al) => ({
    aliquota: al,
    prezzo_cliente: round2(eco.ricavo_netto * (1 + al / 100)),
  }));

  // ── Cronoprogramma (durata totale dalle fasi) ──────────────────────────────
  const { durata_settimane } = calcolaFasi(doc.fasi, doc.voci);

  return {
    costo_totale,
    ricavo_imponibile,
    // Legacy = margine NETTO (riflette sconto + spese generali).
    margine_valore: eco.margine_netto_valore,
    margine_pct: eco.margine_netto_pct,
    // Economia & trattativa.
    costo_diretto,
    spese_generali: eco.spese_generali,
    costo_pieno: eco.costo_pieno,
    sconto_valore: eco.sconto_valore,
    ricavo_lordo,
    ricavo_netto: eco.ricavo_netto,
    utile_target: eco.utile_target,
    margine_netto_valore: eco.margine_netto_valore,
    margine_netto_pct: eco.margine_netto_pct,
    // IVA / prezzo / cronoprogramma.
    riepilogo_iva,
    iva_totale,
    prezzo_cliente,
    confronto_iva,
    durata_settimane,
    rata_mensile: null,
  };
}
