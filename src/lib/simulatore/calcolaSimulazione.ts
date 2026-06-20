/**
 * calcolaSimulazione — funzione PURA che dal documento (voci/fasi/scenari)
 * produce il risultato denormalizzato mostrato in UI e salvato a DB.
 *
 * IVA: delegata a `calcolaIva(doc.voci, doc.scenari)`, che gestisce sia la
 * modalità singola (un'unica aliquota) sia quella mista 10/22 con beni
 * significativi. `prezzo_cliente` = ricavo imponibile + `iva_totale`;
 * `confronto_iva` enumera il prezzo cliente per ogni aliquota in
 * `scenari.iva_confronto` (resta utile per il pannello di confronto).
 *
 * Cronoprogramma: `durata_settimane` da `calcolaFasi(doc.fasi, doc.voci)`
 * (max offset+durata sulle fasi). `rata_mensile` (finanziamenti) resta neutra
 * fino al task dedicato.
 */
import { calcolaTotali, calcolaIva, calcolaFasi, round2 } from "./calcoli";
import type { SimulazioneDoc, SimulazioneRisultato } from "./tipi";

export function calcolaSimulazione(doc: SimulazioneDoc): SimulazioneRisultato {
  const { costo_totale, ricavo_imponibile, margine_valore, margine_pct } = calcolaTotali(doc.voci);

  // ── IVA (singola o mista 10/22 + beni significativi) ───────────────────────
  const { riepilogo_iva, iva_totale } = calcolaIva(doc.voci, doc.scenari);
  const prezzo_cliente = round2(ricavo_imponibile + iva_totale);

  // ── Confronto IVA (prezzo cliente per ogni aliquota richiesta) ─────────────
  const confronto_iva = doc.scenari.iva_confronto.map((al) => ({
    aliquota: al,
    prezzo_cliente: round2(ricavo_imponibile * (1 + al / 100)),
  }));

  // ── Cronoprogramma (durata totale dalle fasi) ──────────────────────────────
  const { durata_settimane } = calcolaFasi(doc.fasi, doc.voci);

  return {
    costo_totale,
    ricavo_imponibile,
    margine_valore,
    margine_pct,
    riepilogo_iva,
    iva_totale,
    prezzo_cliente,
    confronto_iva,
    durata_settimane,
    rata_mensile: null,
  };
}
