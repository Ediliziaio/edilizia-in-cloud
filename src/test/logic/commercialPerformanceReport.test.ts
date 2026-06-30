import { describe, expect, it } from "vitest";

import { buildCommercialPerformanceReport } from "@/lib/reporting/commercialPerformanceReport";

describe("commercial performance report", () => {
  const now = new Date("2026-05-23T10:00:00.000Z");

  it("computes quotes, forecast, lead quality, margins and loss reasons from CRM data", () => {
    const report = buildCommercialPerformanceReport({
      now,
      monthlyTargetCents: 100_000_00,
      contacts: [
        {
          id: "lead-good",
          created_at: "2026-05-01T08:00:00.000Z",
          source: "Meta Lead Ads",
          attr_campaign: "Serramenti Meta",
          province: "MB",
          assigned_to: "seller-1",
          call_center_id: "cc-1",
          icp_score: 82,
          lead_score: 77,
          ai_score: 80,
        },
        {
          id: "lead-bad",
          created_at: "2026-05-02T08:00:00.000Z",
          source: "Google Ads",
          attr_campaign: "Search Bagni",
          province: "MI",
          assigned_to: "seller-2",
          call_center_id: "cc-2",
          icp_score: 30,
          lead_score: 25,
          ai_score: 35,
          stato: "scartato",
          tags: ["fuori-zona"],
        },
      ],
      appointments: [
        {
          id: "app-1",
          contact_id: "lead-good",
          assigned_to: "seller-1",
          appointment_date: "2026-05-03",
          status: "confermato",
          is_completed: true,
          calendar_id: "cal-mkt", // calendario marketing → conteggiato nelle stat CRM
        },
      ],
      quotes: [
        {
          id: "quote-1",
          contact_id: "lead-good",
          opportunity_id: "opp-won",
          status: "accettata",
          total: 40_000,
          totale_costo_interno: 24_000,
          totale_overhead: 2_000,
          created_at: "2026-05-06T09:00:00.000Z",
          signed_at: "2026-05-10T09:00:00.000Z",
        },
        {
          id: "quote-2",
          contact_id: "lead-bad",
          opportunity_id: "opp-lost",
          status: "rifiutata",
          total: 20_000,
          margine_totale_percentuale: 25,
          created_at: "2026-05-08T09:00:00.000Z",
          refused_reason: "Prezzo troppo alto",
        },
      ],
      opportunities: [
        {
          id: "opp-won",
          contact_id: "lead-good",
          status: "won",
          value: 40_000,
          probability: 100,
          updated_at: "2026-05-12T09:00:00.000Z",
        },
        {
          id: "opp-open-30",
          contact_id: "lead-good",
          status: "open",
          value: 30_000,
          probability: 70,
          expected_close_date: "2026-06-10",
          next_action: "Follow-up offerta",
          next_action_date: "2026-05-25",
        },
        {
          id: "opp-open-60-no-step",
          contact_id: "lead-bad",
          status: "open",
          value: 50_000,
          probability: null,
          expected_close_date: "2026-07-05",
        },
        {
          id: "opp-lost",
          contact_id: "lead-bad",
          status: "lost",
          value: 20_000,
          updated_at: "2026-05-14T09:00:00.000Z",
          lost_reason_category: "prezzo",
          lost_reason: "Prezzo troppo alto",
        },
      ],
      orders: [
        {
          id: "order-1",
          quote_id: "quote-1",
          total_amount: 40_000,
          created_at: "2026-05-11T09:00:00.000Z",
          status: "active",
        },
      ],
    });

    expect(report.quotes.issued).toBe(2);
    expect(report.quotes.accepted).toBe(1);
    expect(report.quotes.rejected).toBe(1);
    expect(report.quotes.averageValueCents).toBe(30_000_00);
    expect(report.quotes.avgAppointmentToQuoteDays).toBe(3);
    expect(report.quotes.avgQuoteToSaleDays).toBe(5);

    expect(report.forecast.weighted30Cents).toBe(21_000_00);
    expect(report.forecast.weighted60Cents).toBe(15_000_00);
    expect(report.forecast.openWithoutNextStep).toBe(1);
    expect(report.forecast.monthlyTargetRisk).toBe("rischio");

    expect(report.leadQuality.good).toBe(1);
    expect(report.leadQuality.poor).toBe(1);
    expect(report.leadQuality.disqualified).toBe(1);
    expect(report.leadQuality.topSegments[0]?.label).toBe("Serramenti Meta");

    expect(report.margin.estimatedMarginCents).toBe(19_000_00);
    expect(report.margin.averageMarginPct).toBeCloseTo(31.7, 1);
    expect(report.margin.coveragePct).toBe(100);

    expect(report.lossReasons[0]).toMatchObject({
      reason: "prezzo",
      count: 2,
      valueCents: 40_000_00,
    });

    expect(report.sync.healthLabel).toBe("Allineato");
    expect(report.sync.healthScore).toBe(100);
    expect(report.sync.acceptedQuotesWithoutOrder).toBe(0);
    expect(report.sync.quoteOpportunityLinkPct).toBe(100);
  });

  it("does not fake margin or target risk when the underlying data is missing", () => {
    const report = buildCommercialPerformanceReport({
      now,
      contacts: [{ id: "lead-1", created_at: "2026-05-01T08:00:00.000Z" }],
      appointments: [],
      quotes: [{ id: "quote-1", contact_id: "lead-1", status: "inviata", total: 10_000, created_at: "2026-05-05T09:00:00.000Z" }],
      opportunities: [],
      orders: [],
    });

    expect(report.margin.estimatedMarginCents).toBe(0);
    expect(report.margin.coveragePct).toBe(0);
    expect(report.margin.dataQualityWarning).toContain("margine");
    expect(report.forecast.monthlyTargetRisk).toBe("target_non_configurato");
  });

  it("surfaces synchronization issues before commercial KPIs look trustworthy", () => {
    const report = buildCommercialPerformanceReport({
      now,
      contacts: [
        { id: "lead-unscored", created_at: "2026-05-01T08:00:00.000Z" },
      ],
      appointments: [
        { id: "app-orphan", calendar_id: "cal-mkt", appointment_date: "2026-05-05", status: "confermato", is_completed: true },
      ],
      quotes: [
        { id: "quote-orphan", status: "accettata", total: 15_000, created_at: "2026-05-06T09:00:00.000Z" },
      ],
      opportunities: [
        { id: "opp-orphan", status: "open", value: 30_000, created_at: "2026-04-01T09:00:00.000Z" },
        { id: "opp-lost-no-reason", contact_id: "lead-unscored", status: "lost", value: 8_000, updated_at: "2026-05-09T09:00:00.000Z" },
      ],
      orders: [
        { id: "order-orphan", total_amount: 15_000, created_at: "2026-05-10T09:00:00.000Z" },
      ],
    });

    expect(report.sync.healthLabel).toBe("Critico");
    expect(report.sync.healthScore).toBeLessThan(70);
    expect(report.sync.quotesWithoutContact).toBe(1);
    expect(report.sync.quotesWithoutOpportunity).toBe(1);
    expect(report.sync.acceptedQuotesWithoutOrder).toBe(1);
    expect(report.sync.appointmentsWithoutContact).toBe(1);
    expect(report.sync.opportunitiesWithoutContact).toBe(1);
    expect(report.sync.ordersWithoutQuote).toBe(1);
    expect(report.sync.lostOpportunitiesWithoutReason).toBe(1);
    expect(report.sync.unscoredLeads).toBe(1);
    expect(report.sync.actions.map((action) => action.key)).toEqual(
      expect.arrayContaining(["connect-quotes", "connect-appointments", "close-sales-loop", "score-leads"]),
    );
  });

  it("keeps operational calendar rows and commesse out of CRM synchronization gaps", () => {
    const report = buildCommercialPerformanceReport({
      now,
      contacts: [],
      appointments: [
        { id: "blocked-slot", appointment_date: "2026-05-05", is_blocked_slot: true },
        { id: "site-start", appointment_date: "2026-05-06", appointment_type: "inizio_lavori", order_id: "order-site" },
        { id: "commercial-orphan", calendar_id: "cal-mkt", appointment_date: "2026-05-07", appointment_type: "appuntamento" },
      ],
      quotes: [],
      opportunities: [],
      orders: [
        { id: "order-site", order_type: "commessa", total_amount: 40_000, created_at: "2026-05-10T09:00:00.000Z" },
        { id: "order-with-number", quote_number: "PREV-24", total_amount: 9_000, created_at: "2026-05-11T09:00:00.000Z" },
      ],
    });

    expect(report.sync.appointmentsWithoutContact).toBe(1);
    expect(report.sync.ordersWithoutQuote).toBe(0);
    expect(report.sync.actions.map((action) => action.key)).toContain("connect-appointments");
    expect(report.sync.actions.map((action) => action.key)).not.toContain("close-sales-loop");
  });
});
