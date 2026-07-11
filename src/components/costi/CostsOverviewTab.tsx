// ============================================================================
// CostsOverviewTab — "dove vanno i soldi", mese per mese
// ============================================================================
// Vista di comprensione (non operativa): totale del mese, quanto è già stato
// pagato, ripartizione per voce di spesa (Personale, Materiali, Squadre
// esterne, Provvigioni + categorie manuali) con drill-down cliccabile e
// confronto con il mese precedente + trend 12 mesi.
// Riusa le stesse query della gestione spese (cache react-query condivisa).
// ============================================================================

import { useMemo, useState } from "react";
import { format, isSameMonth, parseISO, startOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, Minus, PiggyBank, ReceiptText, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useCompanyCostsData, type UnifiedCost } from "@/hooks/useCompanyCostsData";
import { MonthPicker } from "./MonthPicker";

// Filtri neutri: la Panoramica lavora sempre sul dataset completo e filtra
// per mese lato client (le query sono condivise con la tab Spese).
const NEUTRAL_FILTERS = {
  periodFilter: "all" as const,
  statusFilter: "all" as const,
  searchQuery: "",
  supplierFilter: "all",
  categoryFilter: "all",
  originFilter: "all" as const,
  customDateRange: null,
  statusTabFilter: "all" as const,
};

// Normalizzazione categoria → macro-voce leggibile
function macroVoce(cost: UnifiedCost): string {
  const cat = (cost.category || "").trim();
  if (!cat) return "Altro";
  const lower = cat.toLowerCase();
  if (lower === "personale") return "Personale";
  if (lower === "fornitori" || lower === "materiali") return "Materiali & fornitori";
  if (lower === "squadre esterne") return "Squadre esterne";
  if (lower === "provvigioni") return "Provvigioni";
  return cat;
}

const VOCE_COLORS = [
  "#f97316", // orange — Personale (di solito la voce più grossa)
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#64748b", // slate
  "#14b8a6", // teal
  "#ef4444", // red
  "#6366f1", // indigo
];

interface VoceMese {
  nome: string;
  totale: number;
  pagato: number;
  count: number;
  costs: UnifiedCost[];
}

