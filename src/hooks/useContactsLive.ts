import { useEffect } from "react";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { createLiveRefresh } from "@/lib/realtime/createLiveRefresh";
import { subscribeChannel } from "@/lib/realtime/subscribeChannel";

/** Solo cache della società visualizzata, anche nel CRM del superadmin. */
export function isCompanyContactQuery(query: Pick<Query, "queryKey">, companyId: string) {
  const key = query.queryKey;
  if (key[0] === "marketing-contacts") {
    // Elenco storico: [root, companyId, ...filtri]; nuove query: [root, tipo, companyId].
    return key[1] === companyId || (["list", "reachability", "field-values", "filter-values"].includes(String(key[1])) && key[2] === companyId);
  }
  return (key[0] === "marketing-contact-lists" && key[1] === companyId)
    || (key[0] === "list-members" && key[1] === companyId);
}

export function useContactsLive() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const client = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const predicate = (query: Query) => isCompanyContactQuery(query, companyId);
    const queue = createLiveRefresh({
      busy: () => client.isMutating() > 0 || client.isFetching({ predicate }) > 0,
      refresh: (reconcile) => client.invalidateQueries({
        predicate: (query) => predicate(query) || (reconcile && query.queryKey[0] === "marketing-pipelines" && query.queryKey[2] === companyId),
      }, { cancelRefetch: false }),
    });
    let subscribed = false;
    let disposed = false;
    // Le opportunità sono colonne derivate dell'elenco contatti e criteri dei
    // filtri. Una fase cambiata da un collega deve aggiornare anche questa vista.
    // Questa è la tabella CRM già pubblicata dalle migrazioni del progetto.
    // Non aggiungere qui tabelle non pubblicate: possono far fallire l'intera
    // subscription. Contatti/liste si riconciliano al ritorno e ogni 2 minuti.
    const table = { schema: "public", table: "marketing_opportunities" } as const;
    const channel = supabase.channel(`contatti-live:${companyId}:${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "INSERT", ...table, filter: `company_id=eq.${companyId}` }, () => queue.request())
      .on("postgres_changes", { event: "UPDATE", ...table, filter: `company_id=eq.${companyId}` }, () => queue.request())
      // DELETE non supporta filtri: si rilegge solo la società corrente,
      // sempre con debounce/backoff, senza usare la riga ricevuta come dato.
      .on("postgres_changes", { event: "DELETE", ...table }, () => queue.request());
    subscribeChannel(channel, "contatti-live", {
      onSubscribed: () => {
        if (disposed) return;
        if (subscribed) queue.request(true);
        subscribed = true;
      },
    });
    return () => {
      disposed = true;
      queue.dispose();
      void supabase.removeChannel(channel);
    };
  }, [client, companyId]);
}
