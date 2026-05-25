/**
 * SilvioAlertsPanel — Widget Cose-da-sapere proattivo
 *
 * Layout:
 *   - Header con conta critici/warning
 *   - Lista alert con severity icon, title, message conciso
 *   - CTA button per ognuno (es. "Manda sollecito")
 *   - "Dismiss" per ogni alert
 *   - Refresh manuale
 *
 * Usato in:
 *   - Cruscotto azienda (widget principale)
 *   - Sidebar Chat Team accanto a Silvio
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Sparkles, X, RefreshCw,
  ArrowRight, Bell, Wallet, Package, FileText, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SilvioAlert {
  id: string;
  alert_type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  cta_label: string | null;
  cta_action: string | null;
  cta_payload: Record<string, unknown> | null;
  source_type: string | null;
  source_id: string | null;
  source_meta: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

const ALERT_TYPE_ICON: Record<string, typeof Bell> = {
  payment_overdue: Wallet,
  low_stock: Package,
  quote_aging: FileText,
  hr_request_pending: Calendar,
};

/**
 * Mappa cta_action → route target. Se l'azione inizia con "open_" o è qui
 * dentro, click → navigate (no proposal). Altrimenti → silvio_promote_alert_to_proposal.
 */
const CTA_NAVIGATION_MAP: Record<string, (payload: Record<string, unknown> | null) => string> = {
  open_cashflow_forecast: () => "/azienda/cashflow-forecast",
  open_quote: (payload) => {
    const id = payload?.quote_id ?? payload?.id;
    return id ? `/azienda/preventivi/${id}` : "/azienda/preventivi";
  },
  open_order: (payload) => {
    const id = payload?.order_id ?? payload?.id;
    return id ? `/azienda/ordini/${id}` : "/azienda/ordini";
  },
  open_stock: (payload) => {
    const id = payload?.stock_id ?? payload?.id;
    return id ? `/azienda/magazzino?item=${id}` : "/azienda/magazzino";
  },
  open_employee: (payload) => {
    const id = payload?.employee_id ?? payload?.user_id ?? payload?.id;
    return id ? `/azienda/personale/${id}` : "/azienda/personale";
  },
  open_hr_requests: () => "/azienda/personale?tab=ferie-permessi",
};

function resolveCtaNavigation(action: string | null, payload: Record<string, unknown> | null): string | null {
  if (!action) return null;
  const handler = CTA_NAVIGATION_MAP[action];
  if (!handler) return null;
  return handler(payload);
}

function alertColorClasses(severity: string) {
  switch (severity) {
    case "critical": return { ring: "ring-rose-200 bg-rose-50", text: "text-rose-700", border: "border-rose-200", rail: "bg-rose-500", surface: "bg-rose-50/45" };
    case "warning": return { ring: "ring-amber-200 bg-amber-50", text: "text-amber-700", border: "border-amber-200", rail: "bg-amber-500", surface: "bg-amber-50/45" };
    default: return { ring: "ring-sky-200 bg-sky-50", text: "text-sky-700", border: "border-sky-200", rail: "bg-sky-500", surface: "bg-sky-50/45" };
  }
}

interface SilvioAlertsPanelProps {
  variant?: "full" | "compact";
  onAlertCtaClick?: (alert: SilvioAlert) => void;
  /** Se true, click sul CTA promuove l'alert a proposal (default true) */
  enableAutoPropose?: boolean;
  maxItems?: number;
}

