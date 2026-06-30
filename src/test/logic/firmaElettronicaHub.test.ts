import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  filterSignatureRequests,
  formatFirmaDate,
  getLegacyQuoteStatusFilter,
  getFirmaRequestErrorMessage,
  isFirmaExpired,
  shouldShowFirmaRequestsLoader,
  sortSignatureRequestsByCreatedAt,
} from "@/lib/fea/firmaElettronicaHub";

describe("firma elettronica hub helpers", () => {
  it("filters signature requests without crashing on incomplete database rows", () => {
    const rows = [
      {
        id: "1",
        signer_name: null,
        signer_email: undefined,
        token: null,
        documento_label: "Preventivo FV 24",
        documento_subtitle: null,
      },
      {
        id: "2",
        signer_name: "Mario Rossi",
        signer_email: "mario@example.com",
        token: "abc",
        documento_label: null,
        documento_subtitle: "Cliente retail",
      },
    ];

    expect(() => filterSignatureRequests(rows, "mario")).not.toThrow();
    expect(filterSignatureRequests(rows, "fv")).toEqual([rows[0]]);
    expect(filterSignatureRequests(rows, "MARIO")).toEqual([rows[1]]);
  });

  it("does not show an endless loader when the company query is disabled", () => {
    expect(
      shouldShowFirmaRequestsLoader({
        hasCompanyId: false,
        isLoading: true,
        fetchStatus: "idle",
      }),
    ).toBe(false);

    expect(
      shouldShowFirmaRequestsLoader({
        hasCompanyId: true,
        isLoading: true,
        fetchStatus: "fetching",
      }),
    ).toBe(true);
  });

  it("formats bad or missing dates as a dash", () => {
    expect(formatFirmaDate(null)).toBe("—");
    expect(formatFirmaDate("not-a-date")).toBe("—");
  });

  it("sorts signature requests with invalid created_at values after valid rows", () => {
    const rows = [
      { id: "bad", created_at: "not-a-date" },
      { id: "new", created_at: "2026-05-23T10:00:00Z" },
      { id: "old", created_at: "2026-05-22T10:00:00Z" },
    ];

    expect(sortSignatureRequestsByCreatedAt(rows).map((row) => row.id)).toEqual(["new", "old", "bad"]);
  });

  it("marks a request as expired only when the expiry date is valid and not already signed", () => {
    expect(isFirmaExpired("2026-01-01T00:00:00Z", "pending", new Date("2026-05-23T00:00:00Z"))).toBe(true);
    expect(isFirmaExpired("2026-01-01T00:00:00Z", "signed", new Date("2026-05-23T00:00:00Z"))).toBe(false);
    expect(isFirmaExpired("not-a-date", "pending", new Date("2026-05-23T00:00:00Z"))).toBe(false);
  });

  it("returns an actionable message for stalled signature request queries", () => {
    expect(getFirmaRequestErrorMessage(new Error("Richieste firma: timeout dopo 12 secondi"))).toContain("ha impiegato troppo tempo");
    expect(getFirmaRequestErrorMessage(null)).toContain("Controlla connessione");
  });

  it("loads only legacy quote statuses that can appear in the selected archive filter", () => {
    expect(getLegacyQuoteStatusFilter("tutti")).toEqual(["inviata", "accettata", "rifiutata"]);
    expect(getLegacyQuoteStatusFilter("pending")).toEqual(["inviata"]);
    expect(getLegacyQuoteStatusFilter("expired")).toEqual(["inviata"]);
    expect(getLegacyQuoteStatusFilter("signed")).toEqual(["accettata"]);
    expect(getLegacyQuoteStatusFilter("refused")).toEqual(["rifiutata"]);
    expect(getLegacyQuoteStatusFilter("otp_verified")).toEqual([]);
    expect(getLegacyQuoteStatusFilter("cancelled")).toEqual([]);
  });

  it("does not keep the signature archive in automatic retry loading loops", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/azienda/firma-elettronica/index.tsx"),
      "utf8",
    );

    expect(source).toContain("retry: 0");
    expect(source).toContain("requestsLoadingTimedOut");
    expect(source).toContain("SIGNATURE_ARCHIVE_PAGE_SIZE");
    expect(source).toContain("withClientTimeout");
    expect(source).toContain(".not(\"signature_token\", \"is\", null)");
    expect(source).toContain("readOptionalRows<QuoteSignatureRow>");
    expect(source).not.toContain('throw new Error("Richieste firma: timeout dopo 12 secondi")');

    const signatureQueryStart = source.indexOf('.from("signature_requests" as never)');
    const signatureQueryEnd = source.indexOf("try {", signatureQueryStart);
    const signatureQueryBlock = source.slice(signatureQueryStart, signatureQueryEnd);
    expect(signatureQueryBlock).toContain('.order("created_at", { ascending: false })');
  });

  it("keeps database indexes aligned with the signature archive filters", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20270523233000_signature_archive_performance_indexes.sql"),
      "utf8",
    );

    expect(migration).toContain("idx_signature_requests_company_created_at");
    expect(migration).toContain("ON public.signature_requests(company_id, created_at DESC)");
    expect(migration).toContain("idx_quotes_company_status_signature_created_at");
    expect(migration).toContain("WHERE signature_token IS NOT NULL");
  });
});
