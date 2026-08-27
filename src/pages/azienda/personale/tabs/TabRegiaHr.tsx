import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  History,
  MapPin,
  Network,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { Progress } from "@/components/ui/progress";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useLiveStatus } from "@/hooks/useTimbratura";
import { useAllHrProfili } from "@/hooks/useOrganigramma";
import { useRichieste } from "@/hooks/useRichieste";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

interface TabRegiaHrProps {
  onNavigate?: (tab: string) => void;
}

interface LiveStatusItem {
  is_present?: boolean;
}

interface HrSedeSummary {
  id: string;
  nome: string | null;
  attiva: boolean | null;
}

type HrActivityLogRow = Pick<
  Tables<"company_activity_log">,
  "id" | "created_at" | "event_type" | "action" | "description" | "actor_name" | "target_label" | "target_table" | "importance"
>;

export function TabRegiaHr({ onNavigate }: TabRegiaHrProps) {
  const companyId = useEffectiveCompanyId();
  const { data: profili = [], isLoading: loadingProfili } = useAllHrProfili();
  const { data: richiestePendenti = [], isLoading: loadingRichieste } = useRichieste({ stato: "in_attesa" });
  const { data: liveStatus = [], isLoading: loadingLive } = useLiveStatus();

  const { data: sedi = [], isLoading: loadingSedi } = useQuery<HrSedeSummary[]>({
    queryKey: ["hr-regia-sedi", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("hr_sedi")
        .select("id, nome, attiva")
        .eq("company_id", companyId)
        .order("nome", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: activityLog = [], isLoading: loadingActivity } = useQuery<HrActivityLogRow[]>({
    queryKey: ["hr-regia-activity", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("company_activity_log")
        .select("id, created_at, event_type, action, description, actor_name, target_label, target_table, importance")
        .eq("company_id", companyId)
        .or("target_table.eq.hr_richieste,target_table.eq.hr_giornate,target_table.eq.hr_profili,event_type.ilike.hr.%")
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) return [];
      return (data ?? []) as HrActivityLogRow[];
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });

  const metrics = useMemo(() => {
    const attivi = profili.filter((profilo) => profilo.attivo);
    const senzaSede = attivi.filter((profilo) => !profilo.sede_id).length;
    const senzaResponsabile = attivi.filter((profilo) => !profilo.responsabile_id).length;
    const saldiCritici = attivi.filter((profilo) => (
      Number(profilo.ferie_residue ?? 0) < 0
      || Number(profilo.permessi_residui_ore ?? 0) < 0
      || Number(profilo.rol_residuo_ore ?? 0) < 0
    )).length;
    const presentiOra = (liveStatus as LiveStatusItem[]).filter((profilo) => profilo.is_present).length;
    const sediAttive = sedi.filter((sede) => sede.attiva !== false).length;

    const penalties =
      richiestePendenti.length * 4 +
      saldiCritici * 8 +
      senzaSede * 3 +
      Math.max(0, senzaResponsabile - 1) * 2 +
      (sediAttive === 0 && attivi.length > 0 ? 18 : 0);

    return {
      attivi,
      totaleAttivi: attivi.length,
      senzaSede,
      senzaResponsabile,
      saldiCritici,
      presentiOra,
      sediAttive,
      healthScore: Math.max(0, Math.min(100, 100 - penalties)),
    };
  }, [liveStatus, profili, richiestePendenti.length, sedi]);

  const actions = useMemo(() => {
    const list: Array<{
      title: string;
      description: string;
      tab: string;
      severity: "alta" | "media" | "bassa";
      icon: typeof AlertTriangle;
    }> = [];

    if (richiestePendenti.length > 0) {
      list.push({
        title: "Richieste da approvare",
        description: `${richiestePendenti.length} richiesta${richiestePendenti.length === 1 ? "" : "e"} in attesa di risposta.`,
        tab: "richieste",
        severity: "alta",
        icon: CalendarCheck,
      });
    }

    if (metrics.saldiCritici > 0) {
      list.push({
        title: "Saldi HR da verificare",
        description: `${metrics.saldiCritici} profil${metrics.saldiCritici === 1 ? "o ha" : "i hanno"} ferie, permessi o ROL sotto zero.`,
        tab: "profili",
        severity: "alta",
        icon: ShieldCheck,
      });
    }

    if (metrics.sediAttive === 0 && metrics.totaleAttivi > 0) {
      list.push({
        title: "Nessuna sede HR configurata",
        description: "Senza sedi, GPS e controlli timbratura non possono validare bene il personale.",
        tab: "sedi",
        severity: "alta",
        icon: MapPin,
      });
    } else if (metrics.senzaSede > 0) {
      list.push({
        title: "Profili senza sede",
        description: `${metrics.senzaSede} profili attivi non hanno una sede assegnata.`,
        tab: "profili",
        severity: "media",
        icon: Building2,
      });
    }

    if (metrics.senzaResponsabile > 1) {
      list.push({
        title: "Organigramma incompleto",
        description: `${metrics.senzaResponsabile} profili attivi non hanno un responsabile.`,
        tab: "organigramma",
        severity: "media",
        icon: Network,
      });
    }

    if (metrics.totaleAttivi > 0 && liveStatus.length === 0) {
      list.push({
        title: "Stato presenze non disponibile",
        description: "I profili esistono, ma non ci sono dati live sulle timbrature di oggi.",
        tab: "timbrature",
        severity: "bassa",
        icon: Clock,
      });
    }

    return list;
  }, [liveStatus.length, metrics, richiestePendenti.length]);

  const loading = loadingProfili || loadingRichieste || loadingLive || loadingSedi;

  return (
    <div className="space-y-4">
      {/* Testata navy famiglia (come Costi/Commesse): i quattro numeri di
          controllo HR, cliccabili → portano al tab che li gestisce. */}
      <div className="rounded-2xl bg-[#173b67] p-3 sm:p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-orange-100">Regia HR</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <NavyStatCard
            label="Profili attivi"
            value={loading ? "…" : metrics.totaleAttivi}
            sub={metrics.senzaSede > 0 ? `${metrics.senzaSede} senza sede` : "anagrafiche a posto"}
            icon={Users}
            tone={metrics.senzaSede > 0 ? "text-orange-300" : "text-blue-100"}
            onClick={() => onNavigate?.("profili")}
          />
          <NavyStatCard
            label="Presenti ora"
            value={loading ? "…" : metrics.presentiOra}
            sub={`su ${metrics.totaleAttivi} attivi`}
            icon={UserRoundCheck}
            tone="text-emerald-300"
            onClick={() => onNavigate?.("timbrature")}
          />
          <NavyStatCard
            label="Richieste aperte"
            value={loading ? "…" : richiestePendenti.length}
            sub={richiestePendenti.length > 0 ? "da approvare" : "nessuna in attesa"}
            icon={CalendarCheck}
            tone={richiestePendenti.length > 0 ? "text-orange-300" : "text-blue-100"}
            onClick={() => onNavigate?.("richieste")}
          />
          <NavyStatCard
            label="Sedi attive"
            value={loading ? "…" : metrics.sediAttive}
            sub={metrics.sediAttive === 0 ? "nessuna sede" : "operative"}
            icon={MapPin}
            tone={metrics.sediAttive === 0 && metrics.totaleAttivi > 0 ? "text-orange-300" : "text-blue-100"}
            onClick={() => onNavigate?.("sedi")}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Stato operativo HR</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Controllo rapido su presenze, richieste, sedi e organigramma.
              </p>
            </div>
            <Badge className={metrics.healthScore >= 80 ? "bg-emerald-100 text-emerald-700" : metrics.healthScore >= 55 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>
              {metrics.healthScore}/100
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={metrics.healthScore} className="h-2" />
          {actions.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Nessuna criticità operativa evidente</p>
                <p className="text-emerald-700">Sedi, richieste e struttura HR risultano coerenti con i dati caricati.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <div key={`${action.tab}-${action.title}`} className="flex items-start gap-3 rounded-lg border bg-white p-3">
                    <div className={action.severity === "alta" ? "rounded-lg bg-red-50 p-2 text-red-600" : action.severity === "media" ? "rounded-lg bg-amber-50 p-2 text-amber-600" : "rounded-lg bg-slate-50 p-2 text-slate-600"}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm">{action.title}</p>
                        <Badge variant="outline" className="text-[10px] uppercase">{action.severity}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => onNavigate?.(action.tab)}>
                      Apri
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
                Registro HR recente
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Ultime azioni tracciate su richieste, profili e giornate HR.
              </p>
            </div>
            <Badge variant="outline">{activityLog.length} eventi</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loadingActivity ? (
            <div className="space-y-2">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : activityLog.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nessun evento HR tracciato. Le nuove approvazioni richieste verranno registrate qui.
            </div>
          ) : (
            <div className="space-y-2">
              {activityLog.map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-lg border bg-white p-3">
                  <div className={event.importance === "high" || event.importance === "critical" ? "rounded-lg bg-amber-50 p-2 text-amber-600" : "rounded-lg bg-slate-50 p-2 text-slate-600"}>
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {event.description || event.event_type || event.action}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {event.target_table || "HR"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.actor_name || "Sistema"} · {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: it })}
                      {event.target_label ? ` · ${event.target_label}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

