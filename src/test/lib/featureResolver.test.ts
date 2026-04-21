import { describe, it, expect } from "vitest";
import {
  resolveFeatureAccess,
  resolveFeatureAccessBatch,
  type CompanyFeatureOverride,
  type PlanFeatureDefault,
  type PlatformFeatureFlag,
} from "@/lib/featureResolver";

/**
 * Test suite per featureResolver — mirror della RPC Postgres
 * `resolve_company_feature`. Ogni test rispecchia uno scenario della
 * migration `20260922000001_fix_resolve_company_feature_ambiguous.sql`.
 *
 * Obiettivo: quando la logica DB cambia, QUI si rompono i test → ricorda
 * di aggiornare il mirror e viceversa.
 */

const CATALOG: readonly PlatformFeatureFlag[] = [
  { key: "ai_render", default_value: false, plans_included: ["professional"] },
  { key: "export_pdf", default_value: true, plans_included: null },
  { key: "firma_fea", default_value: false, plans_included: null },
];

const PLAN_DEFAULTS_STARTER: readonly PlanFeatureDefault[] = [
  {
    plan_id: "plan-starter",
    feature_key: "export_pdf",
    is_enabled: true,
    limit_value: 10,
  },
];

const PLAN_DEFAULTS_PROFESSIONAL: readonly PlanFeatureDefault[] = [
  {
    plan_id: "plan-pro",
    feature_key: "export_pdf",
    is_enabled: true,
    limit_value: 100,
  },
  {
    plan_id: "plan-pro",
    feature_key: "ai_render",
    is_enabled: true,
    limit_value: null,
  },
];

const NOW = new Date("2026-04-21T12:00:00Z");

describe("resolveFeatureAccess — priorità override", () => {
  it("override attivo vince sul plan_default (is_enabled=true)", () => {
    const overrides: CompanyFeatureOverride[] = [
      {
        company_id: "c1",
        feature_key: "firma_fea",
        is_enabled: true,
        limit_value: null,
        price_override: 29,
        expires_at: null,
      },
    ];
    const result = resolveFeatureAccess({
      featureCatalog: CATALOG,
      planDefaults: PLAN_DEFAULTS_STARTER,
      overrides,
      planSlug: "starter",
      featureKey: "firma_fea",
      now: NOW,
    });
    expect(result.isEnabled).toBe(true);
    expect(result.source).toBe("override");
    expect(result.priceOverride).toBe(29);
  });

  it("override con is_enabled=false BLOCCA anche se plan_default=true", () => {
    const overrides: CompanyFeatureOverride[] = [
      {
        company_id: "c1",
        feature_key: "export_pdf",
        is_enabled: false,
        limit_value: null,
        price_override: null,
        expires_at: null,
      },
    ];
    const result = resolveFeatureAccess({
      featureCatalog: CATALOG,
      planDefaults: PLAN_DEFAULTS_STARTER,
      overrides,
      planSlug: "starter",
      featureKey: "export_pdf",
      now: NOW,
    });
    expect(result.isEnabled).toBe(false);
    expect(result.source).toBe("override");
  });

  it("override scaduto viene ignorato → fallback plan_default", () => {
    const overrides: CompanyFeatureOverride[] = [
      {
        company_id: "c1",
        feature_key: "export_pdf",
        is_enabled: false,
        limit_value: null,
        price_override: null,
        expires_at: "2026-04-20T00:00:00Z", // scaduto prima di NOW
      },
    ];
    const result = resolveFeatureAccess({
      featureCatalog: CATALOG,
      planDefaults: PLAN_DEFAULTS_STARTER,
      overrides,
      planSlug: "starter",
      featureKey: "export_pdf",
      now: NOW,
    });
    expect(result.isEnabled).toBe(true);
    expect(result.source).toBe("plan_default");
    expect(result.limitValue).toBe(10);
  });

  it("override senza limit eredita limit dal plan_default (COALESCE)", () => {
    const overrides: CompanyFeatureOverride[] = [
      {
        company_id: "c1",
        feature_key: "export_pdf",
        is_enabled: true,
        limit_value: null, // non specificato
        price_override: null,
        expires_at: null,
      },
    ];
    const result = resolveFeatureAccess({
      featureCatalog: CATALOG,
      planDefaults: PLAN_DEFAULTS_PROFESSIONAL,
      overrides,
      planSlug: "professional",
      featureKey: "export_pdf",
      now: NOW,
    });
    expect(result.isEnabled).toBe(true);
    expect(result.source).toBe("override");
    expect(result.limitValue).toBe(100); // ereditato da plan_default
  });
});

