import { describe, expect, it } from "vitest";
import {
  SMART_CLASSIFIER_MAX_SIZE,
  SMART_IMPORT_MAX_SIZE,
  buildSmartDocumentInboxAction,
  buildSmartDocumentReviewModel,
  buildSmartImportRedirectPath,
  buildSmartImportActionPlan,
  getSmartDocumentInboxStatusTone,
  getSmartImportFileKind,
  getSmartImportRiskLevel,
  requiresDocTypeConfirmation,
  summarizeSmartDocumentInbox,
} from "@/lib/documenti/smartDocumentImport";

describe("smart document import rules", () => {
  it("keeps the universal uploader aligned with the computo uploader limit", () => {
    expect(SMART_IMPORT_MAX_SIZE).toBe(50 * 1024 * 1024);
    expect(SMART_CLASSIFIER_MAX_SIZE).toBe(18 * 1024 * 1024);
  });

  it("opens extracted computi and imported preventivi in computo review instead of losing the file in a redirect", () => {
    expect(
      buildSmartImportActionPlan({
        docType: "computo_metrico",
        nextAction: { kind: "autoflow", autoflow_function: "computo-ai-extract" },
        parserUsed: "computo-ai-extract",
        structuredFields: { _parser_meta: { computo_upload_id: "cmp-123" } },
      }),
    ).toMatchObject({
      kind: "computo_review",
      computoUploadId: "cmp-123",
      label: "Apri revisione computo",
    });

    expect(
      buildSmartImportActionPlan({
        docType: "preventivo",
        nextAction: { kind: "autoflow", autoflow_function: "computo-ai-extract" },
        parserUsed: "computo-ai-extract",
        structuredFields: { _parser_meta: { computo_upload_id: "prev-456" } },
      }),
    ).toMatchObject({
      kind: "computo_review",
      computoUploadId: "prev-456",
    });
  });

  it("falls back to the dedicated computo importer when the parser cannot provide a review id", () => {
    expect(
      buildSmartImportActionPlan({
        docType: "computo_metrico",
        nextAction: { kind: "autoflow", autoflow_function: "computo-ai-extract" },
        parserUsed: "router_only",
        structuredFields: null,
      }),
    ).toMatchObject({
      kind: "redirect",
      url: "/azienda/marketing/preventivi?action=import-computo",
      label: "Apri import computo",
    });
  });

  it("routes a manually corrected document type to the right module even without the original AI action", () => {
    expect(
      buildSmartImportActionPlan({
        docType: "listino_prezzi",
        nextAction: null,
        parserUsed: null,
        structuredFields: null,
      }),
    ).toMatchObject({
      kind: "redirect",
      url: "/azienda/operativo/listino?action=import",
    });
  });

  it("requires a human confirmation for low-confidence classifications", () => {
    expect(requiresDocTypeConfirmation(0.69)).toBe(true);
    expect(requiresDocTypeConfirmation(0.7)).toBe(false);
  });

  it("summarizes document risk from confidence and validation warnings", () => {
    expect(getSmartImportRiskLevel(0.9, [])).toBe("ok");
    expect(getSmartImportRiskLevel(0.65, [])).toBe("warn");
    expect(getSmartImportRiskLevel(0.9, [{ severity: "error", message: "Totale incoerente" }])).toBe("error");
  });

  it("builds redirect paths with analysis audit params without losing existing query params", () => {
    expect(
      buildSmartImportRedirectPath("/azienda/operativo/listino?action=import", {
        analysisId: "ana-123",
        docType: "listino_prezzi",
      }),
    ).toBe("/azienda/operativo/listino?action=import&analysis_id=ana-123&doc_type=listino_prezzi");
  });

  it("classifies file kind for preview and routing hints", () => {
    expect(getSmartImportFileKind("computo.pdf", "application/pdf")).toBe("pdf");
    expect(getSmartImportFileKind("foto.webp", "image/webp")).toBe("image");
    expect(getSmartImportFileKind("listino.xlsx", "")).toBe("spreadsheet");
    expect(getSmartImportFileKind("primus.xpwe", "")).toBe("computo_data");
  });

  it("opens inbox computo rows directly in the review modal when an extraction id exists", () => {
    expect(
      buildSmartDocumentInboxAction({
        id: "ana-computo",
        doc_type: "computo_metrico",
        parser_used: "computo-ai-extract",
        structured_fields: { _parser_meta: { computo_upload_id: "cmp-inbox-1" } },
        status: "success",
      }),
    ).toMatchObject({
      kind: "computo_review",
      computoUploadId: "cmp-inbox-1",
      label: "Apri revisione computo",
    });
  });

  it("keeps inbox redirects auditable by appending the analysis id and document type", () => {
    expect(
      buildSmartDocumentInboxAction({
        id: "ana-listino",
        doc_type: "listino_prezzi",
        parser_used: "listino-ai-import",
        structured_fields: null,
        status: "review_required",
      }),
    ).toMatchObject({
      kind: "redirect",
      url: "/azienda/operativo/listino?action=import&analysis_id=ana-listino&doc_type=listino_prezzi",
    });
  });

  it("summarizes inbox rows by operational state", () => {
    expect(
      summarizeSmartDocumentInbox([
        { id: "1", doc_type: "computo_metrico", parser_used: "computo-ai-extract", status: "success" },
        { id: "2", doc_type: "fattura", parser_used: "router_only", status: "processing" },
        { id: "3", doc_type: "listino_prezzi", parser_used: "listino-ai-import", status: "review_required" },
        { id: "4", doc_type: "altro", parser_used: "router_only", status: "failed" },
      ]),
    ).toEqual({
      total: 4,
      ready: 1,
      processing: 1,
      reviewRequired: 1,
      failed: 1,
    });
  });

  it("marks inbox rows with blocking warnings as errors even when the status is successful", () => {
    expect(
      getSmartDocumentInboxStatusTone({
        id: "ana-warning",
        doc_type: "preventivo",
        parser_used: "computo-ai-extract",
        status: "success",
        validation_warnings: [{ severity: "error", message: "Totale non coerente" }],
      }),
    ).toBe("error");
  });

  it("builds a review model with field confidence and source evidence", () => {
    const review = buildSmartDocumentReviewModel({
      id: "ana-review",
      doc_type: "fattura",
      parser_used: "fattura-ai-extract",
      status: "review_required",
      structured_fields: {
        fornitore: "Edil Store Srl",
        intestazione: { numero: "F-123", data: "2026-05-24" },
        totali: { totale_documento_eur: 1280.5 },
        _field_confidence: {
          fornitore: 0.94,
          "totali.totale_documento_eur": 0.58,
        },
        _source_refs: {
          fornitore: { page: 1, text: "Edil Store Srl" },
          "totali.totale_documento_eur": { page: 2, row: 18, text: "Totale documento 1.280,50" },
        },
      },
      validation_warnings: [{ severity: "warn", message: "Totale da controllare" }],
    });

    expect(review.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "fornitore",
          value: "Edil Store Srl",
          confidence: 0.94,
          tone: "success",
          source: "Pag. 1 · Edil Store Srl",
        }),
        expect.objectContaining({
          path: "totali.totale_documento_eur",
          value: "1280.5",
          confidence: 0.58,
          tone: "warning",
          source: "Pag. 2 · Riga 18 · Totale documento 1.280,50",
        }),
      ]),
    );
    expect(review.lowConfidenceCount).toBe(1);
    expect(review.sourceEvidenceCount).toBe(2);
    expect(review.reviewScore).toBeLessThan(100);
  });

  it("summarizes repeated line groups and flags missing critical computo data", () => {
    const review = buildSmartDocumentReviewModel({
      id: "ana-computo-review",
      doc_type: "computo_metrico",
      parser_used: "computo-ai-extract",
      status: "success",
      structured_fields: {
        cliente: "Mario Rossi",
        righe: [
          { descrizione: "Posa infisso PVC", quantita: 3, unita_misura: "pz" },
          { descrizione: "Smaltimento vecchi serramenti", quantita: 1, unita_misura: "a corpo" },
        ],
      },
    });

    expect(review.groups).toEqual([
      expect.objectContaining({
        path: "righe",
        count: 2,
        sample: "Posa infisso PVC",
      }),
    ]);
    expect(review.missingCritical).toContain("Totale/importo");
    expect(review.reviewScore).toBeLessThan(100);
  });

  it("keeps review previews concise and excludes internal parser metadata", () => {
    const review = buildSmartDocumentReviewModel({
      id: "ana-safe-preview",
      doc_type: "documento_generico",
      parser_used: "router_only",
      structured_fields: {
        oggetto: "Contratto di manutenzione annuale con descrizione molto lunga ".repeat(8),
        _parser_meta: { computo_upload_id: "cmp-hidden" },
        _source_refs: { oggetto: "Pagina 1" },
      },
    });

    expect(review.fields).toHaveLength(1);
    expect(review.fields[0]).toMatchObject({
      path: "oggetto",
      source: "Pagina 1",
    });
    expect(review.fields[0].value.length).toBeLessThanOrEqual(160);
    expect(review.fields.some((field) => field.path.startsWith("_"))).toBe(false);
  });
});
