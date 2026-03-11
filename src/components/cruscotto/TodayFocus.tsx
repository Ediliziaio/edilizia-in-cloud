import { useNavigate } from "react-router-dom";
import { Users, Calendar, AlertCircle, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TodayData } from "@/hooks/useCruscottoData";

function fmtEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

interface Props {
  todayData: TodayData | null;
  isLoading?: boolean;
}

export function TodayFocus({ todayData, isLoading }: Props) {
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const todayCap = today.charAt(0).toUpperCase() + today.slice(1);

  if (isLoading) return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    </div>
  );

  const data = todayData ?? { leadsToday: 0, appointmentsToday: 0, overdueAmount: 0, overdueCount: 0, suppliersDueAmount: 0, suppliersDue: [] };

  const tiles = [
    {
      icon: <Users className="w-4 h-4 text-blue-600" />,
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      label: "Lead oggi",
      value: String(data.leadsToday),
      sub: "nuovi contatti",
      link: "/azienda/marketing/contatti",
      alert: false,
      alertBg: "",
    },
    {
      icon: <Calendar className="w-4 h-4 text-purple-600" />,
      iconBg: "bg-purple-100 dark:bg-purple-900/30",
      label: "Appuntamenti oggi",
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
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Focus · {todayCap}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <button
            key={t.label}
            onClick={() => navigate(t.link)}
            className={cn(
              "border rounded-xl p-4 text-left hover:shadow-sm transition-all bg-card border-border",
              t.alert && t.alertBg
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", t.iconBg)}>
                {t.icon}
              </div>
              <span className="text-xs font-medium text-muted-foreground">{t.label}</span>
            </div>
            <p className={cn("text-xl font-bold", t.alert ? "text-destructive" : "text-foreground")}>{t.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t.sub}</p>
          </button>
        ))}
      </div>

      {/* Suppliers list */}
      {data.suppliersDue.length > 0 && (
        <Card className="border-dashed">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Prossimi pagamenti fornitori</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="divide-y divide-border">
              {data.suppliersDue.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2">
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