describe("resolveFeatureAccess — plan_default", () => {
  it("plan_default attivo con limit → isEnabled con limitValue", () => {
    const result = resolveFeatureAccess({
      featureCatalog: CATALOG,
      planDefaults: PLAN_DEFAULTS_STARTER,
      overrides: [],
      planSlug: "starter",
      featureKey: "export_pdf",
      now: NOW,
    });
    expect(result.isEnabled).toBe(true);
    expect(result.source).toBe("plan_default");
    expect(result.limitValue).toBe(10);
  });
});

describe("resolveFeatureAccess — fallback plans_included (legacy)", () => {
  it("feature nel plans_included[] del piano corrente → source=plan", () => {
    const result = resolveFeatureAccess({
      featureCatalog: CATALOG,
      planDefaults: [], // no plan_default esplicito
      overrides: [],
      planSlug: "professional",
      featureKey: "ai_render",
      now: NOW,
    });
    expect(result.isEnabled).toBe(true);
    expect(result.source).toBe("plan");
    expect(result.limitValue).toBeNull();
  });

  it("feature NON nel plans_included del piano corrente → default_value", () => {
    const result = resolveFeatureAccess({
      featureCatalog: CATALOG,
      planDefaults: [],
      overrides: [],
      planSlug: "starter", // ai_render solo in "professional"
      featureKey: "ai_render",
      now: NOW,
    });
    expect(result.isEnabled).toBe(false);
    expect(result.source).toBe("default");
  });
});

describe("resolveFeatureAccess — edge cases", () => {
  it("feature sconosciuta (non in catalogo) → fail-closed", () => {
    const result = resolveFeatureAccess({
      featureCatalog: CATALOG,
      planDefaults: [],
      overrides: [],
      planSlug: "professional",
      featureKey: "feature_inesistente",
      now: NOW,
    });
    expect(result.isEnabled).toBe(false);
    expect(result.source).toBe("default");
  });

  it("azienda senza piano (planSlug=null) → default_value della feature", () => {
    const result = resolveFeatureAccess({
      featureCatalog: CATALOG,
      planDefaults: [],
      overrides: [],
      planSlug: null,
      featureKey: "export_pdf", // default_value=true
      now: NOW,
    });
    expect(result.isEnabled).toBe(true);
    expect(result.source).toBe("default");
  });

  it("expires_at === NOW → scaduto (coerente con SQL `> NOW()`)", () => {
    const overrides: CompanyFeatureOverride[] = [
      {
        company_id: "c1",
        feature_key: "firma_fea",
        is_enabled: true,
        limit_value: null,
        price_override: null,
        expires_at: NOW.toISOString(),
      },
    ];
    const result = resolveFeatureAccess({
      featureCatalog: CATALOG,
      planDefaults: [],
      overrides,
      planSlug: "starter",
      featureKey: "firma_fea",
      now: NOW,
    });
    expect(result.isEnabled).toBe(false); // scaduto → fallback default_value=false
    expect(result.source).toBe("default");
  });
});

describe("resolveFeatureAccessBatch", () => {
  it("risolve N feature mantenendo la stessa logica di resolveFeatureAccess", () => {
    const overrides: CompanyFeatureOverride[] = [
      {
        company_id: "c1",
        feature_key: "firma_fea",
        is_enabled: true,
        limit_value: null,
        price_override: 29,
        expires_at: null,
      },
    ];
    const result = resolveFeatureAccessBatch({
      featureCatalog: CATALOG,
      planDefaults: PLAN_DEFAULTS_PROFESSIONAL,
      overrides,
      planSlug: "professional",
      featureKeys: ["ai_render", "export_pdf", "firma_fea", "sconosciuta"],
      now: NOW,
    });
    expect(result.ai_render?.isEnabled).toBe(true);
    expect(result.ai_render?.source).toBe("plan_default");
    expect(result.export_pdf?.isEnabled).toBe(true);
    expect(result.export_pdf?.limitValue).toBe(100);
    expect(result.firma_fea?.isEnabled).toBe(true);
    expect(result.firma_fea?.source).toBe("override");
    expect(result.firma_fea?.priceOverride).toBe(29);
    expect(result.sconosciuta?.isEnabled).toBe(false);
    expect(result.sconosciuta?.source).toBe("default");
  });
});
