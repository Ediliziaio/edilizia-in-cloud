import { describe, expect, it } from "vitest";
import { getTrackingSnippet } from "@/constants/trackingSnippet";

describe("tracking snippet", () => {
  it("captures and persists modern ad click identifiers", () => {
    const snippet = getTrackingSnippet("company-1", "https://example.supabase.co");

    expect(snippet).toContain("UTM Attribution Tracking V5");
    expect(snippet).toContain("'wbraid'");
    expect(snippet).toContain("'gbraid'");
    expect(snippet).toContain("getClickId('wbraid')");
    expect(snippet).toContain("getClickId('gbraid')");
    expect(snippet).toContain("payload.wbraid");
    expect(snippet).toContain("payload.gbraid");
  });
});
