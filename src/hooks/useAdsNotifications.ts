/**
 * useAdsNotifications — bridge realtime su eventi rilevanti per il modulo Ads.
 *
 * Eventi sottoscritti:
 *   • ad_spend_guard UPDATE → last_autopause_at cambia → toast "Campagna pausata"
 *   • meta_campaigns UPDATE → status cambia → toast contestuale
 *
 * Usa Supabase realtime channels. Idempotente: cancella la subscription
 * al cleanup del componente che lo monta.
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useAdsNotifications(companyId: string | undefined) {
  const qc = useQueryClient();
  const lastAutopauseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!companyId) return;

    // Channel per ad_spend_guard
    const guardChannel = supabase
      .channel(`ads-spend-guard-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ad_spend_guard",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const newRow = payload.new as {
            last_autopause_at: string | null;
            last_autopause_reason: string | null;
          };
          // Notifica solo se è una NUOVA autopause (timestamp diverso)
          if (
            newRow.last_autopause_at &&
            newRow.last_autopause_at !== lastAutopauseRef.current
          ) {
            lastAutopauseRef.current = newRow.last_autopause_at;
            toast.warning("Campagne in pausa automatica", {
              description:
                newRow.last_autopause_reason ??
                "Lo Spend Guard ha messo in pausa le campagne attive. Verifica e riattiva manualmente.",
              duration: 10000,
            });
            qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
            qc.invalidateQueries({ queryKey: ["ad-spend-guard", companyId] });
          }
        },
      )
      .subscribe();

    // Channel per meta_campaigns (status changes)
    const campaignChannel = supabase
      .channel(`ads-campaigns-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "meta_campaigns",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const newRow = payload.new as { name: string; status: string; publish_error: string | null };
          const oldRow = payload.old as { status: string };
          if (newRow.status === oldRow.status) return;

          if (newRow.status === "error" && newRow.publish_error) {
            toast.error(`Errore pubblicazione: ${newRow.name}`, {
              description: newRow.publish_error.substring(0, 200),
              duration: 10000,
            });
          } else if (newRow.status === "active" && oldRow.status !== "active") {
            toast.success(`Campagna LIVE: ${newRow.name}`, {
              duration: 5000,
            });
          } else if (newRow.status === "paused" && oldRow.status === "active") {
            toast.info(`Campagna messa in pausa: ${newRow.name}`, {
              duration: 5000,
            });
          }
          qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(guardChannel);
      void supabase.removeChannel(campaignChannel);
    };
  }, [companyId, qc]);
}
