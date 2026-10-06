/**
 * La bozza locale del preventivo nuovo si rilegge anche con le righe che nascono
 * dal listino.
 *
 * Lo schema di lettura (quoteDraftSchema) ammetteva solo otto categorie di riga: una
 * voce «pratica» o «tiro al piano» (valide per il database, e scelte da «Voce dal
 * listino tariffe») rendeva la bozza ILLEGGIBILE. Al ritorno nella pagina:
 * «Impossibile leggere la bozza locale», bozza persa, e salvataggi locali spenti per
 * tutta la sessione. Lo stesso per una famiglia del listino senza aliquota o senza
 * unità di misura (colonne che il database lascia vuote, con un default).
 */
import { describe, expect, it } from "vitest";
import { readQuoteDraft, serializeQuoteDraft, type QuoteDraft } from "@/lib/preventivi/quoteDraft";
import type { QuoteItemPro } from "@/types/quoteItem";

const riga = (extra: Record<string, unknown> = {}) => ({
  item_type: "service", item_category: "posa", name: "Voce", description: "", quantity: 1, unit_price: 100, discount_percent: 0,
  vat_rate: 22, unit_of_measure: "pz", sort_order: 0, prezzo_acquisto: 0, mostra_nel_pdf: true, is_optional: false, ...extra,
}) as unknown as QuoteItemPro;

const bozza = (items: QuoteItemPro[]): QuoteDraft => ({
  step: 1, clientName: "Cliente", title: "Offerta", validityDays: 30, discountPercent: 0, items,
});

describe("bozza locale: righe dal listino", () => {
  it.each(["prodotto", "posa", "trasporto", "smaltimento", "nolo", "nota", "subtotale", "sconto", "pratica", "tiro_piano"])(
    "una riga «%s» (tutte le categorie che il database ammette) si rilegge", (categoria) => {
      const letta = readQuoteDraft(serializeQuoteDraft(bozza([riga({ item_category: categoria })])));
      expect(letta.items?.[0].item_category).toBe(categoria);
    },
  );

  it("una famiglia senza aliquota o senza unità di misura non rende illeggibile la bozza", () => {
    const letta = readQuoteDraft(serializeQuoteDraft(bozza([riga({ vat_rate: null, unit_of_measure: null })])));
    expect(letta.items?.[0]).toMatchObject({ vat_rate: null, unit_of_measure: null, name: "Voce" });
  });

  it("i dati corrotti restano rifiutati: categoria inventata, nome non testo, quantità non numerica", () => {
    expect(() => readQuoteDraft(serializeQuoteDraft(bozza([riga({ item_category: "inventata" })])))).toThrow();
    expect(() => readQuoteDraft(JSON.stringify({ items: [riga({ name: 3 })] }))).toThrow();
    expect(() => readQuoteDraft(JSON.stringify({ items: [riga({ quantity: "due" })] }))).toThrow();
  });
});
