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
import { HrQueryError } from "@/components/hr/HrQueryError";
import { buildOrgTree, orgLinksToReview, hasValidGps } from "@/lib/personale/organizzazione";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

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
  lat: number | null;
  lng: number | null;
}

type HrActivityLogRow = Pick<
  Tables<"company_activity_log">,
  "id" | "created_at" | "event_type" | "action" | "description" | "actor_name" | "target_label" | "target_table" | "importance"
>;

export function TabRegiaHr({ onNavigate }: TabRegiaHrProps) {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const profilesQuery = useAllHrProfili();
  const requestsQuery = useRichieste({ stato: "in_attesa" });
  const liveQuery = useLiveStatus();
  const { data: profili = [], isLoading: loadingProfili } = profilesQuery;
  const { data: richiestePendenti = [], isLoading: loadingRichieste } = requestsQuery;
  const { data: liveStatus = [], isLoading: loadingLive } = liveQuery;

  const sitesQuery = useQuery<HrSedeSummary[]>({
    queryKey: ["hr-regia-sedi", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("hr_sedi")
        .select("id, nome, attiva, lat, lng")
        .eq("company_id", companyId)
        .order("nome", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sedi = [], isLoading: loadingSedi } = sitesQuery;
  const { data: activityLog = [], isLoading: loadingActivity, isError: errorActivity, refetch: retryActivity } = useQuery<HrActivityLogRow[]>({
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

      if (error) throw error;
      return (data ?? []) as HrActivityLogRow[];
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });

  const metrics = useMemo(() => {
    const attivi = profili.filter((profilo) => profilo.attivo);
    const senzaSede = attivi.filter((profilo) => !profilo.sede_id).length;
    const senzaResponsabile = orgLinksToReview(attivi, buildOrgTree(attivi)).length;
    const saldiCritici = attivi.filter((profilo) => (
      Number(profilo.ferie_residue ?? 0) < 0
      || Number(profilo.permessi_residui_ore ?? 0) < 0
      || Number(profilo.rol_residuo_ore ?? 0) < 0
    )).length;
    const presentiOra = (liveStatus as LiveStatusItem[]).filter((profilo) => profilo.is_present).length;
    const sediAttive = sedi.filter((sede) => sede.attiva !== false).length;

    const penalties =
      saldiCritici * 8 +
      senzaSede * 3 +
      senzaResponsabile * 2 +
      (sediAttive === 0 && attivi.length > 0 ? 18 : 0);

    return {
      attivi,
      totaleAttivi: attivi.length,
      senzaSede,
      senzaResponsabile,
      saldiCritici,
      presentiOra,
      sediAttive,
      sediGps: sedi.filter((sede) => sede.attiva !== false && hasValidGps(sede)).length,
      healthScore: Math.max(0, Math.min(100, 100 - penalties)),
    };
  }, [liveStatus, profili, sedi]);

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
        title: t("Richieste da approvare"),
        description: richiestePendenti.length === 1
          ? t("1 richiesta in attesa di risposta.")
          : t("{n} richieste in attesa di risposta.", { n: richiestePendenti.length }),
        tab: "richieste",
        severity: "alta",
        icon: CalendarCheck,
      });
    }

    if (metrics.saldiCritici > 0) {
      list.push({
        title: t("Saldi HR da verificare"),
        description: metrics.saldiCritici === 1
          ? t("1 profilo ha ferie, permessi o ROL sotto zero.")
          : t("{n} profili hanno ferie, permessi o ROL sotto zero.", { n: metrics.saldiCritici }),
        tab: "profili",
        severity: "alta",
        icon: ShieldCheck,
      });
    }

    if (metrics.sediAttive === 0 && metrics.totaleAttivi > 0) {
      list.push({
        title: t("Nessuna sede HR configurata"),
        description: t("Senza sedi, GPS e controlli timbratura non possono validare bene il personale."),
        tab: "sedi",
        severity: "alta",
        icon: MapPin,
      });
    } else if (metrics.senzaSede > 0) {
      list.push({
        title: t("Profili senza sede"),
        description: t("{n} profili attivi non hanno una sede assegnata.", { n: metrics.senzaSede }),
        tab: "profili",
        severity: "media",
        icon: Building2,
      });
    }

    if (metrics.senzaResponsabile > 0) {
      list.push({
        title: t("Collegamenti da verificare"),
        description: t("{n} collegamenti dell'organigramma non sono validi. I profili autonomi non sono errori.", { n: metrics.senzaResponsabile }),
        tab: "organigramma",
        severity: "media",
        icon: Network,
      });
    }

    if (metrics.totaleAttivi > 0 && liveStatus.length === 0) {
      list.push({
        title: t("Stato presenze non disponibile"),
        description: t("I profili esistono, ma non ci sono dati live sulle timbrature di oggi."),
        tab: "timbrature",
        severity: "bassa",
        icon: Clock,
      });
    }

    return list;
  }, [liveStatus.length, metrics, richiestePendenti.length, t]);

  const loading = loadingProfili || loadingRichieste || loadingLive || loadingSedi;
  const failed = profilesQuery.isError || requestsQuery.isError || liveQuery.isError || sitesQuery.isError;
  const unavailable = loading || failed || !companyId;

  return (
    <div className="space-y-4">
      {failed && <HrQueryError label={t("Controllo HR incompleto")} onRetry={() => Promise.all([profilesQuery.refetch(), requestsQuery.refetch(), liveQuery.refetch(), sitesQuery.refetch()])} />}
      {/* Testata navy famiglia (come Costi/Commesse): i quattro numeri di
          controllo HR, cliccabili → portano al tab che li gestisce. */}
      <div className="rounded-2xl bg-eic-navy-deep px-3 py-2 max-sm:p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-orange-100">{t("Regia HR")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <NavyStatCard
            label={t("Profili attivi")}
            value={unavailable ? "—" : metrics.totaleAttivi}
            sub={unavailable ? "dati da verificare" : metrics.senzaSede > 0 ? `${metrics.senzaSede} senza sede` : "sede assegnata"}
            icon={Users}
            tone={metrics.senzaSede > 0 ? "text-orange-300" : "text-blue-100"}
            onClick={() => onNavigate?.("profili")}
          />
          <NavyStatCard
            label={t("Presenti ora")}
            value={unavailable ? "—" : metrics.presentiOra}
            sub={`su ${metrics.totaleAttivi} attivi`}
            icon={UserRoundCheck}
            tone="text-emerald-300"
            onClick={() => onNavigate?.("timbrature")}
          />
          <NavyStatCard
            label={t("Richieste aperte")}
            value={unavailable ? "—" : richiestePendenti.length}
            sub={richiestePendenti.length > 0 ? "da approvare" : "nessuna in attesa"}
            icon={CalendarCheck}
            tone={richiestePendenti.length > 0 ? "text-orange-300" : "text-blue-100"}
            onClick={() => onNavigate?.("richieste")}
          />
          <NavyStatCard
            label={t("Sedi attive")}
            value={unavailable ? "—" : metrics.sediAttive}
            sub={unavailable ? "dati da verificare" : `${metrics.sediGps} con coordinate GPS`}
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
              <CardTitle className="text-base">{t("Stato operativo HR")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Controllo rapido su presenze, richieste, sedi e organigramma.")}
              </p>
            </div>
            <Badge className={metrics.healthScore >= 80 ? "bg-emerald-100 text-emerald-700" : metrics.healthScore >= 55 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>
              {unavailable ? t("Non verificabile") : t("Indice dati {healthScore}/100", { healthScore: String(metrics.healthScore ?? "") })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("Indicatore dei soli dati caricati, non certificazione HR: saldi negativi, sede e collegamenti. Le richieste in attesa non riducono l'indice.")}</p>
          {!unavailable && <Progress value={metrics.healthScore} className="h-2" />}
          {unavailable ? <p className="text-sm text-muted-foreground">{t("Attendo dati completi per mostrare le verifiche operative.")}</p> : actions.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{t("Nessuna criticità operativa evidente")}</p>
                <p className="text-emerald-700">{t("Sedi, richieste e struttura HR risultano coerenti con i dati caricati.")}</p>
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
                        <Badge variant="outline" className="text-[10px] uppercase">{t(action.severity)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => onNavigate?.(action.tab)}>
                      {t("Apri")}
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
                {t("Registro HR recente")}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Ultime azioni tracciate su richieste, profili e giornate HR.")}
              </p>
            </div>
            <Badge variant="outline">{t("{n} eventi", { n: activityLog.length })}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loadingActivity ? (
            <div className="space-y-2">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : errorActivity ? <HrQueryError label={t("Registro HR non disponibile")} onRetry={retryActivity} /> : activityLog.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t("Nessun evento HR tracciato. Le nuove approvazioni richieste verranno registrate qui.")}
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
                        {({ hr_richieste: "Richieste", hr_giornate: "Presenze", hr_profili: "Profili", hr_sedi: "Sedi" } as Record<string, string>)[event.target_table ?? ""] || t("Personale")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.actor_name || t("Sistema")} · {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: dateFnsCampo() })}
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

