/**
 * rigaAggiustamentoPrezzoManuale — la precompilazione umana della commessa
 * (/azienda/ordini/nuovo, `useQuotePrefill`) con un preventivo a prezzo
 * scritto a mano (21/09/2026): le righe restano a 0€, questa funzione dà una
 * riga di riferimento invece di una lista che non dice niente.
 */
import { describe, expect, it } from "vitest";
import { rigaAggiustamentoPrezzoManuale } from "@/hooks/useQuotePrefill";

describe("rigaAggiustamentoPrezzoManuale", () => {
  it("righe a 0€ e prezzo scritto: la riga vale l'intero imponibile", () => {
    const righe = [{ unit_price: 0, quantity: 1 }, { unit_price: 0, quantity: 3 }];
    const quote = { prezzo_manuale: 12000, prezzo_manuale_iva_pct: 10, subtotal: 12000, discount_amount: 1200 };
    const riga = rigaAggiustamentoPrezzoManuale(righe, quote);
    expect(riga).not.toBeNull();
    expect(riga).toMatchObject({ name: "Prezzo a corpo", unit_price: 10800, vat_rate: 10, quantity: 1 });
  });

  it("le righe coprono già una parte: la riga vale solo la differenza", () => {
    const righe = [{ unit_price: 3000, quantity: 1 }, { unit_price: 0, quantity: 2 }];
    // imponibile netto 12000 − 1200 = 10800; righe = 3000 → differenza 7800
    const quote = { prezzo_manuale: 12000, prezzo_manuale_iva_pct: 22, subtotal: 12000, discount_amount: 1200 };
    const riga = rigaAggiustamentoPrezzoManuale(righe, quote);
    expect(riga?.unit_price).toBe(7800);
    expect(riga?.name).toBe("Prezzo a corpo");
  });

  it("le righe coprono più del prezzo scritto: sconto commerciale, mai un numero positivo inventato", () => {
    const righe = [{ unit_price: 15000, quantity: 1 }];
    // imponibile netto 10000; righe 15000 → differenza -5000
    const quote = { prezzo_manuale: 10000, prezzo_manuale_iva_pct: 22, subtotal: 10000, discount_amount: 0 };
    const riga = rigaAggiustamentoPrezzoManuale(righe, quote);
    expect(riga).toMatchObject({ name: "Sconto commerciale", unit_price: -5000 });
  });

  it("nessun prezzo scritto a mano: nessuna riga aggiunta", () => {
    const righe = [{ unit_price: 0, quantity: 1 }];
    expect(rigaAggiustamentoPrezzoManuale(righe, { prezzo_manuale: null, subtotal: 0, discount_amount: 0 })).toBeNull();
    expect(rigaAggiustamentoPrezzoManuale(righe, { prezzo_manuale: 0, subtotal: 0, discount_amount: 0 })).toBeNull();
    expect(rigaAggiustamentoPrezzoManuale(righe, {})).toBeNull();
  });

  it("nessuna riga da precompilare: niente da aggiustare", () => {
    const quote = { prezzo_manuale: 12000, subtotal: 12000, discount_amount: 0 };
    expect(rigaAggiustamentoPrezzoManuale([], quote)).toBeNull();
  });

  it("le righe sommano già esattamente al prezzo scritto: nessuna riga inutile", () => {
    const righe = [{ unit_price: 10800, quantity: 1 }];
    const quote = { prezzo_manuale: 12000, subtotal: 12000, discount_amount: 1200 };
    expect(rigaAggiustamentoPrezzoManuale(righe, quote)).toBeNull();
  });
});
