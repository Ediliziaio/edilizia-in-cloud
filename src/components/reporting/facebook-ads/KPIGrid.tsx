import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { AlertTriangle } from "lucide-react";
import type { DailyPoint } from "@/lib/metaInsightsNormalizer";
import type { ReportKpis } from "@/lib/metaAdsReportModel";
import { DeltaPercentuale } from "@/components/reporting/shared/DeltaPercentuale";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const fmtNum = (n: number) =>
  new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 0 }).format(n);
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 2, useGrouping: "always" }).format(n);
const fmtPct = (n: number) =>
  new Intl.NumberFormat(intlCampo(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + "%";
const fmtDec = (n: number) => new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 2 }).format(n);

interface Props {
  kpis: ReportKpis;
  kpisPrev: ReportKpis | null;
  dailySeries: DailyPoint[];
  isLoading: boolean;
  isLoadingCrm: boolean;
  /** Etichetta di cosa si sta guardando: account intero, una campagna, un gruppo. */
  ambito: string;
}

const Delta = DeltaPercentuale;

// L'id del gradiente non può contenere spazi, virgole o parentesi di "hsl(…)":
// con l'id grezzo il riferimento url(#…) falliva e l'area usciva grigio scuro.
const MiniSparkline = ({ data, color }: { data: { v: number }[]; color: string }) => {
  const id = `grad-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} fill={`url(#${id})`} strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

interface BigCardProps {
  label: string;
  value: string;
  delta?: ReactNode;
  sotto?: ReactNode;
  data?: { v: number }[];
  color: string;
  isLoading: boolean;
}

const BigCard = ({ label, value, delta, sotto, data, color, isLoading }: BigCardProps) => (
  <Card className="p-4 flex flex-col gap-1.5">
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
    {isLoading ? (
      <Skeleton className="h-8 w-24" />
    ) : (
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {delta}
      </div>
    )}
    {!isLoading && sotto && <div className="text-xs text-muted-foreground">{sotto}</div>}
    {data && data.length > 1 && !isLoading && <MiniSparkline data={data} color={color} />}
  </Card>
);

const SmallCard = ({ label, value, delta, isLoading, aiuto }: { label: string; value: string; delta?: ReactNode; isLoading: boolean; aiuto?: string }) => (
  <Card className="p-3 flex flex-col gap-1" title={aiuto}>
    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
    {isLoading ? (
      <Skeleton className="h-6 w-16" />
    ) : (
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {delta}
      </div>
    )}
  </Card>
);

const KPIGrid = ({ kpis, kpisPrev, dailySeries, isLoading, isLoadingCrm, ambito }: Props) => {
  const t = useT();
  const p = kpisPrev;
  const spesaData = dailySeries.map((d) => ({ v: d.spend }));
  const leadData = dailySeries.map((d) => ({ v: d.conversions }));
  const crmLoading = isLoading || isLoadingCrm;
  // Lead che Meta conta ma che nel CRM non risultano legati a un'inserzione:
  // lead persi per strada, o arrivati prima che il collegamento funzionasse.
  const mancanti = kpis.leads - kpis.lead_crm;
  const mostraMancanti = !crmLoading && kpis.leads >= 5 && mancanti > kpis.leads * 0.2;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t("Stai guardando:")} <span className="font-medium text-foreground">{ambito}</span>
        {p ? ` ${t("· le percentuali confrontano con il periodo precedente di pari durata")}` : ""}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <BigCard
          label={t("Spesa")}
          value={fmtCurrency(kpis.spend)}
          delta={<Delta ora={kpis.spend} prima={p?.spend} meglio="neutro" />}
          sotto={<>CPM {fmtCurrency(kpis.cpm)}</>}
          data={spesaData}
          color="hsl(217, 91%, 60%)"
          isLoading={isLoading}
        />
        <BigCard
          label={t("Lead Meta")}
          value={fmtNum(kpis.leads)}
          delta={<Delta ora={kpis.leads} prima={p?.leads} meglio="su" />}
          sotto={
            <span className="inline-flex items-center gap-1.5">
              {t("Costo per lead")} <span className="font-medium text-foreground">{kpis.leads > 0 ? fmtCurrency(kpis.cpl) : "—"}</span>
              <Delta ora={kpis.cpl} prima={p && p.leads > 0 ? p.cpl : null} meglio="giu" />
            </span>
          }
          data={leadData}
          color="hsl(262, 83%, 58%)"
          isLoading={isLoading}
        />
        <BigCard
          label={t("Lead nel CRM")}
          value={fmtNum(kpis.lead_crm)}
          sotto={
            <>
              {kpis.lead_crm > 0 ? <>{t("Costo per lead CRM")} <span className="font-medium text-foreground">{fmtCurrency(kpis.costo_lead_crm)}</span> · </> : null}
              {t("{n} trattative", { n: fmtNum(kpis.opportunita) })}
            </>
          }
          color="hsl(199, 89%, 48%)"
          isLoading={crmLoading}
        />
        <BigCard
          label={t("Contratti")}
          value={fmtNum(kpis.vinte)}
          sotto={
            kpis.vinte > 0 ? (
              <>
                {t("Costo per contratto")} <span className="font-medium text-foreground">{fmtCurrency(kpis.costo_vinta)}</span>
                {kpis.valore_vinto > 0 && <>{" "}{t("· valore {valore_vinto}", { valore_vinto: fmtCurrency(kpis.valore_vinto) })}</>}
              </>
            ) : (
              t("Nessun contratto ancora dai lead del periodo")
            )
          }
          color="hsl(142, 71%, 45%)"
          isLoading={crmLoading}
        />
      </div>

      {mostraMancanti && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t("Meta conta {leads} lead, nel CRM ne risultano {lead_crm} collegati a un'inserzione. I {mancanti} mancanti possono essere lead arrivati prima del collegamento dei moduli, inseriti a mano senza provenienza o non arrivati: controlla la sincronizzazione dei moduli in Integrazioni.", { leads: fmtNum(kpis.leads), lead_crm: fmtNum(kpis.lead_crm), mancanti: fmtNum(mancanti) })}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <SmallCard label={t("Impressioni")} value={fmtNum(kpis.impressions)} delta={<Delta ora={kpis.impressions} prima={p?.impressions} meglio="neutro" />} isLoading={isLoading} />
        <SmallCard label={t("Copertura")} value={fmtNum(kpis.reach)} aiuto={t("Persone diverse raggiunte")} isLoading={isLoading} />
        <SmallCard label={t("Frequenza")} value={kpis.reach > 0 ? fmtDec(kpis.frequency) : "N/D"} aiuto={t("Volte in media che la stessa persona ha visto gli annunci")} isLoading={isLoading} />
        <SmallCard label={t("Clic sul link")} value={fmtNum(kpis.link_clicks)} delta={<Delta ora={kpis.link_clicks} prima={p?.link_clicks} meglio="su" />} isLoading={isLoading} />
        <SmallCard label={t("CTR (link)")} value={kpis.impressions > 0 ? fmtPct(kpis.ctr) : "N/D"} delta={<Delta ora={kpis.ctr} prima={p?.ctr} meglio="su" />} isLoading={isLoading} />
        <SmallCard label={t("CPC (link)")} value={kpis.link_clicks > 0 ? fmtCurrency(kpis.cpc) : "N/D"} delta={<Delta ora={kpis.cpc} prima={p && p.link_clicks > 0 ? p.cpc : null} meglio="giu" />} isLoading={isLoading} />
        <SmallCard label={t("Valore contratti")} value={kpis.valore_vinto > 0 ? fmtCurrency(kpis.valore_vinto) : "—"} isLoading={crmLoading} />
        <SmallCard
          label={t("ROAS reale")}
          value={kpis.valore_vinto > 0 && kpis.spend > 0 ? `${fmtDec(kpis.roas)}x` : "N/D"}
          aiuto={t("Valore dei contratti nati dai lead del periodo, diviso la spesa")}
          isLoading={crmLoading}
        />
      </div>
    </div>
  );
};

export default KPIGrid;
