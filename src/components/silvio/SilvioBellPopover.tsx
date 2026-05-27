/**
 * SilvioBellPopover — Bell icon globale + popover con alerts e proposals
 *
 * Posiziona in topbar o navbar. Mostra:
 *   - Badge rosso/arancio con count critical+warning
 *   - Popover con AlertsPanel + ActionProposals compatto
 *   - Link "Apri Cose da sapere" → /azienda/attivita?tab=cose_da_sapere
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SilvioAlertsPanel } from "./SilvioAlertsPanel";
import { SilvioActionProposals } from "./SilvioActionProposals";

export function SilvioBellPopover() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [open, setOpen] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["silvio_alerts_badge_topbar", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase.rpc("silvio_alerts_stats", { p_company_id: companyId });
      return data as { critical: number; warning: number; info: number; total_open: number };
    },
    enabled: !!companyId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });

  // Pending proposals count
  // FIX TENANT ISOLATION: filtro esplicito company_id (RLS+bypass super_admin
  // ignora impersonation, quindi il filtro client è OBBLIGATORIO).
  const { data: pendingProposals } = useQuery({
    queryKey: ["silvio_pending_proposals_count", companyId],
    queryFn: async () => {
      if (!companyId) return 0;
      const { count } = await supabase
        .from("ai_action_proposals" as never)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending");
      return count ?? 0;
    },
    enabled: !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const totalAlerts = stats?.total_open ?? 0;
  const totalProposals = pendingProposals ?? 0;
  const total = totalAlerts + totalProposals;
  const isCritical = (stats?.critical ?? 0) > 0;
  const hasItems = total > 0;

  if (!companyId) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          title="Silvio — Cose da sapere"
        >
          <Sparkles className={cn(
            "h-5 w-5",
            hasItems ? "text-orange-500" : "text-muted-foreground",
            isCritical && "animate-pulse",
          )} />
          {total > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold ring-2 ring-background",
                isCritical ? "bg-rose-500 text-white animate-pulse" : "bg-orange-500 text-white",
              )}
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        /* v8.6.66 — mobile fix: era w-[420px] fisso ma viewport iPhone è
           375px → overflow di 45px a destra. Ora capped a viewport-aware. */
        className="w-[min(380px,calc(100vw-1.5rem))] sm:w-[500px] p-0 overflow-hidden"
      >
        <div className="flex max-h-[min(82vh,680px)] flex-col bg-background">
          <div className="border-b bg-gradient-to-r from-orange-50 via-white to-slate-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold leading-tight text-slate-950">Regia Silvio</p>
                    <p className="text-xs text-muted-foreground">
                      {hasItems
                        ? `${total} ${total === 1 ? "priorità aperta" : "priorità aperte"} da verificare`
                        : "Tutto monitorato in autonomia"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {isCritical && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">
                    <AlertTriangle className="h-3 w-3" />
                    Critico
                  </span>
                )}
                {!isCritical && hasItems && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    Attenzione
                  </span>
                )}
                {!hasItems && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Ok
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
            <SilvioAlertsPanel variant="compact" maxItems={totalProposals > 0 ? 4 : 6} />
            <SilvioActionProposals compact />
            {!hasItems && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 text-center text-sm">
                <p className="font-medium text-emerald-700">Tutto sotto controllo</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Silvio continua a monitorare incassi, scadenze, preventivi e lavoro operativo.
                </p>
              </div>
            )}
          </div>

          <div className="border-t bg-muted/20 p-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                // Triggera l'apertura del SilvioChatSheet (lo stesso pannello del FAB)
                window.dispatchEvent(new Event("silvio:open-chat"));
              }}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-md border bg-background text-xs font-semibold text-primary transition hover:bg-primary/5"
            >
              Apri chat con Silvio <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
