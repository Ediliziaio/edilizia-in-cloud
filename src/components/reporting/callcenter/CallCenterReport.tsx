import { useState, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, GitCompareArrows } from "lucide-react";
import type { PeriodoVendor } from "@/hooks/useVendorReport";
import {
  useCallCenterKPI,
  useSpeedToLeadDistribuzione,
  useTrendGiornaliero,
  useFonteLeadPerformance,
  useCallCenterLeadHandling,
  type CallCenterKPI,
} from "@/hooks/useCallCenterReport";
import { LavorazioneLeadPanel } from "./LavorazioneLeadPanel";
import { CallCenterKPISection } from "./CallCenterKPISection";
import { CallCenterInsights } from "./CallCenterInsights";
import { OperatoriConfronto } from "./OperatoriConfronto";
import { SpeedToLeadChart } from "./SpeedToLeadChart";
import { CallCenterTrendChart } from "./CallCenterTrendChart";
import { FonteLeadTable } from "./FonteLeadTable";
import { OperatoriRanking } from "./OperatoriRanking";
import { ReportExportMenu } from "../shared/ReportExportMenu";
import { AdsCallCenterReportPanel } from "@/components/reporting/ads-callcenter/AdsCallCenterReportPanel";
import { CallCenterOperationalDiagnosis } from "./CallCenterOperationalDiagnosis";

const PERIODI: { value: PeriodoVendor; label: string }[] = [
  { value: "mese", label: "Mese corrente" },
  { value: "mese_prec", label: "Mese precedente" },
  { value: "trimestre", label: "Ultimi 3 mesi" },
  { value: "semestre", label: "Ultimi 6 mesi" },
  { value: "anno", label: "Anno corrente" },
];

const DAYS_BY_PERIODO: Record<PeriodoVendor, number> = {
  mese: 31,
  mese_prec: 31,
  trimestre: 90,
  semestre: 180,
  anno: 365,
};

const EXPORT_COLUMNS = [
  { key: "nome_operatore", label: "Operatore" },
  { key: "lead_assegnati", label: "Lead Assegnati" },
  { key: "lead_lavorati", label: "Lead Lavorati" },
  { key: "pct_lead_lavorati", label: "% Lavorati" },
  { key: "lead_contattati", label: "Contattati" },
  { key: "tasso_contatto", label: "Tasso Contatto %" },
  { key: "tentativi_totali", label: "Tentativi" },
  { key: "avg_speed_to_lead_min", label: "Speed to Lead (min)" },
  { key: "appuntamenti_fissati", label: "Appuntamenti" },
  { key: "tasso_app_su_contattati", label: "App/Contattati %" },
  { key: "show_up_count", label: "Show-Up" },
  { key: "tasso_show_up", label: "Show-Up %" },
  { key: "chiamate_per_giorno", label: "Chiamate/Giorno" },
  { key: "durata_media_min", label: "Durata Media (min)" },
  { key: "giorni_lavorati", label: "Giorni Lavorati" },
];

