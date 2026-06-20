/**
 * calcolaSimulazione — funzione PURA che dal documento (voci/fasi/scenari)
 * produce il risultato denormalizzato mostrato in UI e salvato a DB.
 *
 * Tappa A (questo stato): solo IVA singola. `iva_totale` = ricavo imponibile ×
 * aliquota attiva; `prezzo_cliente` = imponibile + IVA; `confronto_iva` enumera
 * il prezzo cliente per ogni aliquota in `scenari.iva_confronto`.
 *
 * Tappa B porterà: IVA mista 10/22 con beni significativi (via `calcolaIva`),
 * cronoprogramma fasi (`durata_settimane` da `calcolaFasi`) e finanziamenti
 * (`rata_mensile`). Per ora questi campi restano neutri (0 / null).
 */
import { calcolaTotali, round2 } from "./calcoli";
import type { SimulazioneDoc, SimulazioneRisultato, RiepilogoIvaRiga } from "./tipi";

export function calcolaSimulazione(doc: SimulazioneDoc): SimulazioneRisultato {
  const { costo_totale, ricavo_imponibile, margine_valore, margine_pct } = calcolaTotali(doc.voci);

  // ── IVA singola (Tappa A) ──────────────────────────────────────────────────
  const aliquota = doc.scenari.iva_rate_singola;
  const iva_totale = round2((ricavo_imponibile * aliquota) / 100);
  const riepilogo_iva: RiepilogoIvaRiga[] = [
    { aliquota, imponibile: ricavo_imponibile, imposta: iva_totale },
  ];
  const prezzo_cliente = round2(ricavo_imponibile + iva_totale);

  // ── Confronto IVA (prezzo cliente per ogni aliquota richiesta) ─────────────
  const confronto_iva = doc.scenari.iva_confronto.map((al) => ({
    aliquota: al,
    prezzo_cliente: round2(ricavo_imponibile * (1 + al / 100)),
  }));

  return {
    costo_totale,
    ricavo_imponibile,
    margine_valore,
    margine_pct,
    riepilogo_iva,
    iva_totale,
    prezzo_cliente,
    confronto_iva,
    durata_settimane: 0,
    rata_mensile: null,
  };
}
