import { describe, expect, it } from "vitest";

import {
  buildAdsAttributionMetrics,
  buildCrmCapiEvent,
  buildOptimizationRecommendations,
  isAdsAttributedContact,
  isGoogleAttributedContact,
  isMetaAttributedContact,
} from "@/lib/ads/crmAttribution";

describe("ads CRM attribution", () => {
  it("computes economic KPIs from CRM outcomes, not vanity metrics only", () => {
    const metrics = buildAdsAttributionMetrics({
      spendCents: 42000,
      leads: 21,
      opportunities: 9,
      appointments: 6,
      won: 3,
      revenueCents: 780000,
    });

    expect(metrics.costPerLeadCents).toBe(2000);
    expect(metrics.costPerOpportunityCents).toBe(4667);
    expect(metrics.costPerAppointmentCents).toBe(7000);
    expect(metrics.costPerSaleCents).toBe(14000);
    expect(metrics.leadToOpportunityRatePct).toBe(42.9);
    expect(metrics.leadToAppointmentRatePct).toBe(28.6);
    expect(metrics.appointmentToSaleRatePct).toBe(50);
    expect(metrics.roas).toBe(18.57);
  });

  it("recognizes Meta-attributed CRM contacts with campaign ids or paid-social attribution", () => {
    expect(
      isMetaAttributedContact({
        source: "Meta Lead Ads",
        source_campaign_id: "238500000",
      }),
    ).toBe(true);

    expect(
      isMetaAttributedContact({
        source: "manual",
        attr_source: "facebook",
        attr_medium: "paid_social",
      }),
    ).toBe(true);

    expect(isMetaAttributedContact({ source: "referral", attr_source: "google" })).toBe(false);
  });

  it("recognizes Google Ads CRM contacts without mixing them with Meta", () => {
    expect(
      isGoogleAttributedContact({
        source: "Google Ads",
        attr_source: "google",
        attr_medium: "cpc",
        gclid: "test-gclid",
      }),
    ).toBe(true);

    expect(
      isGoogleAttributedContact({
        source: "manual",
        attr_source: "adwords",
        attr_medium: "paid_search",
      }),
    ).toBe(true);

    expect(isGoogleAttributedContact({ source: "Meta Lead Ads", attr_source: "facebook" })).toBe(false);
    expect(isAdsAttributedContact({ source: "Meta Lead Ads" }, "meta")).toBe(true);
    expect(isAdsAttributedContact({ source: "Google Ads", gclid: "click-1" }, "google")).toBe(true);
    expect(isAdsAttributedContact({ source: "Google Ads", gclid: "click-1" }, "meta")).toBe(false);
    expect(isAdsAttributedContact({ source: "Google Ads", gclid: "click-1" }, "all")).toBe(true);
  });

  it("maps CRM milestones to deterministic Meta CAPI events", () => {
    const event = buildCrmCapiEvent({
      companyId: "company-1",
      entityType: "opportunity",
      entityId: "opp-1",
      eventKind: "opportunity_won",
      eventTime: 1_779_456_000,
      sourceUrl: "https://edilizia.example/preventivo?utm_campaign=serramenti",
      valueCents: 1250000,
      currency: "EUR",
      contact: {
        id: "contact-1",
        email: "cliente@example.com",
        phone: "+393331112223",
        firstName: "Mario",
        lastName: "Rossi",
        fbc: "fb.1.1779456000.click",
        fbp: "fb.1.1779456000.browser",
      },
      attribution: {
        campaignId: "238500000",
        campaignName: "Serramenti - Preventivi",
        adSetId: "238500001",
        adId: "238500002",
      },
    });

    expect(event.event_name).toBe("Purchase");
    expect(event.event_id).toBe("crm:company-1:opportunity:opp-1:Purchase");
    expect(event.action_source).toBe("system_generated");
    expect(event.user_data.email).toBe("cliente@example.com");
    expect(event.user_data.external_id).toBe("contact-1");
    expect(event.custom_data.value).toBe(12500);
    expect(event.custom_data.currency).toBe("EUR");
    expect(event.custom_data.content_ids).toEqual(["238500000", "238500001", "238500002"]);
  });

  it("creates post-launch recommendations after enough data exists", () => {
    const recommendations = buildOptimizationRecommendations({
      hoursSinceLaunch: 84,
      targetCplCents: 2500,
      metrics: buildAdsAttributionMetrics({
        spendCents: 78000,
        leads: 24,
        opportunities: 2,
        appointments: 1,
        won: 0,
        revenueCents: 0,
      }),
    });

    expect(recommendations.map((r) => r.kind)).toContain("qualify");
    expect(recommendations[0].severity).toBe("warning");
  });
});
