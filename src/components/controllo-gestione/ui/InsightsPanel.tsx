/**
 * InsightsPanel — renderizza i risultati di `runRules` raggruppati per
 * severity e ordinati (danger > warning > info > success). Da usare in cima
 * a ogni tab di Controllo di Gestione.
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertOctagon, AlertTriangle, CheckCircle2, ExternalLink, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Insight, Severity } from "@/lib/controlloGestione/interpreter";

const ICONS: Record<Severity, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: AlertOctagon,
};

const VARIANTS: Record<Severity, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  info: "border-blue-300 bg-blue-50 text-blue-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  danger: "border-red-300 bg-red-50 text-red-900",
};

const ORDER: Record<Severity, number> = { danger: 0, warning: 1, info: 2, success: 3 };

interface Props {
  insights: Insight[];
  /** Numero massimo di insight visualizzati (default 6). */
  max?: number;
  /** Titolo opzionale sopra al pannello. */
  title?: string;
}

export function InsightsPanel({ insights, max = 6, title }: Props) {
  if (insights.length === 0) return null;
  const sorted = [...insights].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]).slice(0, max);

  return (
    <div className="space-y-2">
      {title && <h3 className="text-sm font-semibold text-slate-700">{title}</h3>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sorted.map((insight) => {
          const Icon = ICONS[insight.severity];
          return (
            <Alert key={insight.id} className={cn("border-l-4", VARIANTS[insight.severity])}>
              <Icon className="h-4 w-4" />
              <AlertTitle className="text-sm font-semibold leading-tight">{insight.title}</AlertTitle>
              <AlertDescription className="mt-1 text-sm leading-relaxed">
                {insight.body}
                {insight.drilldown && (
                  <Link
                    to={insight.drilldown.href}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2 hover:no-underline"
                  >
                    {insight.drilldown.label}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </AlertDescription>
            </Alert>
          );
        })}
      </div>
    </div>
  );
}
