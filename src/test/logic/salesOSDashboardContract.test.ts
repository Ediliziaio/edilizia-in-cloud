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

  it("keeps stalled opportunities operational and sends the seller ranking to the report", () => {
    expect(source).toContain("Prossima azione");
    // Il confronto venditori non si calcola più qui (era la terza versione dello
    // stesso numero): la classifica vive in Reportistica → Venditori.
    expect(source).toContain("RimandoClassificaVenditori");
    expect(source).toContain("/azienda/marketing/reportistica?tab=venditori");
    expect(source).not.toContain("SellerComparisonTable");
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

  it("has no seller-ranking engine of its own", () => {
    // Una classifica, un motore: get_vendor_kpi_per_agent (Reportistica → Venditori).
    expect(salesOSHook).not.toContain("useSellerPerformance");
    expect(salesOSHook).not.toContain("sales_targets");
  });

  it("links to filters the target pages actually read", () => {
    // Preventivi toglie «?status=» senza usarlo: il filtro della lista è «stato».
    expect(source).not.toContain("preventivi?status=");
    expect(source).toContain("preventivi?stato=in_corso");
    // Opportunità apre il dettaglio con «?apri=»; «?opportunity_id=» non lo legge nessuno.
    expect(source).not.toContain("opportunita?opportunity_id=");
    expect(source).toContain("opportunita?apri=");
  });

  it("says which months the forecast covers and never turns a failed read into a zero", () => {
    // get_sales_forecast(…, 3) = questo mese e i due successivi, non «90 giorni».
    expect(source).not.toContain('"90 giorni"');
    expect(source).toContain("questo mese e i due successivi");
    expect(source).toContain("Dati non arrivati");
    expect(source).toContain('searchParams.get("periodo")');
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
