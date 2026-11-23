import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isFinancialQuery } from "@/lib/orders/financialRefresh";
import { createFinancialLiveRefresh } from "@/lib/finance/financialLiveRefresh";
import { shareSubscription } from "@/lib/realtime/shareSubscription";
import { subscribeChannel } from "@/lib/realtime/subscribeChannel";

let progressivoCanale = 0;
const nuovoSuffissoCanale = () => `${Date.now().toString(36)}-${(progressivoCanale++).toString(36)}`;

export function useFinancialLive() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const client = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    return shareSubscription(client, `finanza-live:${companyId}`, () => {
      const predicate = (q: { queryKey: readonly unknown[] }) => isFinancialQuery(q.queryKey);
      const active = () => client.getQueryCache().findAll({ predicate, type: "active" }).length > 0;
      const queue = createFinancialLiveRefresh({
        active,
        busy: () => client.isMutating() > 0 || client.isFetching({ predicate }) > 0,
        visible: () => !document.hidden,
        online: () => navigator.onLine,
        fingerprint: async () => {
          const { data, error } = await supabase.rpc("finanza_revisione", { p_company_id: companyId });
          if (error) throw error;
          return data;
        },
        refresh: () => client.invalidateQueries({ predicate }, { cancelRefetch: false, throwOnError: true }),
      });
      // Nome unico a ogni apertura: supabase.channel() restituisce il canale già esistente con
      // lo stesso nome, e se è ancora iscritto (la chiusura precedente non è finita, es. l'azienda
      // che arriva al ripristino della sessione) `.on()` lancia «cannot add postgres_changes
      // callbacks … after subscribe()» e l'errore abbatte l'app intera (visto il 23/11/2026).
      const channel = supabase.channel(`finanza-live:${companyId}:${nuovoSuffissoCanale()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "finanza_revisioni", filter: `company_id=eq.${companyId}` }, () => queue.request());
      subscribeChannel(channel, "finanza-live", { onSubscribed: queue.request, onDead: queue.request });
      // Ritorno, riconnessione ed eventi persi: si rilegge solo il piccolo
      // segnale aziendale. Nessun polling globale delle query finanziarie.
      const resume = () => queue.request();
      const timer = setInterval(resume, 30_000);
      window.addEventListener("focus", resume);
      window.addEventListener("online", resume);
      document.addEventListener("visibilitychange", resume);
      const unsubscribe = client.getQueryCache().subscribe(event => {
        if (event.type === "observerAdded" && predicate(event.query)) queue.request();
      });
      queue.request();
      return () => {
        queue.dispose(); clearInterval(timer); unsubscribe();
        window.removeEventListener("focus", resume);
        window.removeEventListener("online", resume);
        document.removeEventListener("visibilitychange", resume);
        void supabase.removeChannel(channel);
      };
    });
  }, [client, companyId]);
}
