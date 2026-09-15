import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Modifica il testo di una nota di contatto o di opportunità.
 *
 * Il database decide chi può (vedi lib/marketing/modificaNota): se la regola
 * non lo consente l'aggiornamento non tocca nessuna riga, e lo si dice invece
 * di mostrare «salvato» su una nota rimasta com'era.
 */
export function useModificaNota() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const testo = content.trim();
      if (!testo) throw new Error("La nota non può essere vuota");
      const { data, error } = await supabase
        .from("marketing_contact_notes")
        .update({ content: testo })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Non puoi modificare questa nota: l'ha scritta un collega.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: ["marketing_contact_notes"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      toast.success("Nota modificata");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Nota non modificata"),
  });
}
