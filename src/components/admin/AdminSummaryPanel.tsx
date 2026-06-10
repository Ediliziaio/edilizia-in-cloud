/**
 * AdminSummaryPanel — pannello "Riepilogo" in stile dark blue + chart
 * (vedi /azienda/ordini "Vista economica e operativa").
 *
 * Layout:
 *   ┌───────────────────────────┬──────────────────────────────────┐
 *   │ Dark blue panel           │ Right card chiaro (chart slot)    │
 *   │  • Icona arancio + label  │  • Header con titolo + legend     │
 *   │  • Titolo + sottotitolo   │  • 3 box quick stat (orange/blue) │
 *   │  • Grid 2x2 KPI cards     │  • Chart slot (children)          │
 *   └───────────────────────────┴──────────────────────────────────┘
 *
 * Usato da AdminFatturatoHub, AdminAziendeHub e altri.
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SummaryKpi {
  /** Etichetta tutta maiuscola (es. "AZIENDE TOTALI"). */
  label: string;
  /** Valore principale già formattato (es. "43" o "1.348.666,00 €"). */
  value: React.ReactNode;
  /** Caption secondaria sotto al valore (es. "media mese 2,8"). */
  caption?: React.ReactNode;
  /** Icona contestuale (es. ShoppingBag, Euro, TrendingUp). */
  icon: LucideIcon;
  /** Override tono icona accent — default "orange". */
  tone?: "orange" | "blue" | "emerald";
}

export interface SummaryQuickStat {
  label: string;
  value: React.ReactNode;
  /** Tono colore valore — default "neutral". */
  tone?: "orange" | "blue" | "neutral";
}

export interface SummaryLegendItem {
  label: string;
  color: "blue" | "orange" | "slate" | "emerald";
}

interface AdminSummaryPanelProps {
  /** Icona piccola top-left del pannello scuro. */
  icon: LucideIcon;
  /** Pre-titolo maiuscolo (es. "RIEPILOGO COMMESSE"). */
  eyebrow: string;
  /** Titolo principale nel pannello scuro. */
  title: string;
  /** Sottotitolo del pannello scuro. */
  subtitle?: string;
  /** 2-4 KPI principali nel pannello scuro. */
  kpis: SummaryKpi[];
  /** Pre-titolo della card chart a destra (es. "ANDAMENTO 12 MESI"). */
  chartEyebrow?: string;
  /** Titolo della card chart. */
  chartTitle?: string;
  /** Legenda inline (puntini colorati). */
  chartLegend?: SummaryLegendItem[];
  /** Quick stat row above the chart (3 box). */
  chartQuickStats?: SummaryQuickStat[];
  /** Slot per la chart vera e propria (es. ResponsiveContainer Recharts). */
  children?: React.ReactNode;
}

const TONE_ICON: Record<NonNullable<SummaryKpi["tone"]>, string> = {
  orange: "text-orange-100",
  blue: "text-blue-100",
  emerald: "text-emerald-100",
};

const TONE_DOT: Record<SummaryLegendItem["color"], string> = {
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  slate: "bg-slate-900",
  emerald: "bg-emerald-500",
};

const TONE_QUICK: Record<NonNullable<SummaryQuickStat["tone"]>, { border: string; text: string }> = {
  orange: { border: "border-orange-100", text: "text-orange-600" },
  blue: { border: "border-blue-100", text: "text-slate-950" },
  neutral: { border: "border-slate-200", text: "text-slate-950" },
};

export function AdminSummaryPanel({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  kpis,
  chartEyebrow,
  chartTitle,
  chartLegend,
  chartQuickStats,
  children,
}: AdminSummaryPanelProps) {
  const hasRightSide = !!(chartEyebrow || chartTitle || chartLegend?.length || chartQuickStats?.length || children);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div
        className={cn(
          "grid gap-0",
          hasRightSide && "xl:grid-cols-[minmax(320px,0.58fr)_minmax(520px,1fr)]",
        )}
      >
        {/* ─── Dark blue panel (Riepilogo) ───────────────────────────── */}
        <div className="bg-[#173b67] p-5 sm:p-6 text-white">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-100">{eyebrow}</p>
              <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
              {subtitle ? (
                <p className="mt-1 max-w-xl text-sm leading-6 text-blue-50/85">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {kpis.map((kpi) => {
              const KpiIcon = kpi.icon;
              const toneClass = TONE_ICON[kpi.tone ?? "orange"];
              return (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-white/12 bg-white/9 p-4"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10",
                        toneClass,
                      )}
                    >
                      <KpiIcon className="h-4 w-4" />
                    </span>
                    {/* div, non p/span: value e caption sono ReactNode e i
                        chiamanti ci passano <Skeleton/> (un div) durante il
                        load → div-dentro-p è HTML invalido (hydration error
                        in console su AdminFatturatoHub). */}
                    <div className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">
                        {kpi.label}
                      </span>
                      <div className="truncate text-xl font-bold text-white">
                        {kpi.value}
                      </div>
                      {kpi.caption ? (
                        <div className="mt-0.5 text-xs text-blue-50/70">{kpi.caption}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Right card: chart + quick stats ───────────────────────── */}
        {hasRightSide ? (
          <aside className="border-t border-slate-200 bg-gradient-to-br from-white to-orange-50/50 p-5 xl:border-l xl:border-t-0">
            {(chartEyebrow || chartTitle || chartLegend?.length) ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div>
                  {chartEyebrow ? (
                    <p className="text-xs font-semibold uppercase text-slate-500">{chartEyebrow}</p>
                  ) : null}
                  {chartTitle ? (
                    <h3 className="mt-1 text-base font-semibold text-slate-950">{chartTitle}</h3>
                  ) : null}
                </div>
                {chartLegend?.length ? (
                  <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
                    {chartLegend.map((entry) => (
                      <span key={entry.label} className="inline-flex items-center gap-1 text-slate-600">
                        <span className={cn("h-2 w-2 rounded-full", TONE_DOT[entry.color])} />
                        {entry.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {chartQuickStats?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {chartQuickStats.map((stat) => {
                  const tone = TONE_QUICK[stat.tone ?? "neutral"];
                  return (
                    <div
                      key={stat.label}
                      className={cn("rounded-xl border bg-white px-3 py-2 shadow-sm", tone.border)}
                    >
                      <p className="text-[10px] font-semibold uppercase text-slate-500">{stat.label}</p>
                      <div className={cn("mt-0.5 text-base font-bold", tone.text)}>{stat.value}</div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {children ? (
              <div className="mt-4 h-[240px] rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                {children}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
