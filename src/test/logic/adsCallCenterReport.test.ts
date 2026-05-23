import { describe, expect, it } from "vitest";

import {
  buildAdsCallCenterReportRows,
  summarizeAdsCallCenterReportRows,
} from "@/lib/reporting/adsCallCenterReport";

describe("ads call center reporting", () => {
  it("keeps Meta and Google call outcomes separate and computes operational KPIs", () => {
    const rows = buildAdsCallCenterReportRows({
      contacts: [
        {
          id: "lead-meta",
          created_at: "2026-05-01T08:00:00.000Z",
          source: "Meta Lead Ads",
          attr_source: "facebook",
          attr_medium: "paid_social",
          attr_campaign: "Serramenti Meta",
          meta_campaign_id: "238500000",
        },
        {
          id: "lead-google",
          created_at: "2026-05-01T09:00:00.000Z",
          source: "Google Ads",
          attr_source: "google",
          attr_medium: "cpc",
          attr_campaign: "Serramenti Search",
          google_campaign_id: "987654321",
          gclid: "gclid-1",
        },
      ],
      calls: [
        {
          id: "call-meta-1",
          contact_id: "lead-meta",
          outcome: "no_answer",
          started_at: "2026-05-01T08:03:00.000Z",
          duration_sec: 0,
        },
        {
          id: "call-meta-2",
          contact_id: "lead-meta",
          outcome: "answered",
          started_at: "2026-05-01T08:20:00.000Z",
          duration_sec: 420,
        },
        {
          id: "call-google-1",
          contact_id: "lead-google",
          outcome: "answered",
          started_at: "2026-05-01T10:00:00.000Z",
          duration_sec: 240,
        },
      ],
      appointments: [
        { id: "app-meta", contact_id: "lead-meta", status: "scheduled" },
        { id: "app-google", contact_id: "lead-google", status: "cancelled" },
      ],
    });

    const meta = rows.find((row) => row.platform === "meta");
    const google = rows.find((row) => row.platform === "google");

    expect(meta?.campaignName).toBe("Serramenti Meta");
    expect(meta?.metrics.leads).toBe(1);
    expect(meta?.metrics.calledLeads).toBe(1);
    expect(meta?.metrics.answeredLeads).toBe(1);
    expect(meta?.metrics.totalCalls).toBe(2);
    expect(meta?.metrics.avgSpeedToLeadMin).toBe(3);
    expect(meta?.metrics.avgAnsweredDurationMin).toBe(7);
    expect(meta?.metrics.appointments).toBe(1);

    expect(google?.campaignName).toBe("Serramenti Search");
    expect(google?.metrics.totalCalls).toBe(1);
    expect(google?.metrics.avgSpeedToLeadMin).toBe(60);
    expect(google?.metrics.appointments).toBe(0);

    const totals = summarizeAdsCallCenterReportRows(rows);
    expect(totals.leads).toBe(2);
    expect(totals.totalCalls).toBe(3);
    expect(totals.contactRatePct).toBe(100);
    expect(totals.appointmentRatePct).toBe(50);
  });
});
