/**
 * duplicaPreventivo — la parte pura: cosa eredita una copia e cosa no,
 * e come si ricostruisce la gerarchia delle righe.
 */
import { describe, it, expect } from "vitest";
import {
  costruisciCopiaQuote,
  costruisciPayloadRighe,
} from "@/lib/quotes/duplicaPreventivo";

const originale = {
  id: "q-1",
  company_id: "c-1",
  title: "Bagno completo Rossi",
  status: "accettata",
  quote_number: "OFF-2026-042",
  contact_id: "mc-9",
  client_name: "Mario Rossi",
  subtotal: 1000,
  total: 1220,
  sent_at: "2026-08-01T10:00:00Z",
  viewed_at: "2026-08-02T10:00:00Z",
  signed_at: "2026-08-03T10:00:00Z",
  signature_token: "tok",
  expires_at: "2026-09-01",
  deleted_at: null,
  pdf_storage_path: "quotes/q-1.pdf",
  approval_status: "approved",
  parent_quote_id: null,
  revision_number: null,
  created_at: "2026-07-30T10:00:00Z",
  template_id: "tpl-5",
  validity_days: 30,
  // Prezzo scritto a mano (21/09/2026): non è nella denylist di
  // CAMPI_DA_AZZERARE, quindi sopravvive allo spread come ogni altro campo
  // commerciale — qui lo si verifica invece di darlo per buono.
  prezzo_manuale: 9500,
  prezzo_manuale_iva_pct: 22,
};

describe("costruisciCopiaQuote — copia libera", () => {
  const copia = costruisciCopiaQuote(originale, { comeRevisione: false });

  it("riparte da bozza, senza numero, storia ne' firme", () => {
    expect(copia.status).toBe("bozza");
    expect(copia).not.toHaveProperty("id");
    expect(copia).not.toHaveProperty("quote_number");
    expect(copia).not.toHaveProperty("sent_at");
    expect(copia).not.toHaveProperty("signed_at");
    expect(copia).not.toHaveProperty("signature_token");
    expect(copia).not.toHaveProperty("expires_at");
    expect(copia).not.toHaveProperty("pdf_storage_path");
    expect(copia).not.toHaveProperty("approval_status");
  });

  it("mantiene cliente, template e contenuto commerciale", () => {
    expect(copia.contact_id).toBe("mc-9");
    expect(copia.client_name).toBe("Mario Rossi");
    expect(copia.template_id).toBe("tpl-5");
    expect(copia.validity_days).toBe(30);
    expect(copia.total).toBe(1220);
  });

  it("il titolo dice che e' una copia", () => {
    expect(copia.title).toBe("Bagno completo Rossi (copia)");
  });

  it("titolo vuoto → titolo di ripiego", () => {
    const c = costruisciCopiaQuote({ ...originale, title: "  " }, { comeRevisione: false });
    expect(c.title).toBe("Preventivo (copia)");
  });

  it("porta con sé il prezzo scritto a mano e la sua aliquota", () => {
    expect(copia.prezzo_manuale).toBe(9500);
    expect(copia.prezzo_manuale_iva_pct).toBe(22);
  });
});

describe("costruisciCopiaQuote — nuova revisione", () => {
  const rev = costruisciCopiaQuote(originale, { comeRevisione: true, numeroRevisione: 3 });

  it("si aggancia al padre col numero giusto e tiene il titolo", () => {
    expect(rev.parent_quote_id).toBe("q-1");
    expect(rev.revision_number).toBe(3);
    expect(rev.title).toBe("Bagno completo Rossi");
    expect(rev.status).toBe("bozza");
  });
});

describe("costruisciPayloadRighe — la gerarchia sopravvive alla copia", () => {
  it("client_temp_id = vecchio id, parent_temp_id = vecchio parent", () => {
    const payload = costruisciPayloadRighe([
      { id: "r-1", parent_item_id: null, item_type: "product", name: "Kit doccia", quantity: 1, unit_price: 500, unit_of_measure: "pz" },
      { id: "r-2", parent_item_id: "r-1", item_type: "product", name: "Posa", quantity: 2, unit_price: 80, unit_of_measure: "h" },
    ]);
    expect(payload[0]).toMatchObject({ client_temp_id: "r-1", parent_temp_id: null, sort_order: 0 });
    expect(payload[1]).toMatchObject({ client_temp_id: "r-2", parent_temp_id: "r-1", sort_order: 1 });
  });

  it("i default riempiono i buchi senza inventare valori commerciali", () => {
    const [r] = costruisciPayloadRighe([
      { id: "r-9", parent_item_id: null, item_type: "product", name: "Voce", quantity: 1, unit_price: 10, unit_of_measure: "pz" },
    ]);
    expect(r).toMatchObject({ discount_percent: 0, vat_rate: 22, item_category: "prodotto", prezzo_acquisto: 0, mostra_nel_pdf: true, is_optional: false });
  });
});