export function SilvioAlertsPanel({
  variant = "full",
  onAlertCtaClick,
  enableAutoPropose = true,
  maxItems = 10,
}: SilvioAlertsPanelProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: alerts, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["silvio_alerts_open", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      // FIX TENANT ISOLATION: filtro company_id esplicito (super_admin RLS
      // bypass + get_my_company_id non rispetta impersonation).
      const { data, error } = await supabase
        .from("silvio_alerts" as never)
        .select("id, alert_type, severity, title, message, cta_label, cta_action, cta_payload, source_type, source_id, source_meta, status, created_at")
        .eq("company_id", companyId)
        .eq("status", "open")
        .order("severity", { ascending: true }) // critical comes first alphabetically
        .order("created_at", { ascending: false })
        .limit(maxItems);
      if (error) throw error;
      return (data ?? []) as unknown as SilvioAlert[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
    refetchInterval: 120_000, // re-check ogni 2 minuti
  });

  const { data: stats } = useQuery({
    queryKey: ["silvio_alerts_stats", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase.rpc("silvio_alerts_stats", { p_company_id: companyId });
      if (error) throw error;
      return data as { critical: number; warning: number; info: number; total_open: number };
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const dismissMut = useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase.rpc("silvio_dismiss_alert", { p_alert_id: alertId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["silvio_alerts_open"] });
      qc.invalidateQueries({ queryKey: ["silvio_alerts_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detectMut = useMutation({
    mutationFn: async () => {
      if (!companyId) return;
      const { error } = await supabase.rpc("silvio_detect_alerts", { p_company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scansione completata");
      qc.invalidateQueries({ queryKey: ["silvio_alerts_open"] });
      qc.invalidateQueries({ queryKey: ["silvio_alerts_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Promuove un alert a proposal (auto-trigger su CTA click)
  const promoteMut = useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase.rpc("silvio_promote_alert_to_proposal", { p_alert_id: alertId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Bozza creata. Verifica e applica nel pannello azioni.");
      qc.invalidateQueries({ queryKey: ["silvio_action_proposals_pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCtaClick = (alert: SilvioAlert) => {
    if (onAlertCtaClick) {
      onAlertCtaClick(alert);
      return;
    }
    // Se cta_action è una navigazione (open_*), apri la route
    const navTarget = resolveCtaNavigation(alert.cta_action, alert.cta_payload);
    if (navTarget) {
      navigate(navTarget);
      return;
    }
    // Altrimenti promuovi a proposal (azione operativa)
    if (enableAutoPropose && alert.cta_action) {
      promoteMut.mutate(alert.id);
    }
  };

  const grouped = useMemo(() => {
    const list = alerts ?? [];
    return {
      critical: list.filter(a => a.severity === "critical"),
      warning: list.filter(a => a.severity === "warning"),
      info: list.filter(a => a.severity === "info"),
    };
  }, [alerts]);

  const totalOpen = stats?.total_open ?? 0;
  const isCompact = variant === "compact";

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Cose da sapere</CardTitle></CardHeader>
        <CardContent className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></CardContent>
      </Card>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className={cn("pb-2", isCompact && "py-2")}>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" /> Tutto sotto controllo
          </CardTitle>
        </CardHeader>
        <CardContent className={cn(isCompact && "py-2")}>
          <p className="text-sm text-muted-foreground">
            Nessuna criticità rilevata. Silvio sta monitorando tutto in autonomia.
          </p>
          <Button
            size="sm" variant="ghost" className="mt-2 gap-2"
            onClick={() => detectMut.mutate()}
            disabled={detectMut.isPending}
          >
            <RefreshCw className={cn("h-3 w-3", detectMut.isPending && "animate-spin")} />
            Scansiona ora
          </Button>
        </CardContent>
      </Card>
    );
  }

  const content = (
    <CardContent className={cn("space-y-2 pt-0", isCompact && "px-3 pb-3")}>
      {(["critical", "warning", "info"] as const).map(sev => {
        const list = grouped[sev];
        if (list.length === 0) return null;
        return (
          <div key={sev} className="space-y-2">
            {!isCompact && (
              <div className={cn("text-[10px] uppercase tracking-wider font-semibold",
                sev === "critical" && "text-rose-700",
                sev === "warning" && "text-amber-700",
                sev === "info" && "text-sky-700"
              )}>
                {sev === "critical" ? "🔴 Critici" : sev === "warning" ? "🟡 Importanti" : "🔵 Info"}
              </div>
            )}
            {list.map(alert => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onCtaClick={handleCtaClick}
                onDismiss={() => dismissMut.mutate(alert.id)}
                isDismissing={dismissMut.isPending}
                compact={isCompact}
              />
            ))}
          </div>
        );
      })}
    </CardContent>
  );

  return (
    <Card className={cn(isCompact && "overflow-hidden border-slate-200 shadow-none")}>
      <CardHeader className={cn("pb-3", isCompact && "px-3 py-3")}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className={cn("flex items-center gap-2", isCompact ? "text-sm" : "text-base")}>
              <Bell className="h-4 w-4 text-orange-500" /> Cose da sapere
            </CardTitle>
            {/* NB: <div> e non CardDescription (che renderizza <p>): Badge è un
                <div>, mettere <div> in <p> viola HTML5 e causa hydration warning
                (validateDOMNesting). Stesso styling muted+text-xs di CardDescription. */}
            <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
              {(stats?.critical ?? 0) > 0 && (
                <Badge variant="destructive" className="h-5 rounded-full px-2 text-[11px]">{stats!.critical} critici</Badge>
              )}
              {(stats?.warning ?? 0) > 0 && (
                <Badge variant="secondary" className="h-5 rounded-full bg-amber-100 px-2 text-[11px] text-amber-800">
                  {stats!.warning} avvisi
                </Badge>
              )}
              {(stats?.info ?? 0) > 0 && (
                <Badge variant="outline" className="h-5 rounded-full px-2 text-[11px]">{stats!.info} info</Badge>
              )}
              {totalOpen === 0 && "Nessun problema"}
            </div>
          </div>
          <Button
            size="icon" variant="ghost"
            onClick={() => { detectMut.mutate(); refetch(); }}
            disabled={isFetching || detectMut.isPending}
            title="Aggiorna"
            className="h-7 w-7"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", (isFetching || detectMut.isPending) && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      {isCompact ? content : <ScrollArea className="h-[480px]">{content}</ScrollArea>}
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function AlertRow({
  alert, onCtaClick, onDismiss, isDismissing, compact,
}: {
  alert: SilvioAlert;
  onCtaClick?: (a: SilvioAlert) => void;
  onDismiss: () => void;
  isDismissing: boolean;
  compact: boolean;
}) {
  const TypeIcon = ALERT_TYPE_ICON[alert.alert_type] ?? Bell;
  const colors = alertColorClasses(alert.severity);

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-lg border transition-colors",
      colors.border,
      colors.surface,
      compact ? "p-2.5" : "p-3",
    )}>
      <span className={cn("absolute inset-y-0 left-0 w-1", colors.rail)} />
      <div className="flex items-start gap-2.5 pl-1">
        <div className={cn("rounded-md ring-1 p-1.5 shrink-0", colors.ring)}>
          <TypeIcon className={cn("h-3.5 w-3.5", colors.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium leading-tight text-slate-950">{alert.title}</div>
            <button
              onClick={onDismiss}
              disabled={isDismissing}
              className={cn(
                "rounded-sm text-muted-foreground transition hover:bg-background/70 hover:text-foreground",
                compact ? "opacity-70" : "opacity-0 group-hover:opacity-100",
              )}
              title="Ignora"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</p>
          )}
          {alert.cta_label && onCtaClick && (
            <Button
              size="sm" variant="ghost"
              className={cn("mt-1 h-7 px-0 text-xs font-semibold gap-1 hover:bg-transparent", colors.text)}
              onClick={() => onCtaClick(alert)}
            >
              {alert.cta_label}
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Compact badge for sidebar / nav

export function SilvioAlertsBadge({ onClick }: { onClick?: () => void }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: stats } = useQuery({
    queryKey: ["silvio_alerts_badge", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase.rpc("silvio_alerts_stats", { p_company_id: companyId });
      return data as { critical: number; warning: number; total_open: number };
    },
    enabled: !!companyId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const total = stats?.total_open ?? 0;
  if (total === 0) return null;

  const isCritical = (stats?.critical ?? 0) > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full text-[10px] font-bold transition",
        isCritical ? "bg-rose-500 text-white animate-pulse" : "bg-amber-500 text-white",
      )}
      title={`${total} cose da sapere`}
    >
      {total > 99 ? "99+" : total}
    </button>
  );
}
