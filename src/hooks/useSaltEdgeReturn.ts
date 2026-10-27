import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BANKING_QUERY_KEYS, invokeSaltEdge } from "@/lib/banking/saltedge";

export function useSaltEdgeReturn(companyId: string | null | undefined, onChanged?: () => void, enabled = true) {
  const [params, setParams] = useSearchParams();
  const running = useRef(false), changed = useRef(onChanged);
  changed.current = onChanged;
  const [finalizing, setFinalizing] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !companyId || params.get("bank_provider") !== "saltedge" || running.current) return;
    const state = params.get("se_state"), connection = params.get("connection_id");
    const clear = () => setParams(current => {
      if (current.get("se_state") !== state) return current;
      const next = new URLSearchParams(current);
      ["error_class", "connection_id", "se_state", "bank_provider"].forEach(k => next.delete(k));
      return next;
    }, { replace: true });
    if (params.get("error_class") || !state || !connection) {
      toast.error("Collegamento non completato o consenso annullato. Riprova da Collega conto."); clear(); return;
    }
    running.current = true; setFinalizing(true);
    const message = toast.loading("Collegamento conto in corso...");
    void (async () => {
      try {
        // The server verifies the nonce, its owner, company and provider customer.
        const data = await invokeSaltEdge(companyId, { action: "finalize", provider_connection_id: connection, state });
        if (data?.processing) toast.info("Consenso ricevuto. La banca sta preparando i dati.", { id: message });
        else toast.success(`Conto collegato: ${data?.imported ?? 0} movimenti sincronizzati`, { id: message });
        BANKING_QUERY_KEYS.forEach(key => qc.invalidateQueries({ queryKey: [key] }));
        changed.current?.();
      } catch (e) { toast.error(e instanceof Error ? e.message : "Collegamento non completato", { id: message }); }
      finally { clear(); setFinalizing(false); running.current = false; }
    })();
  }, [companyId, params, setParams, qc, enabled]);
  return finalizing;
}
