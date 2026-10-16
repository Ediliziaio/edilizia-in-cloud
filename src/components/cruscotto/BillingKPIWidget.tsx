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
  const { data: kpi, isLoading, isError, refetch } = useDashboardBillingKPI(companyId, isNative);
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

  if (isError) return <div role="alert" className="text-sm text-destructive">Statistiche di fatturazione non disponibili. <Button variant="link" onClick={() => void refetch()}>Riprova</Button></div>;
  if (!kpi) return null;

  const cards = [
    {
      label: "Fatturato Mese · netto IVA",
      value: formatCurrencyCompact(kpi.fatturato_mese),
      sub: `${kpi.fatture_emesse_mese} fatture emesse`,
      icon: FileText,
      onClick: () => navigate("/azienda/documenti/report"),
    },
    {
      label: "Incassato fatture · mese",
      value: formatCurrencyCompact(kpi.incassato_mese),
      sub: "Pagamenti registrati nel mese · IVA inclusa",
      icon: Wallet,
      onClick: () => navigate("/azienda/documenti?tab=incassi"),
    },
    {
      label: "Da Incassare",
      value: formatCurrencyCompact(kpi.da_incassare_totale),
      sub: `Residuo fatture aperte`,
      icon: Clock,
      onClick: () => navigate("/azienda/documenti?tab=incassi"),
    },
    {
      label: "Scaduto",
      value: formatCurrency(kpi.scaduto),
      sub: kpi.fatture_scadute_count > 0
        ? `${kpi.fatture_scadute_count} fatture scadute · Gestisci →`
        : "Nessuna scaduta",
      icon: AlertTriangle,
      alert: kpi.scaduto > 0,
      onClick: () => navigate("/azienda/documenti?tab=incassi"),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5" />
          Fatturazione — {meseLabel}
        </span>
        <div className="flex flex-wrap items-center gap-2">
        {kpi.fatture_in_bozza > 0 && <Button variant="outline" size="sm" className="h-9 gap-1 text-xs text-amber-700" onClick={() => navigate("/azienda/documenti?stato=bozza")}><FileText className="h-3.5 w-3.5" />{kpi.fatture_in_bozza} bozze · Emetti</Button>}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-9 gap-1"
          onClick={() => navigate("/azienda/documenti")}
        >
          Vai alla fatturazione
          <ChevronRight className="w-3 h-3" />
        </Button>
        </div>
      </div>

      {kpi.fatture_importate_incassi_da_verificare > 0 && <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Il fatturato include lo storico importato. Per {kpi.fatture_importate_incassi_da_verificare} fatture esterne gli incassi vanno verificati: non sono inclusi automaticamente negli insoluti.</p>}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card
            key={c.label}
            className={cn(
              "cursor-pointer transition-colors hover:bg-muted/50",
              (c as any).alert && "border-destructive/30 bg-destructive/5"
            )}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.onClick(); } }}
            onClick={c.onClick}
          >
            <CardContent className="p-3">
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

    </div>
  );
}
