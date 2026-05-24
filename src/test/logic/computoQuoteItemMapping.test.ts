import { describe, expect, it } from "vitest";
import {
  buildComputoQuoteItemPayload,
  inferComputoItemCategory,
  isComputoTariffaMatch,
} from "@/lib/computo/quoteItemMapping";
import type { ComputoVoceLocal } from "@/types/computo";

function voce(overrides: Partial<ComputoVoceLocal> = {}): ComputoVoceLocal {
  const base: ComputoVoceLocal = {
    id: "v1",
    computo_upload_id: "c1",
    company_id: "co1",
    capitolo_numero: 1,
    capitolo_nome: "Opere edili",
    codice_voce: "1.1",
    codice_prezzario: "E.01",
    descrizione_breve: "Fornitura pavimento gres",
    descrizione_estesa: "Fornitura pavimento gres porcellanato",
    unita_misura: "mq",
    quantita: 12,
    prezzo_unitario_computo: 40,
    importo_computo: 480,
    prezzo_unitario_impresa: null,
    ricarico_percentuale: null,
    sconto_percentuale: 0,
    importo_impresa: null,
    confidence: 0.94,
    warnings: null,
    ai_notes: null,
    is_included: true,
    is_modified: false,
    ordine: 1,
    created_at: "2026-05-24T00:00:00Z",
    matched_template_id: null,
    matched_family_id: null,
    matched_tariffa_id: null,
    matched_name: null,
    match_type: null,
    match_confidence: null,
    _prezzoImpresa: 48,
    _ricarico: 20,
    _importoImpresa: 576,
    _isIncluded: true,
    _matched_template_id: "article-1",
    _matched_name: "Gres porcellanato 60x60",
    _match_type: "manual",
  };

  return { ...base, ...overrides };
}

describe("computo quote item mapping", () => {
  it("keeps product rows as product quote items", () => {
    const payload = buildComputoQuoteItemPayload(voce(), 0);

    expect(payload.item_type).toBe("product");
    expect(payload.item_category).toBe("prodotto");
    expect(payload.article_template_id).toBe("article-1");
    expect(payload.tariffa_id).toBeNull();
    expect(payload.name).toBe("Gres porcellanato 60x60");
  });

  it("maps tariff/labor rows to service quote items with tariff cost metadata", () => {
    const row = voce({
      descrizione_breve: "Posa pavimento gres",
      descrizione_estesa: "Posa in opera pavimento gres incluso collante",
      unita_misura: "mq",
      _matched_template_id: undefined,
      _matched_tariffa_id: "tariffa-posa",
      _matched_tariffa_tipo: "posa",
      _matched_tariffa_cost: 18,
      _matched_tariffa_unita: "mq",
      _matched_name: "Posa pavimento al mq",
      _prezzoImpresa: 32,
      _importoImpresa: 384,
    });

    const payload = buildComputoQuoteItemPayload(row, 4);

    expect(isComputoTariffaMatch(row)).toBe(true);
    expect(payload.item_type).toBe("service");
    expect(payload.item_category).toBe("posa");
    expect(payload.tariffa_id).toBe("tariffa-posa");
    expect(payload.article_template_id).toBeNull();
    expect(payload.prezzo_acquisto).toBe(18);
    expect(payload.unit_of_measure).toBe("mq");
    expect(payload.sort_order).toBe(5);
  });

  it("infers service categories from computo wording even before manual matching", () => {
    expect(inferComputoItemCategory(voce({ descrizione_breve: "Manodopera operaio specializzato a ore" }))).toBe("manodopera");
    expect(inferComputoItemCategory(voce({ descrizione_breve: "Trasporto materiali e tiro al piano" }))).toBe("trasporto");
    expect(inferComputoItemCategory(voce({ descrizione_breve: "Smaltimento macerie in discarica autorizzata" }))).toBe("smaltimento");
  });
});