function parseDue(value?: string | null): Date | null {
  if (!value || value === "9999-12-31") return null;
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function CostsOverviewTab({
  month,
  onMonthChange,
}: {
  month: Date;
  onMonthChange: (m: Date) => void;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const data = useCompanyCostsData(companyId, NEUTRAL_FILTERS);
  const [drillVoce, setDrillVoce] = useState<string | null>(null);

  const allCosts = data.allCostsUnfiltered as UnifiedCost[];

  const { voci, totaleMese, pagatoMese, daPagareMese, totalePrec, trend } = useMemo(() => {
    const prevMonth = subMonths(month, 1);
    const inMonth: UnifiedCost[] = [];
    let totalePrec = 0;

    // Trend: ultimi 12 mesi fino al mese selezionato
    const trendKeys: { key: string; label: string; date: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(month, i);
      trendKeys.push({
        key: format(startOfMonth(d), "yyyy-MM"),
        label: format(d, "MMM", { locale: it }),
        date: d,
      });
    }
    const trendMap = new Map(
      trendKeys.map((t) => [t.key, { personale: 0, altro: 0 }]),
    );

    for (const c of allCosts) {
      const due = parseDue(c.due_date);
      if (!due) continue;
      const amount = Number(c.amount) || 0;
      if (isSameMonth(due, month)) inMonth.push(c);
      if (isSameMonth(due, prevMonth)) totalePrec += amount;
      const tKey = format(startOfMonth(due), "yyyy-MM");
      const bucket = trendMap.get(tKey);
      if (bucket) {
        if (macroVoce(c) === "Personale") bucket.personale += amount;
        else bucket.altro += amount;
      }
    }

    const byVoce = new Map<string, VoceMese>();
    let totaleMese = 0;
    let pagatoMese = 0;
    for (const c of inMonth) {
      const nome = macroVoce(c);
      const amount = Number(c.amount) || 0;
      totaleMese += amount;
      if (c.is_paid) pagatoMese += amount;
      let v = byVoce.get(nome);
      if (!v) {
        v = { nome, totale: 0, pagato: 0, count: 0, costs: [] };
        byVoce.set(nome, v);
      }
      v.totale += amount;
      if (c.is_paid) v.pagato += amount;
      v.count += 1;
      v.costs.push(c);
    }

    const voci = Array.from(byVoce.values()).sort((a, b) => b.totale - a.totale);
    voci.forEach((v) => v.costs.sort((a, b) => Number(b.amount) - Number(a.amount)));

    const trend = trendKeys.map((t) => {
      const bucket = trendMap.get(t.key)!;
      return {
        label: t.label,
        personale: Math.round(bucket.personale),
        altro: Math.round(bucket.altro),
        isCurrent: isSameMonth(t.date, month),
      };
    });

    return { voci, totaleMese, pagatoMese, daPagareMese: totaleMese - pagatoMese, totalePrec, trend };
  }, [allCosts, month]);

  const deltaPct = totalePrec > 0 ? ((totaleMese - totalePrec) / totalePrec) * 100 : null;
  const maxVoce = voci.length > 0 ? voci[0].totale : 0;
  const drill = drillVoce ? voci.find((v) => v.nome === drillVoce) ?? null : null;
  const vocePagataPct = totaleMese > 0 ? Math.round((pagatoMese / totaleMese) * 100) : 0;

  if (data.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker
          month={month}
          onChange={(m) => {
            setDrillVoce(null);
            onMonthChange(m);
          }}
        />
        {deltaPct !== null && (
          <Badge
            variant="outline"
            className={cn(
              "gap-1 text-xs",
              deltaPct > 3 && "border-red-300 text-red-700",
              deltaPct < -3 && "border-emerald-300 text-emerald-700",
            )}
          >
            {deltaPct > 3 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : deltaPct < -3 ? (
              <ArrowDownRight className="h-3.5 w-3.5" />
            ) : (
              <Minus className="h-3.5 w-3.5" />
            )}
            {Math.abs(deltaPct).toFixed(0)}% vs {format(subMonths(month, 1), "MMMM", { locale: it })}
          </Badge>
        )}
      </div>

      {/* KPI mese */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3 shadow-sm">
          <div className="absolute inset-y-0 left-0 w-1 bg-orange-500" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Totale {format(month, "MMMM", { locale: it })}
            </span>
            <Wallet className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totaleMese)}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {voci.length} voci · mese prec. {formatCurrency(totalePrec)}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3 shadow-sm">
          <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Già pagato
            </span>
            <PiggyBank className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(pagatoMese)}</div>
          <p className="mt-1 text-xs text-muted-foreground">{vocePagataPct}% del mese</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3 shadow-sm">
          <div className="absolute inset-y-0 left-0 w-1 bg-sky-500" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Da pagare
            </span>
            <ReceiptText className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(daPagareMese)}</div>
          <p className="mt-1 text-xs text-muted-foreground">in scadenza nel mese</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Ripartizione per voce */}
        <Card className="rounded-2xl border-slate-200 shadow-sm lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {drill ? (
                <span className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setDrillVoce(null)}
                    aria-label="Torna alla ripartizione"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {drill.nome} · {formatCurrency(drill.totale)}
                </span>
              ) : (
                "Dove vanno i soldi"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {voci.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nessun costo con scadenza in questo mese.
              </p>
            ) : drill ? (
              <div className="max-h-[380px] space-y-1 overflow-y-auto pr-1">
                {drill.costs.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          c.supplierName,
                          c.order?.order_code,
                          parseDue(c.due_date)
                            ? format(parseDue(c.due_date)!, "d MMM", { locale: it })
                            : "senza scadenza",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Badge
                      variant={c.is_paid ? "secondary" : "outline"}
                      className={cn("shrink-0 text-[11px]", !c.is_paid && "border-sky-300 text-sky-700")}
                    >
                      {c.is_paid ? "Pagato" : "Da pagare"}
                    </Badge>
                    <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatCurrency(Number(c.amount))}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {voci.map((v, idx) => {
                  const pct = totaleMese > 0 ? (v.totale / totaleMese) * 100 : 0;
                  const barPct = maxVoce > 0 ? (v.totale / maxVoce) * 100 : 0;
                  const color = VOCE_COLORS[idx % VOCE_COLORS.length];
                  return (
                    <button
                      key={v.nome}
                      type="button"
                      onClick={() => setDrillVoce(v.nome)}
                      className="group w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span className="truncate">{v.nome}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {v.count} {v.count === 1 ? "costo" : "costi"}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                          {formatCurrency(v.totale)}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {pct.toFixed(0)}%
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all group-hover:opacity-80"
                          style={{ width: `${Math.max(barPct, 2)}%`, backgroundColor: color }}
                        />
                      </div>
                    </button>
                  );
                })}
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Clicca una voce per vedere i singoli costi del mese.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trend 12 mesi */}
        <Card className="rounded-2xl border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ultimi 12 mesi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k€` : `${v}€`
                    }
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === "personale" ? "Personale" : "Altri costi",
                    ]}
                    labelStyle={{ textTransform: "capitalize" }}
                  />
                  <Bar dataKey="personale" stackId="tot" fill="#f97316" name="personale">
                    {trend.map((t, i) => (
                      <Cell key={i} fillOpacity={t.isCurrent ? 1 : 0.55} />
                    ))}
                  </Bar>
                  <Bar dataKey="altro" stackId="tot" fill="#94a3b8" name="altro" radius={[3, 3, 0, 0]}>
                    {trend.map((t, i) => (
                      <Cell key={i} fillOpacity={t.isCurrent ? 1 : 0.55} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Personale
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Altri costi
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default CostsOverviewTab;
