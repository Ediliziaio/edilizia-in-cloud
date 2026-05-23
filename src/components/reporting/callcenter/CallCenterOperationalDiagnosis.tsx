import { AlertTriangle, CheckCircle2, Clock, ListChecks, PhoneOff, Target, TimerReset } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildCallCenterOperationalDiagnosis,
  type CallCenterDiagnosisSeverity,
} from "@/lib/reporting/callCenterOperations";
import type { CallCenterKPI } from "@/hooks/useCallCenterReport";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<CallCenterDiagnosisSeverity, { badge: string; icon: string; border: string }> = {
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

export function CallCenterOperationalDiagnosis({
  kpi,
  isLoading,
}: {
  kpi: CallCenterKPI | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ListChecks className="h-5 w-5 text-sky-600" />
                Diagnosi operativa chiamate
              </CardTitle>
              <CardDescription>
                Lettura immediata di backlog, SLA e priorità da correggere prima dei grafici.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit border-slate-200 bg-white text-slate-600">
              Caricamento
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <LoadingTile label="Lead da lavorare" />
            <LoadingTile label="Lavorati senza risposta" />
            <LoadingTile label="Lead non contattati" />
            <LoadingTile label="Rischio principale" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Azioni consigliate</h3>
              <Skeleton className="h-16 rounded-md" />
            </div>
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">SLA operativo consigliato</h3>
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

  const diagnosis = buildCallCenterOperationalDiagnosis(kpi);
  const healthStyle = SEVERITY_STYLES[diagnosis.healthSeverity];

  return (
    <Card className={cn("border-slate-200", healthStyle.border)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ListChecks className={cn("h-5 w-5", healthStyle.icon)} />
              Diagnosi operativa chiamate
            </CardTitle>
            <CardDescription>
              Lettura immediata di backlog, SLA e priorità da correggere prima dei grafici.
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn("w-fit", healthStyle.badge)}>
            {diagnosis.healthLabel} · {diagnosis.healthScore}/100
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <DiagnosisTile
            icon={PhoneOff}
            label="Lead da lavorare"
            value={String(diagnosis.unworkedLeads)}
            detail="Assegnati senza chiamata"
            severity={diagnosis.unworkedLeads > 0 ? "warning" : "good"}
          />
          <DiagnosisTile
            icon={Target}
            label="Lavorati senza risposta"
            value={String(diagnosis.workedNoAnswerLeads)}
            detail="Serve richiamo mirato"
            severity={diagnosis.workedNoAnswerLeads > 0 ? "warning" : "good"}
          />
          <DiagnosisTile
            icon={Clock}
            label="Lead non contattati"
            value={String(diagnosis.missedContactLeads)}
            detail="Gap sul tasso contatto"
            severity={diagnosis.missedContactLeads > 0 ? "warning" : "good"}
          />
          <DiagnosisTile
            icon={TimerReset}
            label="Rischio principale"
            value={diagnosis.healthLabel}
            detail={diagnosis.primaryRisk}
            severity={diagnosis.healthSeverity}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-slate-900">Azioni consigliate</h3>
            </div>
            <div className="space-y-2">
              {diagnosis.actions.map((action) => {
                const style = SEVERITY_STYLES[action.severity];
                return (
                  <div key={action.key} className="flex gap-3 rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", style.icon)} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{action.title}</p>
                        <Badge variant="outline" className={cn("text-[11px]", style.badge)}>
                          {severityLabel(action.severity)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">{action.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">SLA operativo consigliato</h3>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Prima chiamata entro 5 minuti dal lead.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Almeno 3 tentativi nelle prime 24 ore.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Tasso contatto sopra il 60%.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Appuntamenti sopra il 20% dei contattati.
              </li>
            </ul>
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
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  severity: CallCenterDiagnosisSeverity;
}) {
  const style = SEVERITY_STYLES[severity];
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
        <Icon className={cn("h-4 w-4", style.icon)} />
      </div>
      <p className="text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{detail}</p>
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

function severityLabel(severity: CallCenterDiagnosisSeverity) {
  if (severity === "critical") return "Critico";
  if (severity === "warning") return "Attenzione";
  if (severity === "good") return "Ok";
  return "Info";
}