export default function CallCenterReport() {
  const [periodo, setPeriodo] = useState<PeriodoVendor>("mese");
  const [operatoreId, setOperatoreId] = useState<string>("tutti");
  const [subTab, setSubTab] = useState("panoramica");
  // Telefono: due sotto-schede (Panoramica e Operatori); grafici, fonti e confronto restano al computer.
  const isMobile = useIsMobile();
  const schedaAttiva = isMobile && subTab !== "panoramica" && subTab !== "ranking" ? "panoramica" : subTab;

  const effectiveOpId = operatoreId === "tutti" ? undefined : operatoreId;
  const daysBack = DAYS_BY_PERIODO[periodo] ?? 180;

  // Single KPI query — filter client-side for individual operator
  const { data: kpiList, isLoading: kpiLoading } = useCallCenterKPI(periodo);

  // Lazy load — only when tab is active
  const { data: speedData, isLoading: speedLoading } = useSpeedToLeadDistribuzione(periodo, effectiveOpId, schedaAttiva === "speed");
  const { data: trendData, isLoading: trendLoading } = useTrendGiornaliero(periodo, effectiveOpId, schedaAttiva === "trend");
  const { data: fonteData, isLoading: fonteLoading } = useFonteLeadPerformance(periodo, schedaAttiva === "fonti");
  const { data: leadHandling, isLoading: lhLoading } = useCallCenterLeadHandling(periodo, effectiveOpId, schedaAttiva === "panoramica");

  // Aggregate team or find individual — all client-side from kpiList
  const currentKpi = useMemo(() => {
    if (!kpiList?.length) return null;
    if (operatoreId !== "tutti") {
      return kpiList.find(k => k.operatore_id === operatoreId) ?? null;
    }
    const agg = kpiList.reduce((acc, k) => ({
      ...acc,
      lead_assegnati: acc.lead_assegnati + (k.lead_assegnati ?? 0),
      lead_lavorati: acc.lead_lavorati + (k.lead_lavorati ?? 0),
      lead_contattati: acc.lead_contattati + (k.lead_contattati ?? 0),
      tentativi_totali: acc.tentativi_totali + (k.tentativi_totali ?? 0),
      appuntamenti_fissati: acc.appuntamenti_fissati + (k.appuntamenti_fissati ?? 0),
      show_up_count: acc.show_up_count + (k.show_up_count ?? 0),
      giorni_lavorati: Math.max(acc.giorni_lavorati, k.giorni_lavorati ?? 0),
    }), {
      operatore_id: "tutti",
      nome_operatore: "Tutto il Team",
      email_operatore: "",
      lead_assegnati: 0, lead_lavorati: 0, pct_lead_lavorati: 0,
      lead_contattati: 0, tasso_contatto: 0,
      tentativi_totali: 0, tentativi_per_contatto: 0,
      avg_speed_to_lead_min: 0, median_speed_to_lead_min: 0,
      pct_entro_5min: 0, pct_entro_1ora: 0, pct_oltre_24ore: 0,
      appuntamenti_fissati: 0, tasso_app_su_contattati: 0, tasso_app_su_assegnati: 0,
      show_up_count: 0, tasso_show_up: 0,
      durata_media_min: 0, chiamate_per_giorno: 0, giorni_lavorati: 0,
    } as CallCenterKPI);

    agg.pct_lead_lavorati = agg.lead_assegnati ? Math.round(1000 * agg.lead_lavorati / agg.lead_assegnati) / 10 : 0;
    agg.tasso_contatto = agg.lead_lavorati ? Math.round(1000 * agg.lead_contattati / agg.lead_lavorati) / 10 : 0;
    agg.tentativi_per_contatto = agg.lead_contattati ? Math.round(100 * agg.tentativi_totali / agg.lead_contattati) / 100 : 0;
    agg.tasso_app_su_contattati = agg.lead_contattati ? Math.round(1000 * agg.appuntamenti_fissati / agg.lead_contattati) / 10 : 0;
    agg.tasso_app_su_assegnati = agg.lead_assegnati ? Math.round(1000 * agg.appuntamenti_fissati / agg.lead_assegnati) / 10 : 0;
    agg.tasso_show_up = agg.appuntamenti_fissati ? Math.round(1000 * agg.show_up_count / agg.appuntamenti_fissati) / 10 : 0;

    const withSpeed = kpiList.filter(k => (k.avg_speed_to_lead_min ?? 0) > 0);
    agg.avg_speed_to_lead_min = withSpeed.length ? Math.round(10 * withSpeed.reduce((s, k) => s + k.avg_speed_to_lead_min, 0) / withSpeed.length) / 10 : 0;
    agg.median_speed_to_lead_min = withSpeed.length ? Math.round(10 * withSpeed.reduce((s, k) => s + (k.median_speed_to_lead_min ?? 0), 0) / withSpeed.length) / 10 : 0;

    const withDurata = kpiList.filter(k => (k.durata_media_min ?? 0) > 0);
    agg.durata_media_min = withDurata.length ? Math.round(10 * withDurata.reduce((s, k) => s + k.durata_media_min, 0) / withDurata.length) / 10 : 0;
    agg.chiamate_per_giorno = kpiList.reduce((s, k) => s + (k.chiamate_per_giorno ?? 0), 0);

    agg.pct_entro_5min = withSpeed.length ? Math.round(10 * withSpeed.reduce((s, k) => s + (k.pct_entro_5min ?? 0), 0) / withSpeed.length) / 10 : 0;
    agg.pct_entro_1ora = withSpeed.length ? Math.round(10 * withSpeed.reduce((s, k) => s + (k.pct_entro_1ora ?? 0), 0) / withSpeed.length) / 10 : 0;
    agg.pct_oltre_24ore = withSpeed.length ? Math.round(10 * withSpeed.reduce((s, k) => s + (k.pct_oltre_24ore ?? 0), 0) / withSpeed.length) / 10 : 0;

    return agg;
  }, [kpiList, operatoreId]);

  // Export data
  const exportRows = useMemo(() =>
    (kpiList ?? []).map(k => {
      const row: Record<string, string> = {};
      EXPORT_COLUMNS.forEach(c => { row[c.key] = String((k as any)[c.key] ?? ""); });
      return row;
    }),
    [kpiList]
  );

  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Header with filters — telefono: solo periodo e operatore, niente titolo (lo dice la scheda) né export */}
      <div className="flex flex-wrap items-center gap-3">
        <Phone className="h-5 w-5 text-primary max-sm:hidden" />
        <h2 className="text-lg font-semibold max-sm:hidden">Report Call Center</h2>

        <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0 max-sm:w-full max-sm:flex-nowrap">
          <ReportExportMenu
            rows={exportRows}
            columns={EXPORT_COLUMNS}
            filenameBase={`report-callcenter-${periodo}`}
            disabled={kpiLoading}
          />
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoVendor)}>
            <SelectTrigger className="w-[180px] max-sm:w-auto max-sm:min-w-0 max-sm:flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODI.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={operatoreId} onValueChange={setOperatoreId}>
            <SelectTrigger className="w-[200px] max-sm:w-auto max-sm:min-w-0 max-sm:flex-1">
              <SelectValue placeholder="Operatore" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutto il Team</SelectItem>
              {(kpiList ?? []).map(k => (
                <SelectItem key={k.operatore_id} value={k.operatore_id}>
                  {k.nome_operatore}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sub-tabs */}
      <Tabs value={schedaAttiva} onValueChange={setSubTab}>
        <TabsList className="max-sm:w-full">
          <TabsTrigger value="panoramica" className="max-sm:flex-1">Panoramica</TabsTrigger>
          <TabsTrigger value="ranking" className="max-sm:flex-1">
            <span className="max-sm:hidden">Ranking Operatori</span>
            <span className="sm:hidden">Operatori</span>
          </TabsTrigger>
          <TabsTrigger value="speed" className="max-sm:hidden">Speed to Lead</TabsTrigger>
          <TabsTrigger value="trend" className="max-sm:hidden">Trend Giornaliero</TabsTrigger>
          <TabsTrigger value="fonti" className="max-sm:hidden">Fonti Lead</TabsTrigger>
          <TabsTrigger value="confronto" className="gap-1.5 max-sm:hidden">
            <GitCompareArrows className="h-4 w-4" /> Confronto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="panoramica" className="mt-4 space-y-6 max-sm:mt-3 max-sm:space-y-3">
          <CallCenterKPISection kpi={currentKpi} isLoading={kpiLoading} />
          <CallCenterOperationalDiagnosis kpi={currentKpi} isLoading={kpiLoading} />
          <LavorazioneLeadPanel data={leadHandling} isLoading={lhLoading} />
          {/* Telefono: il report delle campagne e gli insight testuali restano al computer. */}
          <section aria-label="Lead ads e chiamate" className="max-sm:hidden">
            <AdsCallCenterReportPanel provider="all" daysBack={daysBack} />
          </section>
          <CallCenterInsights kpi={currentKpi} />
        </TabsContent>

        <TabsContent value="ranking" className="mt-4 max-sm:mt-3">
          <OperatoriRanking kpiList={kpiList ?? []} isLoading={kpiLoading} />
        </TabsContent>

        <TabsContent value="speed" className="mt-4">
          <SpeedToLeadChart data={speedData ?? []} isLoading={speedLoading} />
        </TabsContent>

        <TabsContent value="trend" className="mt-4">
          <CallCenterTrendChart data={trendData ?? []} isLoading={trendLoading} />
        </TabsContent>

        <TabsContent value="fonti" className="mt-4">
          <FonteLeadTable data={fonteData ?? []} isLoading={fonteLoading} />
        </TabsContent>

        <TabsContent value="confronto" className="mt-4">
          <OperatoriConfronto kpiList={kpiList ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
