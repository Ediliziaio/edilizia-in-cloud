import { useNavigate } from "react-router-dom";
import { Users, Calendar, AlertCircle, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import type { TodayData } from "@/hooks/useCruscottoData";

function fmtEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

type FocusPreset = "today" | "yesterday" | "last7" | "last30";

const FOCUS_PRESETS: { value: FocusPreset; label: string; dynamicLabel: string }[] = [
  { value: "today", label: "Oggi", dynamicLabel: "oggi" },
  { value: "yesterday", label: "Ieri", dynamicLabel: "ieri" },
  { value: "last7", label: "7gg", dynamicLabel: "ultimi 7gg" },
  { value: "last30", label: "30gg", dynamicLabel: "ultimi 30gg" },
];

function presetToRange(preset: FocusPreset): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  switch (preset) {
    case "today": return { from: fmt(now), to: fmt(now) };
    case "yesterday": { const y = subDays(now, 1); return { from: fmt(y), to: fmt(y) }; }
    case "last7": return { from: fmt(subDays(now, 7)), to: fmt(now) };
    case "last30": return { from: fmt(subDays(now, 30)), to: fmt(now) };
  }
}

function detectPreset(dateFrom: string, dateTo: string): FocusPreset {
  const now = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const last7 = format(subDays(new Date(), 7), "yyyy-MM-dd");
  const last30 = format(subDays(new Date(), 30), "yyyy-MM-dd");
  if (dateFrom === now && dateTo === now) return "today";
  if (dateFrom === yesterday && dateTo === yesterday) return "yesterday";
  if (dateFrom === last7 && dateTo === now) return "last7";
  if (dateFrom === last30 && dateTo === now) return "last30";
  return "today";
}

interface Props {
  todayData: TodayData | null;
  isLoading?: boolean;
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
}

export function TodayFocus({ todayData, isLoading, dateFrom, dateTo, onDateRangeChange }: Props) {
  const navigate = useNavigate();
  const activePreset = detectPreset(dateFrom, dateTo);
  const dynamicLabel = FOCUS_PRESETS.find(p => p.value === activePreset)?.dynamicLabel ?? "oggi";

  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const todayCap = today.charAt(0).toUpperCase() + today.slice(1);

  if (isLoading) return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    </div>
  );

  const data = todayData ?? { leadsToday: 0, appointmentsToday: 0, overdueAmount: 0, overdueCount: 0, suppliersDueAmount: 0, suppliersDue: [], revenueInRange: 0, collectedInRange: 0, costsPaidInRange: 0 };

  const tiles = [
    {
      icon: <Users className="w-4 h-4 text-blue-600" />,
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      label: `Lead ${dynamicLabel}`,
      value: String(data.leadsToday),
      sub: "nuovi contatti",
      link: "/azienda/marketing/contatti",
      alert: false,
      alertBg: "",
    },
    {
      icon: <Calendar className="w-4 h-4 text-purple-600" />,
      iconBg: "bg-purple-100 dark:bg-purple-900/30",
      label: `Appuntamenti ${dynamicLabel}`,
      value: String(data.appointmentsToday),
      sub: "in agenda",
      link: "/azienda/marketing/calendario",
      alert: false,
      alertBg: "",
    },
    {
      icon: <AlertCircle className="w-4 h-4 text-destructive" />,
      iconBg: "bg-red-100 dark:bg-red-900/30",
      label: "Crediti scaduti",
      value: data.overdueCount > 0 ? fmtEur(data.overdueAmount) : "0",
      sub: data.overdueCount > 0 ? `${data.overdueCount} rate non incassate` : "tutto in regola",
      link: "/azienda/ordini",
      alert: data.overdueCount > 0,
      alertBg: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
    },
    {
      icon: <CreditCard className="w-4 h-4 text-amber-600" />,
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      label: "Fornitori 7gg",
      value: data.suppliersDue.length > 0 ? fmtEur(data.suppliersDueAmount) : "0",
      sub: data.suppliersDue.length > 0 ? `${data.suppliersDue.length} scadenze` : "nessuna scadenza",
      link: "/azienda/costi",
      alert: data.suppliersDue.length > 0,
      alertBg: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Focus · {todayCap}
        </p>
        <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5">
          {FOCUS_PRESETS.map(p => (
            <Button
              key={p.value}
              variant={activePreset === p.value ? "default" : "ghost"}
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => {
                const range = presetToRange(p.value);
                onDateRangeChange(range.from, range.to);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="font-medium text-foreground">Fatturato:</span>
          <span className="text-base font-bold text-foreground">{fmtEur(data.revenueInRange)}</span>
        </span>
        <span className="w-px h-4 bg-border" />
        <span className="flex items-center gap-1">
          <span className="font-medium text-emerald-600 dark:text-emerald-400">Incassato:</span>
          <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{fmtEur(data.collectedInRange)}</span>
        </span>
        <span className="w-px h-4 bg-border" />
        <span className="flex items-center gap-1">
          <span className="font-medium text-destructive">Costi Pagati:</span>
          <span className="text-base font-bold text-destructive">{fmtEur(data.costsPaidInRange)}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <button
            key={t.label}
            onClick={() => navigate(t.link)}
            className={cn(
              "border rounded-xl p-3 text-left hover:shadow-sm transition-all bg-card border-border",
              t.alert && t.alertBg
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", t.iconBg)}>
                {t.icon}
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{t.label}</span>
            </div>
            <p className={cn("text-lg font-bold", t.alert ? "text-destructive" : "text-foreground")}>{t.value}</p>
            <p className="text-[11px] text-muted-foreground">{t.sub}</p>
          </button>
        ))}
      </div>

      {/* Suppliers list */}
      {data.suppliersDue.length > 0 && (
        <Card className="border-dashed">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Prossimi pagamenti fornitori</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-2 pt-0">
            <div className="divide-y divide-border">
              {data.suppliersDue.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm font-medium text-foreground truncate">{s.name || "Fornitore"}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                    {fmtEur(s.amount)} · {new Date(s.due_date).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
