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
import { Sparkles, ArrowRight } from "lucide-react";
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
            hasItems ? "text-violet-600" : "text-muted-foreground",
            isCritical && "animate-pulse",
          )} />
          {total > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold ring-2 ring-background",
                isCritical ? "bg-rose-500 text-white animate-pulse" : "bg-violet-500 text-white",
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
        className="w-[420px] sm:w-[480px] p-0 max-h-[80vh] overflow-y-auto"
      >
        <div className="p-3 space-y-3">
          <SilvioAlertsPanel variant="compact" maxItems={6} />
          <SilvioActionProposals compact />
          {!hasItems && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 text-center text-sm">
              <p className="text-emerald-700 font-medium">Tutto sotto controllo ✨</p>
              <p className="text-xs text-muted-foreground mt-1">
                Silvio sta monitorando in autonomia.
              </p>
            </div>
          )}
        </div>
        <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              // Triggera l'apertura del SilvioChatSheet (lo stesso pannello del FAB)
              window.dispatchEvent(new Event("silvio:open-chat"));
            }}
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
          >
            Apri chat con Silvio <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
