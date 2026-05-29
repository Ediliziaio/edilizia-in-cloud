/**
 * EmailLearningDashboard — MP-EMAIL-AI-03 · Cruscotto apprendimento
 *
 * Mostra la metrica NORD del sistema: % email risolte da L1 (regola, costo zero)
 * sul totale classificato. Target: >90% entro 60gg.
 *
 * Legge da RPC `email_learning_dashboard` (aggregato email_metriche_giorno).
 * Pensato per la pagina SuperAdmin/Impostazioni email.
 */

import { useEmailLearningDashboard } from "@/lib/email-ai/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Cpu, Hand, AlertCircle, Users, Ban, Zap,
} from "lucide-react";

export interface EmailLearningDashboardProps {
  days?: number;
  className?: string;
}

export function EmailLearningDashboard({ days = 30, className }: EmailLearningDashboardProps) {
  const { data, isLoading } = useEmailLearningDashboard(days);

  if (isLoading) {
    return (
      <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  const d = data ?? {
    north_star_l1_perc: 0, totale: 0, da_regola: 0, da_haiku: 0,
    da_manuale: 0, da_rivedere: 0, serie: [], mittenti_appresi: 0, blacklist_count: 0,
  };

  const l1 = Number(d.north_star_l1_perc) || 0;
  const targetReached = l1 >= 90;
  const targetColor = l1 >= 90 ? "text-emerald-600" : l1 >= 70 ? "text-amber-600" : "text-red-600";
  const targetBg = l1 >= 90 ? "bg-emerald-500" : l1 >= 70 ? "bg-amber-500" : "bg-red-500";

  const maxSerie = Math.max(1, ...d.serie.map((s) => s.totale));

  return (
    <div className={cn("space-y-4", className)}>
      {/* North star */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-500" />
            Metrica Nord — % email gestite a costo zero (Livello 1)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <span className={cn("text-5xl font-bold tabular-nums", targetColor)}>{l1}%</span>
            <span className="text-sm text-muted-foreground mb-2">
              su {d.totale} email · ultimi {days} giorni
            </span>
          </div>
          {/* Progress bar verso target 90% */}
          <div className="mt-3 h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", targetBg)}
              style={{ width: `${Math.min(100, l1)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {targetReached
              ? "🎯 Target raggiunto: il sistema gestisce >90% delle email senza chiamate AI."
              : `Target: 90%. Mancano ${(90 - l1).toFixed(1)} punti. Ogni correzione manuale alza questa curva.`}
          </p>
        </CardContent>
      </Card>

      {/* Breakdown 4 KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={TrendingUp} label="Da regola (L1)" value={d.da_regola} accent="emerald" hint="Costo ZERO" />
        <KpiCard icon={Cpu} label="Da Haiku (L3)" value={d.da_haiku} accent="blue" hint="Costo centesimi" />
        <KpiCard icon={Hand} label="Corrette a mano" value={d.da_manuale} accent="violet" hint="Diventano regole" />
        <KpiCard icon={AlertCircle} label="Da rivedere" value={d.da_rivedere} accent="amber" hint="In coda 'Da fare'" />
      </div>

      {/* Cache appresa */}
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard icon={Users} label="Mittenti appresi" value={d.mittenti_appresi} accent="slate" hint="Cache mittenti_noti" />
        <KpiCard icon={Ban} label="In blacklist spam" value={d.blacklist_count} accent="red" hint="Bloccati automaticamente" />
      </div>

      {/* Mini grafico serie temporale */}
      {d.serie.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Andamento giornaliero (volume + quota L1)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {d.serie.map((s, i) => {
                const h = (s.totale / maxSerie) * 100;
                const l1pct = s.totale > 0 ? (s.da_regola / s.totale) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col justify-end group relative"
                    title={`${s.giorno}: ${s.totale} email, ${l1pct.toFixed(0)}% L1`}
                  >
                    <div className="w-full rounded-t bg-muted relative overflow-hidden" style={{ height: `${Math.max(4, h)}%` }}>
                      <div className="absolute bottom-0 left-0 right-0 bg-emerald-500" style={{ height: `${l1pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> quota L1</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted" /> resto (AI/manuale)</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, accent, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: "emerald" | "blue" | "violet" | "amber" | "slate" | "red";
  hint?: string;
}) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-600 bg-emerald-50",
    blue: "text-blue-600 bg-blue-50",
    violet: "text-violet-600 bg-violet-50",
    amber: "text-amber-600 bg-amber-50",
    slate: "text-slate-600 bg-slate-50",
    red: "text-red-600 bg-red-50",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={cn("p-1.5 rounded-lg", colors[accent])}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-2xl font-bold tabular-nums">{value.toLocaleString("it-IT")}</div>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
