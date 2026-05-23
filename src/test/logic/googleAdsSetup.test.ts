import { describe, expect, it } from "vitest";

import {
  buildGoogleAdsAccountPayload,
  buildGoogleAdsContactAttributionUpdate,
  buildGoogleAdsReadinessChecks,
  formatGoogleCustomerId,
  isValidGoogleCustomerId,
  normalizeGoogleCustomerId,
} from "@/lib/googleAds/setup";

describe("google ads setup helpers", () => {
  it("normalizes Customer IDs from common Google Ads formats", () => {
    expect(normalizeGoogleCustomerId("123-456-7890")).toBe("1234567890");
    expect(normalizeGoogleCustomerId("customers/987-654-3210")).toBe("9876543210");
    expect(normalizeGoogleCustomerId("  111 222 3333  ")).toBe("1112223333");
  });

  it("validates and formats only 10-digit Customer IDs", () => {
    expect(isValidGoogleCustomerId("123-456-7890")).toBe(true);
    expect(formatGoogleCustomerId("1234567890")).toBe("123-456-7890");

    expect(isValidGoogleCustomerId("123456789")).toBe(false);
    expect(formatGoogleCustomerId("not-a-customer")).toBe("");
  });

  it("builds a selected account payload with normalized ids and safe defaults", () => {
    const payload = buildGoogleAdsAccountPayload({
      companyId: "company-1",
      integrationId: "integration-1",
      customerId: "123-456-7890",
      customerName: " Azienda Search ",
      managerCustomerId: "customers/111-222-3333",
      currency: "",
      timeZone: "",
      isManager: false,
      isTestAccount: true,
    });

    expect(payload).toEqual({
      company_id: "company-1",
      integration_id: "integration-1",
      customer_id: "1234567890",
      customer_name: "Azienda Search",
      manager_customer_id: "1112223333",
      currency: "EUR",
      time_zone: "Europe/Rome",
      is_manager: false,
      is_test_account: true,
      selected: true,
    });
  });

  it("surfaces the Google Ads prerequisites that block live publishing and offline sync", () => {
    const checks = buildGoogleAdsReadinessChecks({
      integrationConnected: true,
      hasSelectedAccount: true,
      hasValidCustomerId: true,
      hasApiCredentials: false,
      hasOfflineConversionQueue: true,
      pendingOfflineEvents: 3,
    });

    expect(checks.map((check) => check.key)).toEqual([
      "customer_id",
      "integration",
      "offline_conversions",
      "api_credentials",
    ]);
    expect(checks.find((check) => check.key === "api_credentials")?.status).toBe("warning");
    expect(checks.find((check) => check.key === "offline_conversions")?.detail).toContain("3");
  });

  it("builds contact attribution updates for paid Google traffic", () => {
    expect(
      buildGoogleAdsContactAttributionUpdate({
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "serramenti-monza",
        gclid: "click-123",
      }),
    ).toEqual({
      source: "Google Ads",
      source_campaign_id: "serramenti-monza",
      attr_source: "google",
      attr_medium: "cpc",
      attr_campaign: "serramenti-monza",
      gclid: "click-123",
      google_campaign_id: "serramenti-monza",
    });

    expect(
      buildGoogleAdsContactAttributionUpdate({
        utmSource: "newsletter",
        utmMedium: "email",
        utmCampaign: "promo",
        gclid: "",
      }),
    ).toBeNull();
    expect(
      buildGoogleAdsContactAttributionUpdate({
        utmSource: "google",
        utmMedium: "organic",
        utmCampaign: "seo",
      }),
    ).toBeNull();
  });
});
