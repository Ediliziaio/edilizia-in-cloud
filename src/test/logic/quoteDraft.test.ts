import { describe, expect, it } from "vitest";
import { readQuoteDraft, serializeQuoteDraft, quoteDraftSchema, type QuoteDraft } from "@/lib/preventivi/quoteDraft";

describe("bozza completa preventivo classico", () => {
  const draft: QuoteDraft = {
    step: 2, partialQuoteId: null, contactId: null, clientName: "Cliente prova", clientEmail: "",
    clientPhone: "", clientCompany: "", clientAddress: "", clientFiscalCode: "", clientVatNumber: "",
    title: "Offerta", description: "Progetto", validityDays: 30, notes: "Nota cliente",
    internalNotes: "Nota riservata", tipoLavoro: "Bagno", indirizzoLavori: "",
    pianoInstallazione: 0, kmCantiere: 0, salespersonId: null, sedeId: null,
    discountPercent: 0, prezzoManuale: null, prezzoManualeIvaPct: 0, provvigionePct: 0,
    items: [{ item_type: "product", item_category: "prodotto", name: "Porta",
      description: "", quantity: 1, unit_price: 100, discount_percent: 0, vat_rate: 22,
      unit_of_measure: "pz", sort_order: 0, prezzo_acquisto: 20, mostra_nel_pdf: false,
      is_optional: false, client_temp_id: "parent", axis_selections: { colore: "bianco" },
      image_url: "/local/door.webp",
    }],
    paymentMethod: "Bonifico", paymentPhases: [{ label: "Saldo", type: "balance", percent: 100, amount: 122 }],
    bonusLines: [{ position: 0, presetId: null, label: "Personalizzato", imponibile: 100,
      aliquotaDetrazione: null, causale: "", note: null }],
    selectedRenders: [{ id: "render", result_url: "/render.webp", render_type: "interno", session_table: "render_sessions" }],
    selectedMaterials: ["scheda-a", "scheda-b"], renderUrl: "/render.webp", renderSessionId: "render",
    renderOriginalUrl: null, selectedTemplateId: "modello", layoutOverride: "modern",
    financingProposal: { table_id: "table", amount: 100, num_installments: 12,
      monthly_rate: 10, total_due: 120, calculation: {
        importo_richiesto: 100, numero_rate: 12, modalita: "esatto", rata_completa: 10,
      } },
    pdfPrezziRiga: false, pdfSoloTotale: true, pdfSconti: false, pdfImmagini: true,
    pdfSchedeTecniche: true, pdfFirma: false, pdfMisure: false, pdfAttributi: false,
    pdfNoteCliente: false, pdfCondizioni: false, pdfWatermarkText: "BOZZA", pdfCopiaDestinatario: "cliente",
  };

  it("mantiene TUTTI i campi, compresi false, zero e null", () => {
    const restored = readQuoteDraft(serializeQuoteDraft(draft, new Date("2026-09-23T10:00:00Z")));
    expect(restored).toEqual({ ...draft, schemaVersion: 2, savedAt: "2026-09-23T10:00:00.000Z" });
    expect(Object.keys(quoteDraftSchema.shape).filter((key) => !["schemaVersion", "savedAt"].includes(key)).sort())
      .toEqual(Object.keys(draft).sort());
  });

  it("legge il formato precedente senza inventare i campi mancanti", () => {
    expect(readQuoteDraft(JSON.stringify({ clientName: "Prova", items: [] })))
      .toEqual({ clientName: "Prova", items: [] });
  });

  it.each(["{broken", "null", "[]", "{}", '{"items":[{"name":3}]}', '{"paymentPhases":"no"}', '{"pdfFirma":"false"}', '{"schemaVersion":999,"clientName":"Prova"}'])(
    "rifiuta dati corrotti senza convertirli in una bozza vuota: %s", (raw) => {
      expect(() => readQuoteDraft(raw)).toThrow();
    },
  );

  it("le modifiche a campi prima esclusi cambiano lo snapshot", () => {
    const before = JSON.stringify(draft);
    for (const patch of [{ notes: "Nuova nota" }, { pdfFirma: true }, { selectedMaterials: [] },
      { selectedTemplateId: "altro" }, { paymentMethod: "Altro" }, { items: [] }] as Partial<QuoteDraft>[]) {
      expect(JSON.stringify({ ...draft, ...patch })).not.toBe(before);
    }
  });
});
