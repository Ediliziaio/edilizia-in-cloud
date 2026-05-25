import { describe, expect, it } from "vitest";
import { calculateCruscottoInvoiceStats } from "@/lib/cruscottoInvoiceStats";

describe("calculateCruscottoInvoiceStats", () => {
  it("usa document_type e ignora documenti non fattura o cancellati", () => {
    const stats = calculateCruscottoInvoiceStats([
      {
        document_type: "invoice",
        status: "sent",
        issue_date: "2026-05-03",
        due_date: "2026-05-10",
        total: 1000,
        paid_amount: 200,
        updated_at: "2026-05-03T10:00:00",
        deleted_at: null,
      },
      {
        document_type: "proforma",
        status: "sent",
        issue_date: "2026-05-04",
        due_date: "2026-05-10",
        total: 9000,
        paid_amount: 0,
        updated_at: "2026-05-04T10:00:00",
        deleted_at: null,
      },
      {
        document_type: "invoice",
        status: "sent",
        issue_date: "2026-05-05",
        due_date: "2026-05-10",
        total: 700,
        paid_amount: 0,
        updated_at: "2026-05-05T10:00:00",
        deleted_at: "2026-05-06T10:00:00",
      },
    ], new Date("2026-05-15T12:00:00"));

    expect(stats.total_outstanding).toBe(800);
    expect(stats.overdue_count).toBe(1);
    expect(stats.overdue_amount).toBe(800);
    expect(stats.issued_this_month).toBe(1);
    expect(stats.issued_this_month_amount).toBe(1000);
  });

  it("calcola incassi del mese e scadenze della settimana solo sul residuo aperto", () => {
    const stats = calculateCruscottoInvoiceStats([
      {
        document_type: "fattura",
        status: "paid",
        issue_date: "2026-05-01",
        due_date: "2026-05-02",
        total: 1500,
        paid_amount: 1500,
        updated_at: "2026-05-12T09:00:00",
        deleted_at: null,
      },
      {
        document_type: "invoice",
        status: "delivered",
        issue_date: "2026-05-13",
        due_date: "2026-05-18",
        total: 1200,
        paid_amount: 300,
        updated_at: "2026-05-13T09:00:00",
        deleted_at: null,
      },
    ], new Date("2026-05-15T12:00:00"));

    expect(stats.paid_this_month).toBe(1500);
    expect(stats.total_outstanding).toBe(900);
    expect(stats.due_this_week_count).toBe(1);
    expect(stats.due_this_week_amount).toBe(900);
    expect(stats.overdue_count).toBe(0);
  });
});
