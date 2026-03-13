import { useNavigate } from "react-router-dom";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useDashboardBillingKPI } from "@/hooks/billing/useDashboardBillingKPI";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  FileText,
  Wallet,
  Clock,
  AlertTriangle,
  ChevronRight,
  Receipt,
} from "lucide-react";

export function BillingKPIWidget() {
  const { isNative } = useBillingMode();
  const companyId = useEffectiveCompanyId();
  const { data: kpi, isLoading } = useDashboardBillingKPI(companyId, isNative);
  const navigate = useNavigate();

  if (!isNative) return null;

  const meseLabel = new Date().toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!kpi) return null;

  const cards = [
    {
      label: "Fatturato Mese",
      value: formatCurrencyCompact(kpi.fatturato_mese),
      sub: `${kpi.fatture_emesse_mese} fatture emesse`,
      icon: FileText,
      onClick: () => navigate("/azienda/fatturazione/documenti"),
    },
    {
      label: "Incassato Mese",
      value: formatCurrencyCompact(kpi.incassato_mese),
      sub: kpi.fatturato_mese > 0
        ? `${Math.round((kpi.incassato_mese / kpi.fatturato_mese) * 100)}% del fatturato`
        : "—",
      icon: Wallet,
      onClick: () => navigate("/azienda/fatturazione/movimenti"),
    },
    {
      label: "Da Incassare",
      value: formatCurrencyCompact(kpi.da_incassare_totale),
      sub: `Totale residuo aperto`,
      icon: Clock,
      onClick: () => navigate("/azienda/fatturazione/movimenti"),
    },
    {
      label: "Scaduto",
      value: formatCurrencyCompact(kpi.scaduto),
      sub: kpi.fatture_scadute_count > 0
        ? `${kpi.fatture_scadute_count} fatture scadute`
        : "Nessuna scaduta",
      icon: AlertTriangle,
      alert: kpi.scaduto > 0,
      onClick: () => navigate("/azienda/fatturazione/movimenti"),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5" />
          Fatturazione — {meseLabel}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={() => navigate("/azienda/fatturazione/documenti")}
        >
          Vai alla fatturazione
          <ChevronRight className="w-3 h-3" />
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card
            key={c.label}
            className={cn(
              "cursor-pointer transition-colors hover:bg-muted/50",
              (c as any).alert && "border-destructive/30 bg-destructive/5"
            )}
            onClick={c.onClick}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">
                  {c.label}
                </span>
                <c.icon
                  className={cn(
                    "h-4 w-4",
                    (c as any).alert
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                />
              </div>
              <p
                className={cn(
                  "text-xl font-bold tracking-tight",
                  (c as any).alert && "text-destructive"
                )}
              >
                {c.value}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {c.sub}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts */}
      {kpi.fatture_scadute_count > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3 bg-destructive/8 border border-destructive/20">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-destructive">
              {kpi.fatture_scadute_count} fatture scadute —{" "}
              {formatCurrency(kpi.scaduto)} da recuperare
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs h-7 gap-1"
            onClick={() => navigate("/azienda/fatturazione/movimenti")}
          >
            Gestisci
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      )}

      {kpi.fatture_in_bozza > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3 bg-amber-500/8 border border-amber-500/20">
          <FileText className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {kpi.fatture_in_bozza} fatture in bozza da emettere
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs h-7 gap-1"
            onClick={() =>
              navigate("/azienda/fatturazione/documenti?stato=bozza")
            }
          >
            Emetti
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
