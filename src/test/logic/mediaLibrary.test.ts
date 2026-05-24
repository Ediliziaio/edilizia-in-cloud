import { describe, expect, it } from "vitest";
import {
  buildMediaLibraryItem,
  canAccessMediaLibrary,
  combineMediaLibrarySourceBatches,
  filterMediaLibraryItemsForPermissions,
  mediaLibraryItemMatchesTab,
  mediaLibraryItemMatchesSearch,
  pickMediaLibraryDetailItem,
  summarizeMediaLibraryItems,
} from "@/lib/mediaLibrary";

const BASE_PERMISSIONS = {
  isAdmin: false,
  canViewOrders: false,
  canViewTickets: false,
  canViewCustomers: false,
  canViewBilling: false,
  canViewPrimaNota: false,
  canViewTesoreria: false,
  canViewCosts: false,
  canViewMarketing: false,
  canViewMarketingContacts: false,
  canViewMarketingOpportunities: false,
  canViewMarketingReports: false,
  canViewMarketingDashboard: false,
  canViewSettingsCustomization: false,
  canViewRenderAi: false,
  canViewWarehouse: false,
  canViewSicurezzaCantiere: false,
  canViewSubappaltatori: false,
  canViewGiornaleLavori: false,
};

describe("media library rules", () => {
  it("grants access to users that can see at least one document-producing area", () => {
    expect(canAccessMediaLibrary({ ...BASE_PERMISSIONS })).toBe(false);
    expect(canAccessMediaLibrary({ ...BASE_PERMISSIONS, canViewMarketingOpportunities: true })).toBe(true);
    expect(canAccessMediaLibrary({ ...BASE_PERMISSIONS, canViewBilling: true })).toBe(true);
    expect(canAccessMediaLibrary({ ...BASE_PERMISSIONS, canViewOrders: true })).toBe(true);
    expect(canAccessMediaLibrary({ ...BASE_PERMISSIONS, isAdmin: true })).toBe(true);
  });

  it("classifies sensitive and operational document types consistently", () => {
    expect(
      buildMediaLibraryItem({
        id: "doc-1",
        source: "ai_analysis",
        fileName: "contratto firmato.pdf",
        docType: "contratto",
        status: "success",
        createdAt: "2026-05-24T08:00:00Z",
        storageBucket: "documenti-smart",
        storagePath: "company/contratto.pdf",
      }),
    ).toMatchObject({
      category: "riservati",
      securityLevel: "confidential",
      areaLabel: "Legale e firme",
    });

    expect(
      buildMediaLibraryItem({
        id: "cmp-1",
        source: "computo",
        fileName: "computo metrico.xlsx",
        docType: "computo_metrico",
        status: "completed",
        createdAt: "2026-05-24T08:00:00Z",
      }),
    ).toMatchObject({
      category: "preventivi",
      securityLevel: "standard",
      areaLabel: "Preventivi",
    });

    expect(
      buildMediaLibraryItem({
        id: "img-1",
        source: "attachment",
        fileName: "foto cantiere.jpg",
        docType: "foto_cantiere",
        status: "attached",
        createdAt: "2026-05-24T08:00:00Z",
      }),
    ).toMatchObject({
      category: "foto_media",
      areaLabel: "Cantieri",
    });
  });

  it("adds smart drive metadata for author, integration and document history", () => {
    const item = buildMediaLibraryItem({
      id: "analysis-1",
      source: "ai_analysis",
      fileName: "computo bagno.pdf",
      docType: "computo_metrico",
      status: "success",
      createdAt: "2026-05-24T08:00:00Z",
      updatedAt: "2026-05-24T08:03:00Z",
      actorId: "user-1",
      actorLabel: "Giulia Bianchi",
      actionLabel: "Analizzato da AI",
      integrationLabel: "Inbox documenti AI",
      linkedEntityLabel: "Preventivo PREV-001",
      linkedEntityTable: "quotes",
      linkedEntityId: "quote-1",
      metadataFacts: ["Parser: pdf", "Pagine: 8"],
    });

    expect(item).toMatchObject({
      actorId: "user-1",
      actorLabel: "Giulia Bianchi",
      actionLabel: "Analizzato da AI",
      integrationLabel: "Inbox documenti AI",
      linkedEntityId: "quote-1",
      metadataFacts: ["Parser: pdf", "Pagine: 8"],
    });
    expect(item.timeline).toEqual([
      {
        label: "Caricato",
        at: "2026-05-24T08:00:00Z",
        detail: "Giulia Bianchi",
        tone: "neutral",
      },
      {
        label: "Analizzato da AI",
        at: "2026-05-24T08:03:00Z",
        detail: "Inbox documenti AI",
        tone: "success",
      },
    ]);
    expect(mediaLibraryItemMatchesSearch(item, "Giulia")).toBe(true);
    expect(mediaLibraryItemMatchesSearch(item, "Inbox documenti")).toBe(true);
  });

  it("filters media by role-sensitive categories instead of leaking everything", () => {
    const items = [
      buildMediaLibraryItem({
        id: "crm",
        source: "ai_analysis",
        fileName: "preventivo cliente.pdf",
        docType: "preventivo",
        status: "success",
        createdAt: "2026-05-24T08:00:00Z",
      }),
      buildMediaLibraryItem({
        id: "invoice",
        source: "ai_analysis",
        fileName: "fattura.pdf",
        docType: "fattura",
        status: "success",
        createdAt: "2026-05-24T08:00:00Z",
      }),
      buildMediaLibraryItem({
        id: "contract",
        source: "ai_analysis",
        fileName: "contratto.pdf",
        docType: "contratto",
        status: "success",
        createdAt: "2026-05-24T08:00:00Z",
      }),
    ];

    expect(
      filterMediaLibraryItemsForPermissions(items, {
        ...BASE_PERMISSIONS,
        canViewMarketingOpportunities: true,
      }).map((item) => item.id),
    ).toEqual(["crm"]);

    expect(
      filterMediaLibraryItemsForPermissions(items, {
        ...BASE_PERMISSIONS,
        canViewBilling: true,
      }).map((item) => item.id),
    ).toEqual(["invoice"]);

    expect(
      filterMediaLibraryItemsForPermissions(items, {
        ...BASE_PERMISSIONS,
        isAdmin: true,
      }).map((item) => item.id),
    ).toEqual(["crm", "invoice", "contract"]);
  });

  it("infers generic attachment visibility from the linked operational entity", () => {
    const orderAttachment = buildMediaLibraryItem({
      id: "order-attachment",
      source: "attachment",
      fileName: "verbale sopralluogo.pdf",
      docType: null,
      status: "attached",
      createdAt: "2026-05-24T08:00:00Z",
      linkedEntityLabel: "Commessa Milano",
      linkedEntityTable: "orders",
    });

    const invoiceAttachment = buildMediaLibraryItem({
      id: "invoice-attachment",
      source: "attachment",
      fileName: "fattura fornitore.pdf",
      docType: null,
      status: "attached",
      createdAt: "2026-05-24T08:00:00Z",
      linkedEntityLabel: "Fattura",
      linkedEntityTable: "invoices",
    });

    const opportunityAttachment = buildMediaLibraryItem({
      id: "opportunity-attachment",
      source: "attachment",
      fileName: "brief cliente.pdf",
      docType: null,
      status: "attached",
      createdAt: "2026-05-24T08:00:00Z",
      linkedEntityLabel: "Opportunita",
      linkedEntityTable: "opportunities",
    });

    expect(orderAttachment).toMatchObject({ category: "cantieri", areaLabel: "Cantieri" });
    expect(invoiceAttachment).toMatchObject({ category: "fiscale", areaLabel: "Finanza" });
    expect(opportunityAttachment).toMatchObject({ category: "crm", areaLabel: "CRM" });

    expect(
      filterMediaLibraryItemsForPermissions([orderAttachment], {
        ...BASE_PERMISSIONS,
        canViewMarketingOpportunities: true,
      }),
    ).toEqual([]);

    expect(
      filterMediaLibraryItemsForPermissions([invoiceAttachment], {
        ...BASE_PERMISSIONS,
        canViewBilling: true,
      }).map((item) => item.id),
    ).toEqual(["invoice-attachment"]);
  });

  it("keeps the manual cleanup queue focused on unresolved documents", () => {
    const linkedReady = buildMediaLibraryItem({
      id: "linked-ready",
      source: "attachment",
      fileName: "foto cantiere.jpg",
      docType: "foto_cantiere",
      status: "attached",
      createdAt: "2026-05-24T08:00:00Z",
      linkedEntityLabel: "Commessa Milano",
      linkedEntityTable: "orders",
    });

    const unlinkedAi = buildMediaLibraryItem({
      id: "unlinked-ai",
      source: "ai_analysis",
      fileName: "documento da sistemare.pdf",
      docType: "documento_generico",
      status: "success",
      createdAt: "2026-05-24T08:00:00Z",
    });

    const warning = buildMediaLibraryItem({
      id: "warning",
      source: "ai_analysis",
      fileName: "listino incerto.pdf",
      docType: "listino_prezzi",
      status: "review_required",
      createdAt: "2026-05-24T08:00:00Z",
    });

    expect(mediaLibraryItemMatchesTab(linkedReady, "da_classificare")).toBe(false);
    expect(mediaLibraryItemMatchesTab(unlinkedAi, "da_classificare")).toBe(true);
    expect(mediaLibraryItemMatchesTab(warning, "da_classificare")).toBe(true);
    expect(mediaLibraryItemMatchesTab(linkedReady, "collegati")).toBe(true);
  });

  it("keeps loading successful source batches when another archive source fails", () => {
    const ready = buildMediaLibraryItem({
      id: "ready",
      source: "computo",
      fileName: "computo pronto.pdf",
      docType: "computo_metrico",
      status: "completed",
      createdAt: "2026-05-24T08:00:00Z",
    });

    const result = combineMediaLibrarySourceBatches([
      { label: "Analisi AI", items: [], errorMessage: "permission denied" },
      { label: "Computi", items: [ready] },
      { label: "Allegati", items: [], errorMessage: null },
    ]);

    expect(result.items.map((item) => item.id)).toEqual(["ready"]);
    expect(result.warnings).toEqual(["Analisi AI: permission denied"]);
  });

  it("selects details only from the currently filtered view", () => {
    const quote = buildMediaLibraryItem({
      id: "quote",
      source: "computo",
      fileName: "computo.pdf",
      docType: "computo_metrico",
      status: "completed",
      createdAt: "2026-05-24T08:00:00Z",
    });
    const invoice = buildMediaLibraryItem({
      id: "invoice",
      source: "ai_analysis",
      fileName: "fattura.pdf",
      docType: "fattura",
      status: "success",
      createdAt: "2026-05-24T09:00:00Z",
    });

    expect(pickMediaLibraryDetailItem([invoice], "quote")?.id).toBe("invoice");
    expect(pickMediaLibraryDetailItem([], "quote")).toBeNull();
  });

  it("matches search across file name, type, area and linked entity", () => {
    const item = buildMediaLibraryItem({
      id: "linked-computo",
      source: "computo",
      fileName: "01_COMPUTO CINISELLO.pdf",
      docType: "computo_metrico",
      status: "completed",
      createdAt: "2026-05-24T08:00:00Z",
      linkedEntityLabel: "Ristrutturazione bagno piano primo",
      linkedEntityTable: "quotes",
    });

    expect(mediaLibraryItemMatchesSearch(item, "")).toBe(true);
    expect(mediaLibraryItemMatchesSearch(item, "cinisello")).toBe(true);
    expect(mediaLibraryItemMatchesSearch(item, "computo_metrico")).toBe(true);
    expect(mediaLibraryItemMatchesSearch(item, "preventivi")).toBe(true);
    expect(mediaLibraryItemMatchesSearch(item, "bagno")).toBe(true);
    expect(mediaLibraryItemMatchesSearch(item, "fattura")).toBe(false);
  });

  it("summarizes drive state for KPI cards and cleanup queues", () => {
    const items = [
      buildMediaLibraryItem({
        id: "ready",
        source: "ai_analysis",
        fileName: "preventivo.pdf",
        docType: "preventivo",
        status: "success",
        createdAt: "2026-05-24T08:00:00Z",
      }),
      buildMediaLibraryItem({
        id: "review",
        source: "ai_analysis",
        fileName: "listino.pdf",
        docType: "listino_prezzi",
        status: "review_required",
        createdAt: "2026-05-24T08:00:00Z",
      }),
      buildMediaLibraryItem({
        id: "linked",
        source: "attachment",
        fileName: "foto.jpg",
        docType: "foto_cantiere",
        status: "attached",
        createdAt: "2026-05-24T08:00:00Z",
        linkedEntityLabel: "Commessa Milano",
      }),
    ];

    expect(summarizeMediaLibraryItems(items)).toMatchObject({
      total: 3,
      aiInbox: 2,
      reviewRequired: 1,
      linked: 1,
      reserved: 0,
    });
  });
});
