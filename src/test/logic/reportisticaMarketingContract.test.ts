import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildAdsSalesReportRows, summarizeAdsSalesReportRows } from "@/lib/reporting/adsSalesReport";

describe("reportistica marketing contract", () => {
  const reportisticaPage = readFileSync(
    resolve(process.cwd(), "src/pages/azienda/ReportisticaPage.tsx"),
    "utf8",
  );
  const metaReportHook = readFileSync(
    resolve(process.cwd(), "src/hooks/useMetaAdsReport.ts"),
    "utf8",
  );
  const googleReport = readFileSync(
    resolve(process.cwd(), "src/components/reporting/google-ads/GoogleAdsReport.tsx"),
    "utf8",
  );
  const metaProxy = readFileSync(
    resolve(process.cwd(), "supabase/functions/meta-api-proxy/index.ts"),
    "utf8",
  );
  const metaNormalizer = readFileSync(
    resolve(process.cwd(), "src/lib/metaInsightsNormalizer.ts"),
    "utf8",
  );
  const metaCampaignTable = readFileSync(
    resolve(process.cwd(), "src/components/reporting/facebook-ads/CampaignTable.tsx"),
    "utf8",
  );
  const googleStatsHook = readFileSync(
    resolve(process.cwd(), "src/hooks/useGoogleAdsStats.ts"),
    "utf8",
  );
  const facebookAdsReport = readFileSync(
    resolve(process.cwd(), "src/components/reporting/facebook-ads/FacebookAdsReport.tsx"),
    "utf8",
  );
  const callCenterReport = readFileSync(
    resolve(process.cwd(), "src/components/reporting/callcenter/CallCenterReport.tsx"),
    "utf8",
  );
  const callCenterDiagnosis = readFileSync(
    resolve(process.cwd(), "src/components/reporting/callcenter/CallCenterOperationalDiagnosis.tsx"),
    "utf8",
  );
  const vendorReport = readFileSync(
    resolve(process.cwd(), "src/components/reporting/venditori/VenditoriPerformanceReport.tsx"),
    "utf8",
  );
  const vendorDiagnosis = readFileSync(
    resolve(process.cwd(), "src/components/reporting/venditori/VendorOperationalDiagnosis.tsx"),
    "utf8",
  );
  const vendorHook = readFileSync(
    resolve(process.cwd(), "src/hooks/useVendorReport.ts"),
    "utf8",
  );
  const vendorTrendFixMigration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20270523142000_fix_vendor_trend_fanout.sql"),
    "utf8",
  );
  const commercialReport = readFileSync(
    resolve(process.cwd(), "src/components/reporting/commercial/CommercialPerformanceReportPanel.tsx"),
    "utf8",
  );
  const crmSalesReport = readFileSync(
    resolve(process.cwd(), "src/components/reporting/crm-sales/CrmSalesReportPanel.tsx"),
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

  it("keeps construction-site reporting out of the marketing reporting page", () => {
    expect(reportisticaPage).not.toContain("CantiereDashboard");
    expect(reportisticaPage).not.toMatch(/cantier/i);
    expect(reportisticaPage).toContain('searchParams.get("tab") || "facebook-ads"');
    expect(reportisticaPage).toContain("Meta Business Manager");
    expect(reportisticaPage).toContain("CRM e vendite");
  });

  it("does not expose standalone web attribution when the website is not connected", () => {
    expect(reportisticaPage).not.toContain("Attribuzione web");
    expect(reportisticaPage).not.toContain("AttributionReport");
    expect(reportisticaPage).not.toContain('value="attribution"');
    expect(reportisticaPage).toContain("replace: true");
  });

  it("surfaces commercial reports for quotes, forecast, lead quality, margins and loss reasons", () => {
    expect(reportisticaPage).toContain("CrmSalesReportPanel");
    expect(commercialReport).toContain("Preventivi e offerte");
    expect(commercialReport).toContain("Forecast pipeline");
    expect(commercialReport).toContain("Qualità lead");
    expect(commercialReport).toContain("Margine reale stimato");
    expect(commercialReport).toContain("Motivi di perdita");
    expect(commercialReport).toContain("Sincronizzazione CRM");
    expect(commercialReport).toContain("Preventivi senza opportunità");
    expect(commercialReport).toContain("Vendite accettate senza ordine");
  });

  it("keeps CRM sales reporting decision-first instead of a wall of metrics", () => {
    expect(crmSalesReport).toContain("Cosa guardare");
    expect(crmSalesReport).toContain("Da fare adesso");
    expect(crmSalesReport).toContain("Funnel commerciale");
    expect(crmSalesReport).toContain("Canali paid che generano vendite");
    expect(crmSalesReport).toContain("Dettaglio operativo");
    expect(crmSalesReport).toContain("buildPriorityActions");
    expect(crmSalesReport).toContain("compact");
  });

  it("loads Meta sponsored campaigns across the whole Business Manager by default", () => {
    expect(metaReportHook).toContain("ALL_META_ACCOUNTS");
    expect(metaReportHook).toContain('useState<string>(ALL_META_ACCOUNTS)');
    expect(metaReportHook).toContain("Promise.allSettled");
    expect(metaReportHook).toContain("Tutti gli account BM");
  });

  it("surfaces CRM revenue and sales KPIs inside Google reporting", () => {
    expect(googleReport).toContain("AdsSalesReportPanel");
    expect(googleReport).toContain('provider="google"');
    expect(googleReport).toContain("Fatturato generato");
    expect(googleReport).toContain("Costo per vendita");
  });

  it("shows Meta BM account, CPM and frequency in campaign reporting", () => {
    expect(metaProxy).toContain("cpm");
    expect(metaProxy).toContain("frequency");
    expect(metaNormalizer).toContain("account_name");
    expect(metaNormalizer).toContain("cpm: number");
    expect(metaNormalizer).toContain("frequency: number");
    expect(metaCampaignTable).toContain("Account BM");
    expect(metaCampaignTable).toContain("CPM");
    expect(metaCampaignTable).toContain("Frequenza");
  });

  it("supports Google value, ROAS and impression-share reporting when stats include them", () => {
    expect(googleStatsHook).toContain("conversion_value");
    expect(googleStatsHook).toContain("search_impression_share");
    expect(googleReport).toContain("Valore conversioni");
    expect(googleReport).toContain("ROAS");
    expect(googleReport).toContain("Quota impr.");
  });

  it("integrates Meta, Google and call center reporting around contacted ad leads", () => {
    expect(facebookAdsReport).toContain("AdsCallCenterReportPanel");
    expect(facebookAdsReport).toContain('provider="meta"');
    expect(googleReport).toContain("AdsCallCenterReportPanel");
    expect(googleReport).toContain('provider="google"');
    expect(callCenterReport).toContain("AdsCallCenterReportPanel");
    expect(callCenterReport).toContain('provider="all"');
    expect(callCenterReport).toContain("Lead ads e chiamate");
  });

  it("shows an operational call-center diagnosis before charts", () => {
    expect(callCenterReport).toContain("CallCenterOperationalDiagnosis");
    expect(callCenterDiagnosis).toContain("Diagnosi operativa chiamate");
    expect(callCenterDiagnosis).toContain("Lead da lavorare");
    expect(callCenterDiagnosis).toContain("Lavorati senza risposta");
    expect(callCenterDiagnosis).toContain("Azioni consigliate");
  });

  it("shows a vendor operational diagnosis integrated with CRM and calendar data", () => {
    expect(vendorReport).toContain("VendorOperationalDiagnosis");
    expect(vendorReport).toContain("useVendorIntegrationHealth");
    expect(vendorDiagnosis).toContain("Diagnosi operativa venditori");
    expect(vendorDiagnosis).toContain("Opportunità senza prossimo step");
    expect(vendorDiagnosis).toContain("Appuntamenti senza esito");
    expect(vendorDiagnosis).toContain("Controllo integrazione CRM");
    expect(vendorDiagnosis).toContain("Azioni consigliate");
    expect(vendorHook).toContain("pastUncompletedAppointments");
    expect(vendorHook).toContain("staleOpenOpportunities");
  });

  it("keeps vendor monthly trend revenue from being multiplied by appointment/contact joins", () => {
    expect(vendorTrendFixMigration).toContain("opp_by_month");
    expect(vendorTrendFixMigration).toContain("appointments_by_month");
    expect(vendorTrendFixMigration).toContain("contacts_by_month");
    expect(vendorTrendFixMigration).toContain("COALESCE(o.fatturato, 0)");
  });

  it("aggregates attributed sales without mixing Meta and Google campaigns", () => {
    const rows = buildAdsSalesReportRows({
      contacts: [
        {
          id: "lead-meta",
          source: "Meta Lead Ads",
          source_campaign_id: "238500000",
          attr_source: "facebook",
          attr_medium: "paid_social",
          attr_campaign: "Serramenti Meta",
          meta_campaign_id: "238500000",
        },
        {
          id: "lead-google",
          source: "Google Ads",
          attr_source: "google",
          attr_medium: "cpc",
          attr_campaign: "Serramenti Search",
          google_campaign_id: "987654321",
          gclid: "click-1",
        },
      ],
      opportunities: [
        { id: "opp-meta", contact_id: "lead-meta", status: "won", value: 6000 },
        { id: "opp-google", contact_id: "lead-google", status: "won", value: 9000 },
      ],
      appointments: [
        { id: "app-meta", contact_id: "lead-meta", status: "scheduled" },
        { id: "app-google", contact_id: "lead-google", status: "scheduled" },
      ],
      costs: [
        { source: "facebook", campaign_name: "Serramenti Meta", spend_amount: 300 },
        { source: "google", campaign_name: "Serramenti Search", spend_amount: 450 },
      ],
    });

    const meta = rows.find((row) => row.platform === "meta");
    const google = rows.find((row) => row.platform === "google");
    expect(meta?.metrics.revenueCents).toBe(600_000);
    expect(meta?.metrics.spendCents).toBe(30_000);
    expect(google?.metrics.revenueCents).toBe(900_000);
    expect(google?.metrics.spendCents).toBe(45_000);

    const totals = summarizeAdsSalesReportRows(rows);
    expect(totals.won).toBe(2);
    expect(totals.revenueCents).toBe(1_500_000);
    expect(totals.costPerAppointmentCents).toBe(37_500);
    expect(totals.costPerSaleCents).toBe(37_500);
  });

  it("does not show the feature access timeout before the feature query can finish", () => {
    expect(featureRoute).toContain("FEATURE_ROUTE_LOADING_TIMEOUT_MS = 12_000");
    expect(featureRoute).toContain("shouldSoftOpenFeatureCheck");
    expect(featureRouteSoftOpen).toContain("SOFT_OPEN_ON_FEATURE_CHECK_DELAY");
    expect(featureRouteSoftOpen).toContain('"marketing_reporting"');
    expect(featureRouteSoftOpen).toContain("isLoading || isError");
    expect(featureRoute).not.toContain("setLoadingTimedOut(true), 6_000");
  });
});
