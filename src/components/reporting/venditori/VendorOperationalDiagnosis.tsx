import type { ComponentType } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarX,
  CheckCircle2,
  Link2,
  ListChecks,
  Route,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  buildVendorOperationalDiagnosis,
  type VendorDiagnosisSeverity,
  type VendorIntegrationHealth,
} from "@/lib/reporting/vendorOperations";
import type { VendorKPI } from "@/hooks/useVendorReport";

const SEVERITY_STYLES: Record<VendorDiagnosisSeverity, { badge: string; icon: string; border: string }> = {
  good: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: "text-emerald-600",
    border: "border-emerald-200 bg-emerald-50/50",
  },
  info: {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    icon: "text-sky-600",
    border: "border-sky-200 bg-sky-50/50",
  },
  warning: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    icon: "text-amber-600",
    border: "border-amber-200 bg-amber-50/50",
  },
  critical: {
    badge: "border-red-200 bg-red-50 text-red-700",
    icon: "text-red-600",
    border: "border-red-200 bg-red-50/50",
  },
};

export function VendorOperationalDiagnosis({
  kpi,
  integration,
  isLoading,
}: {
  kpi: VendorKPI | null;
  integration: VendorIntegrationHealth | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg max-sm:text-sm">
                <ListChecks className="h-5 w-5 text-sky-600 max-sm:hidden" />
                Diagnosi operativa venditori
              </CardTitle>
              <CardDescription className="max-sm:hidden">
                Controllo di conversione, pipeline e integrazione CRM prima dei grafici.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit border-slate-200 bg-white text-slate-600">
              Caricamento
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <LoadingTile label="Opportunità senza prossimo step" />
            <LoadingTile label="Copertura pipeline" />
            <LoadingTile label="Appuntamenti senza esito" />
            <LoadingTile label="Controllo integrazione CRM" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Azioni consigliate</h3>
              <Skeleton className="h-20 rounded-md" />
            </div>
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Controllo integrazione CRM</h3>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-10/12" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const diagnosis = buildVendorOperationalDiagnosis(kpi, integration);
  const healthStyle = SEVERITY_STYLES[diagnosis.healthSeverity];
  const integrationIssues = integration ? [
    { label: "Contatti senza venditore", value: integration.unassignedContacts },
    { label: "Opportunità senza venditore", value: integration.unassignedOpportunities },
    { label: "Appuntamenti senza venditore", value: integration.unassignedAppointments },
    { label: "Appuntamenti senza contatto", value: integration.appointmentsWithoutContact },
  ] : [];
  const integrationDetail = diagnosis.integrationIssues > 0
    ? "Record da assegnare o collegare"
    : "Assegnazioni e collegamenti principali OK";

  return (
    // Telefono: titolo e stato su una riga, i quattro numeri 2×2, le azioni senza spiegazione;
    // il dettaglio dell'integrazione CRM resta al computer (il numero è già nel riquadro).
    <Card className={cn("border-slate-200", healthStyle.border)}>
      <CardHeader className="pb-3 max-sm:p-3 max-sm:pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between max-sm:flex-row max-sm:items-center max-sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg max-sm:text-sm">
              <ListChecks className={cn("h-5 w-5 max-sm:hidden", healthStyle.icon)} />
              Diagnosi operativa venditori
            </CardTitle>
            <CardDescription className="max-sm:hidden">
              Controllo di conversione, pipeline e integrazione CRM prima dei grafici.
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn("w-fit", healthStyle.badge)}>
            {diagnosis.healthLabel} · {diagnosis.healthScore}/100
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 max-sm:space-y-2 max-sm:p-3 max-sm:pt-0">
        <div className="grid gap-3 md:grid-cols-4 max-sm:grid-cols-2 max-sm:gap-2">
          <DiagnosisTile
            icon={Route}
            label="Opportunità senza prossimo step"
            value={String(integration?.staleOpenOpportunities ?? 0)}
            detail={`${diagnosis.openOpportunities} opportunità aperte totali`}
            severity={(integration?.staleOpenOpportunities ?? 0) > 0 ? "warning" : "good"}
          />
          <DiagnosisTile
            icon={BriefcaseBusiness}
            label="Copertura pipeline"
            value={diagnosis.pipelineCoverage > 0 ? `${formatNumber(diagnosis.pipelineCoverage)}x` : "N/D"}
            detail="Obiettivo consigliato: almeno 3x"
            severity={diagnosis.pipelineCoverage === 0 ? "info" : diagnosis.pipelineCoverage >= 3 ? "good" : "warning"}
          />
          <DiagnosisTile
            icon={CalendarX}
            label="Appuntamenti senza esito"
            value={String(diagnosis.unresolvedAppointments)}
            detail="Passati ma non completati"
            severity={diagnosis.unresolvedAppointments > 0 ? "warning" : "good"}
          />
          <DiagnosisTile
            icon={Link2}
            label="Controllo integrazione CRM"
            value={diagnosis.integrationIssues > 0 ? String(diagnosis.integrationIssues) : "OK"}
            detail={integrationDetail}
            severity={diagnosis.integrationIssues > 0 ? "warning" : "good"}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border bg-white p-4 max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
            <div className="mb-3 flex items-center gap-2 max-sm:mb-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 max-sm:hidden" />
              <h3 className="text-sm font-semibold text-slate-900 max-sm:text-[13px]">Azioni consigliate</h3>
            </div>
            <div className="space-y-2 max-sm:space-y-1.5">
              {diagnosis.actions.map((action) => {
                const style = SEVERITY_STYLES[action.severity];
                return (
                  <div key={action.key} className="flex gap-3 rounded-md border border-slate-100 bg-slate-50/60 p-3 max-sm:gap-2 max-sm:bg-white max-sm:px-2.5 max-sm:py-2">
                    <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", style.icon)} />
                    <div className="max-sm:min-w-0 max-sm:flex-1">
                      <div className="flex flex-wrap items-center gap-2 max-sm:flex-nowrap max-sm:justify-between">
                        <p className="text-sm font-medium text-slate-900 max-sm:text-[13px] max-sm:leading-tight">{action.title}</p>
                        <Badge variant="outline" className={cn("text-[11px] max-sm:shrink-0 max-sm:px-1.5", style.badge)}>
                          {severityLabel(action.severity)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600 max-sm:hidden">{action.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4 max-sm:hidden">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-slate-900">Controllo integrazione CRM</h3>
            </div>
            <div className="space-y-2">
              {integrationIssues.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-600">{item.label}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "tabular-nums",
                      item.value > 0 ? SEVERITY_STYLES.warning.badge : SEVERITY_STYLES.good.badge,
                    )}
                  >
                    {item.value}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              Un venditore è misurabile bene solo se contatto, appuntamento e opportunità restano collegati fino alla chiusura vinta o persa.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DiagnosisTile({
  icon: Icon,
  label,
  value,
  detail,
  severity,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  severity: VendorDiagnosisSeverity;
}) {
  const style = SEVERITY_STYLES[severity];
  return (
    <div className="rounded-lg border bg-white p-3 max-sm:min-w-0 max-sm:px-2.5 max-sm:py-2">
      <div className="mb-2 flex items-center justify-between gap-2 max-sm:mb-0.5">
        <p className="text-xs font-medium uppercase text-slate-500 max-sm:line-clamp-2 max-sm:text-[11px] max-sm:normal-case max-sm:leading-tight">{label}</p>
        <Icon className={cn("h-4 w-4 max-sm:hidden", style.icon)} />
      </div>
      <p className="text-xl font-semibold text-slate-950 max-sm:truncate max-sm:text-base">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-slate-500 max-sm:hidden">{detail}</p>
    </div>
  );
}

function LoadingTile({ label }: { label: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="mb-2 text-xs font-medium uppercase text-slate-500">{label}</p>
      <Skeleton className="h-7 w-16" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  );
}

function severityLabel(severity: VendorDiagnosisSeverity) {
  if (severity === "critical") return "Critico";
  if (severity === "warning") return "Attenzione";
  if (severity === "good") return "Ok";
  return "Info";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}
