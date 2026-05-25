/**
 * Watch real-time per revoca/sospensione accesso commercialista.
 *
 * Sottoscrive a postgres_changes su accountant_company_access per la
 * company corrente. Se lo status passa a 'revoked' o 'suspended':
 *  - mostra toast informativo
 *  - redirect a /commercialista (esce dalla piattaforma cliente)
 *  - invalida cache react-query
 *
 * Usato in CompanyLayout SOLO quando isCommercialistaMode=1.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useAccountantRevocationWatch(
  companyId: string | null | undefined,
  enabled: boolean,
) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !user?.id || !companyId) return;

    const channel = supabase
      .channel(`accountant-access-watch-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "accountant_company_access",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const newRow = (payload.new ?? {}) as { status?: string };
          if (newRow.status === "revoked" || newRow.status === "suspended") {
            const reason =
              newRow.status === "revoked"
                ? "L'azienda ha revocato il tuo accesso."
                : "L'azienda ha sospeso temporaneamente il tuo accesso.";
            toast.warning("Accesso terminato", {
              description: `${reason} Torni allo studio.`,
              duration: 6000,
            });
            queryClient.invalidateQueries({ queryKey: ["accountant"] });
            queryClient.invalidateQueries({ queryKey: ["accountant-current-access-mode"] });
            // Redirect dopo breve delay così il toast si vede
            setTimeout(() => navigate("/commercialista", { replace: true }), 800);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "accountant_company_access",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          toast.warning("Accesso eliminato", {
            description: "L'azienda ti ha rimosso dai commercialisti. Torni allo studio.",
            duration: 6000,
          });
          queryClient.invalidateQueries({ queryKey: ["accountant"] });
          setTimeout(() => navigate("/commercialista", { replace: true }), 800);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, user?.id, companyId, navigate, queryClient]);
}
