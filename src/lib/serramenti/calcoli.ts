/**
 * src/lib/serramenti/calcoli.ts — calcoli economici base
 *
 * - Totale BOM (serramenti + accessori)
 * - Applicazione sconti
 * - Forbice min/max (per gestire varianti di mercato)
 * - IVA
 */
import type { SrSerramentoRow, SrAccessorioRow } from "@/types/serramenti";

export interface CalcoloTotale {
  imponibile_serramenti: number;
  imponibile_accessori: number;
  imponibile_lordo: number;       // somma BOM
  sconto: number;                  // valore sconto applicato
  imponibile_netto: number;        // dopo sconto
  iva_importo: number;
  totale_iva_inclusa: number;
  metri_quadri: number;
  num_serramenti: number;
  num_accessori: number;
}

export interface CalcoloOptions {
  iva_percentuale?: number;        // 22 default
  sconto_percentuale?: number;     // 0..100
  sconto_importo?: number;         // sconto fisso in € (alternativa al %)
}

/**
 * Calcola tutti i totali partendo dal BOM (serramenti + accessori).
 */
export function calcolaTotale(
  serramenti: SrSerramentoRow[],
  accessori: SrAccessorioRow[],
  opts: CalcoloOptions = {},
): CalcoloTotale {
  const iva = opts.iva_percentuale ?? 22;
  const scontoPct = opts.sconto_percentuale ?? 0;
  const scontoEur = opts.sconto_importo ?? 0;

  const imponibile_serramenti = serramenti.reduce(
    (acc, s) => acc + Number(s.prezzo_totale ?? (s.prezzo_unitario ?? 0) * (s.quantita ?? 1)),
    0,
  );
  const imponibile_accessori = accessori.reduce(
    (acc, a) => acc + Number(a.prezzo_totale ?? (a.prezzo_unitario ?? 0) * (a.quantita ?? 1)),
    0,
  );
  const imponibile_lordo = imponibile_serramenti + imponibile_accessori;

  // Sconto: prima il fisso, poi il %
  const dopoFisso = Math.max(0, imponibile_lordo - scontoEur);
  const scontoPctEur = dopoFisso * (scontoPct / 100);
  const imponibile_netto = dopoFisso - scontoPctEur;
  const sconto = imponibile_lordo - imponibile_netto;

  const iva_importo = imponibile_netto * (iva / 100);
  const totale_iva_inclusa = imponibile_netto + iva_importo;

  const metri_quadri = serramenti.reduce((acc, s) => {
    const mq = s.metri_quadri ??
      ((s.larghezza_mm ?? 0) * (s.altezza_mm ?? 0) * (s.quantita ?? 1)) / 1_000_000;
    return acc + Number(mq);
  }, 0);

  const num_serramenti = serramenti.reduce((acc, s) => acc + (s.quantita ?? 1), 0);
  const num_accessori = accessori.reduce((acc, a) => acc + (a.quantita ?? 1), 0);

  return {
    imponibile_serramenti,
    imponibile_accessori,
    imponibile_lordo,
    sconto,
    imponibile_netto,
    iva_importo,
    totale_iva_inclusa,
    metri_quadri,
    num_serramenti,
    num_accessori,
  };
}

/**
 * Forbice min/max: il totale è ±X% per coprire variabili (materiale, vetro,
 * finitura, accessori opzionali) — il prezzo definitivo si fissa con il
 * sopralluogo e la consulenza.
 */
export function forbicePrezzo(
  totale: number,
  range_pct: number = 12,
): { min: number; max: number; media: number } {
  const delta = totale * (range_pct / 100);
  return {
    min: Math.round((totale - delta) / 10) * 10,    // arrotonda a 10
    max: Math.round((totale + delta) / 10) * 10,
    media: Math.round(totale / 10) * 10,
  };
}

/**
 * Calcolo m² da dimensioni serramento.
 */
export function calcolaM2(larghezza_mm: number, altezza_mm: number, quantita: number = 1): number {
  return (larghezza_mm * altezza_mm * quantita) / 1_000_000;
}
