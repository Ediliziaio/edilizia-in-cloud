import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Ascolta due canali real-time:
 * 1. integration_webhook_events INSERT → toast immediato alla ricezione del lead
 * 2. notifications INSERT (type=meta_lead_assigned) → toast quando il lead è assegnato all'utente
 */
export function useMetaLeadNotifications() {
  const { effectiveCompany, user } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const userId = (user as any)?.id;

  useEffect(() => {
    if (!companyId) return;

    // Canale 1: ricezione webhook (lead arrivato in coda)
    const webhookChannel = supabase
      .channel(`meta-leads-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "integration_webhook_events",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const event = payload.new as any;
          if (event.event_type === "leadgen" && !event.payload?.is_test) {
            toast.info("Nuovo lead da Facebook ricevuto", {
              description: "Verrà elaborato e assegnato entro 2 minuti.",
              duration: 6000,
            });
          }
        }
      )
      .subscribe();

    // Canale 2: notifica assegnazione (solo per l'utente corrente)
    const notifChannel = userId
      ? supabase
          .channel(`meta-lead-notif-${userId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              const notif = payload.new as any;
              if (notif.type === "meta_lead_assigned") {
                toast.success(notif.title, {
                  description: notif.body,
                  duration: 10000,
                  action: notif.action_url
                    ? {
                        label: "Visualizza",
                        onClick: () => window.open(notif.action_url, "_self"),
                      }
                    : undefined,
                });
              }
            }
          )
          .subscribe()
      : null;

    return () => {
      supabase.removeChannel(webhookChannel);
      if (notifChannel) supabase.removeChannel(notifChannel);
    };
  }, [companyId, userId]);
}
