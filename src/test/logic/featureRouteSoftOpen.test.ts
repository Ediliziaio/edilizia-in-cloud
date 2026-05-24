import { describe, expect, it } from "vitest";
import { shouldSoftOpenFeatureCheck } from "@/lib/featureRouteSoftOpen";

describe("FeatureRoute soft-open", () => {
  it("opens the fotovoltaico route while the feature check is still resolving", () => {
    expect(
      shouldSoftOpenFeatureCheck({
        featureKey: "modulo_fotovoltaico_attivo",
        isLoading: true,
        isError: false,
      }),
    ).toBe(true);
  });

  it("does not soft-open disabled features after the feature check resolved", () => {
    expect(
      shouldSoftOpenFeatureCheck({
        featureKey: "modulo_fotovoltaico_attivo",
        isLoading: false,
        isError: false,
      }),
    ).toBe(false);
  });

  it("opens the firma elettronica route while the feature check is still resolving", () => {
    expect(
      shouldSoftOpenFeatureCheck({
        featureKey: "firma_fea",
        isLoading: true,
        isError: false,
      }),
    ).toBe(true);

    expect(
      shouldSoftOpenFeatureCheck({
        featureKey: "firma_fea",
        isLoading: false,
        isError: true,
      }),
    ).toBe(true);
  });

  it("opens the CRM contacts route while the feature check is slow", () => {
    expect(
      shouldSoftOpenFeatureCheck({
        featureKey: "crm_modulo",
        isLoading: true,
        isError: false,
      }),
    ).toBe(true);

    expect(
      shouldSoftOpenFeatureCheck({
        featureKey: "crm_modulo",
        isLoading: false,
        isError: true,
      }),
    ).toBe(true);
  });
});
