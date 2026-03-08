import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Subscribes to real-time INSERT events on integration_webhook_events
 * for the current company, showing a toast when a new Facebook lead arrives.
 */
export function useMetaLeadNotifications() {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
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
          if (event.event_type === "leadgen") {
            const leadgenId = event.payload?.leadgen_id || "";
            toast.info("Nuovo lead da Facebook! 🎯", {
              description: `Lead ID: ${leadgenId.slice(0, 12)}...`,
              duration: 8000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);
}
