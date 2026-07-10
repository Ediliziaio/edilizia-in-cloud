import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReferralLink } from "@/lib/referral";

describe("referral links", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points to the tracked customer landing /ref/:code on the configured domain", () => {
    vi.stubEnv("VITE_REFERRAL_APP_URL", "https://app.example.com");

    expect(buildReferralLink("ABC123")).toBe("https://app.example.com/ref/ABC123");
  });

  it("uses the domain only (ignores any configured login path) and trims optional UTM values", () => {
    vi.stubEnv("VITE_REFERRAL_APP_URL", "https://app.example.com/prova");

    expect(buildReferralLink("ABC123", { utm_source: " facebook ", utm_campaign: "" })).toBe(
      "https://app.example.com/ref/ABC123?utm_source=facebook",
    );
  });
});
