import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReferralLink } from "@/lib/referral";

describe("referral links", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured app domain instead of the current admin origin", () => {
    vi.stubEnv("VITE_REFERRAL_APP_URL", "https://app.example.com");

    expect(buildReferralLink("ABC123")).toBe("https://app.example.com/referral-login?ref=ABC123");
  });

  it("keeps custom landing paths and trims optional UTM values", () => {
    vi.stubEnv("VITE_REFERRAL_APP_URL", "https://app.example.com/prova");

    expect(buildReferralLink("ABC123", { utm_source: " facebook ", utm_campaign: "" })).toBe(
      "https://app.example.com/prova?ref=ABC123&utm_source=facebook",
    );
  });
});
