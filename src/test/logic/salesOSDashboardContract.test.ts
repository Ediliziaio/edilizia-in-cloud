import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sales os dashboard contract", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/pages/azienda/marketing/SalesOSDashboard.tsx"),
    "utf8",
  );
  const salesOSHook = readFileSync(
    resolve(process.cwd(), "src/hooks/useSalesOS.ts"),
    "utf8",
  );
  const featureRoute = readFileSync(
    resolve(process.cwd(), "src/components/auth/FeatureRoute.tsx"),
    "utf8",
  );
  const featureRouteSoftOpen = readFileSync(
    resolve(process.cwd(), "src/lib/featureRouteSoftOpen.ts"),
    "utf8",
  );

  it("keeps Sales OS decision-first instead of chart-first", () => {
    expect(source).toContain("Comando commerciale di oggi");
    expect(source).toContain("Numeri senza ambiguità");
    expect(source).toContain("Cosa fare adesso");
    expect(source).toContain("buildSalesOSCommandActions");
    expect(source).toContain("Velocity stimata");
    expect(source).toContain("Ricavo firmato");
  });

  it("does not present zero-score contacts as hot leads", () => {
    expect(source).toContain("Score da configurare");
    expect(source).toContain("leadHasUsefulScore");
    expect(source).toContain("onOpenConfig");
  });

  it("keeps stalled opportunities and team targets operational", () => {
    expect(source).toContain("Prossima azione");
    expect(source).toContain("Imposta target");
    expect(source).toContain("Target mancanti");
  });

  it("uses the contact lead source as fallback for source conversion analysis", () => {
    // Dal 2026-09-11 il conto per fonte lo fa il database (vendite_per_fonte),
    // con le regole di tutti i report: il ripiego sulla fonte del contatto sta lì.
    const perFonte = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20280915410005_vendite_per_fonte.sql"),
      "utf8",
    );
    expect(salesOSHook).toContain("rpc('vendite_per_fonte'");
    expect(perFonte).toContain("coalesce(nullif(btrim(o.source), ''), nullif(btrim(c.source), ''), 'Sconosciuto')");
    expect(salesOSHook).not.toContain(".not('source', 'is', null)");
  });

  it("reads every number from the database, the same way for everyone", () => {
    // Niente più ricalcoli nel browser per chi vede solo i propri lead: le
    // funzioni rispettano la visibilità (SECURITY INVOKER) e danno a tutti gli
    // stessi numeri con le stesse regole.
    expect(salesOSHook).not.toContain("fetchAssignedWeightedPipeline");
    expect(salesOSHook).not.toContain("fetchAssignedSalesForecast");
    expect(salesOSHook).not.toContain("fetchAssignedSalesVelocity");
    expect(salesOSHook).toContain("rpc('vendite_preventivi'");
  });

  it("uses weekly sales targets as a monthly fallback in Sales OS seller reporting", () => {
    expect(salesOSHook).toContain("target_revenue");
    expect(salesOSHook).toContain("period_type");
    expect(salesOSHook).toContain("monthlyEquivalent");
    expect(salesOSHook).toContain("user_id");
  });

  it("does not block Sales OS behind a transient feature-check timeout", () => {
    expect(featureRoute).toContain("shouldSoftOpenFeatureCheck");
    expect(featureRouteSoftOpen).toContain('"sales_os"');
  });

  it("keeps the active Sales OS tab in the URL for refresh and back/forward navigation", () => {
    expect(source).toContain("useSearchParams");
    expect(source).toContain("SALES_OS_TABS");
    expect(source).toContain("handleTabChange");
    expect(source).toContain('searchParams.get("tab")');
  });

  it("does not leave KPI cards in endless loading when remote sales data is slow", () => {
    expect(source).toContain("useSlowQueryFallback");
    expect(source).toContain("Dati non arrivati");
  });
});
