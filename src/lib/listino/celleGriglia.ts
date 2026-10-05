/**
 * Il prezzo di vendita delle celle di una griglia «acquisto + ricarico».
 *
 * Ogni cella salva il suo prezzo di vendita, calcolato da costo, sconti
 * fornitore e ricarico quando si salva la griglia; il preventivatore
 * serramenti usa quel prezzo salvato. Cambiando sconti o ricarico con «Salva
 * parametri» le celle restavano coi prezzi vecchi senza che nessuno lo
 * vedesse: un'azienda ha 154 celle più care del 32% rispetto ai parametri
 * (05/10/2026). Qui si conta quante sono e si calcola il prezzo giusto; la
 * scelta di aggiornarle resta a chi gestisce il listino.
 */
import { applyMarkup, applyScontiFornitore } from "@/lib/priceMarkup";
import { round2 } from "@/hooks/usePreventivoCosti";
import type { MarkupTipo } from "@/types/articleFamily";

export type ParametriPrezzo = {
  sconto_fornitore_1?: number | null;
  sconto_fornitore_2?: number | null;
  markup_tipo?: MarkupTipo | string | null;
  markup_valore?: number | null;
};

export type CellaPrezzo = {
  id: string;
  prezzo_vendita: number | null;
  prezzo_acquisto: number | null;
  /** Le celle di una linea fornitore hanno il loro ricarico: non si toccano. */
  supplier_product_line_id?: string | null;
};

/** Vendita = costo lordo − sconti fornitore, più ricarico; come calcolaPrezzoFamiglia (stesso round2). */
export function venditaDaCosto(acquistoLordo: number, p: ParametriPrezzo): number {
  const netto = applyScontiFornitore(acquistoLordo, Number(p.sconto_fornitore_1 ?? 0), Number(p.sconto_fornitore_2 ?? 0));
  return round2(
    applyMarkup({
      prezzoAcquisto: netto,
      markupTipo: (p.markup_tipo ?? "none") as MarkupTipo,
      markupValore: Number(p.markup_valore ?? 0),
    }).prezzoVendita,
  );
}

/** Le celle col prezzo di vendita diverso da quello dei parametri (oltre il centesimo). */
export function celleDaRicalcolare(
  celle: CellaPrezzo[],
  p: ParametriPrezzo,
): Array<{ id: string; attuale: number; nuovo: number }> {
  const risultato: Array<{ id: string; attuale: number; nuovo: number }> = [];
  for (const c of celle) {
    if (c.supplier_product_line_id) continue;
    const acquisto = Number(c.prezzo_acquisto ?? 0);
    if (!(acquisto > 0)) continue;
    const nuovo = venditaDaCosto(acquisto, p);
    const attuale = Number(c.prezzo_vendita ?? 0);
    // In centesimi interi: «1,01 − 1,00 > 0,01» in virgola mobile è vero, e una
    // cella giusta risultava da aggiornare.
    if (Math.round(attuale * 100) !== Math.round(nuovo * 100)) risultato.push({ id: c.id, attuale, nuovo });
  }
  return risultato;
}
