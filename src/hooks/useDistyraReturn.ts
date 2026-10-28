/**
 * Il cliente torna dalla banca su /azienda/tesoreria?bank_provider=distyra&dy=<rif>.
 * Qui si conclude il collegamento (conti) e si portano dentro i primi movimenti.
 *
 * Il riferimento `dy` lo abbiamo messo noi nell'URL di ritorno: Distyra non promette
 * parametri suoi. Il server lo verifica contro la riga dell'azienda, quindi un indirizzo
 * scritto a mano non combina niente.
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invokeDistyra } from "@/lib/banking/distyra";
import { BANKING_QUERY_KEYS } from "@/lib/banking/saltedge";

export function useDistyraReturn(companyId: string | null | undefined, onChanged?: () => void, enabled = true) {
  const [params, setParams] = useSearchParams();
  const inCorso = useRef(false), cambiato = useRef(onChanged);
  cambiato.current = onChanged;
  const [finalizing, setFinalizing] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !companyId || params.get("bank_provider") !== "distyra" || inCorso.current) return;
    const rif = params.get("dy");
    const pulisci = () => setParams(attuali => {
      if (attuali.get("dy") !== rif) return attuali;
      const next = new URLSearchParams(attuali);
      ["bank_provider", "dy", "status", "connection_id"].forEach(k => next.delete(k));
      return next;
    }, { replace: true });
    if (!rif) { toast.error("Collegamento non completato. Riprova da Collega conto."); pulisci(); return; }
    inCorso.current = true; setFinalizing(true);
    const avviso = toast.loading("Collegamento conto in corso...");
    void (async () => {
      try {
        const conti = await invokeDistyra(companyId, { action: "finalize", state: rif });
        const mov = await invokeDistyra(companyId, { action: "sync", connection_id: conti?.connection_id ?? undefined, state: rif })
          // I conti sono collegati comunque: se i movimenti non arrivano subito si
          // riprendono al prossimo giro, senza far fallire il collegamento.
          .catch((): null => null);
        toast.success(`Conto collegato: ${conti?.conti ?? 0} conti, ${mov?.movimenti ?? 0} movimenti`, { id: avviso });
        BANKING_QUERY_KEYS.forEach(key => qc.invalidateQueries({ queryKey: [key] }));
        cambiato.current?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Collegamento non completato", { id: avviso });
      } finally { pulisci(); setFinalizing(false); inCorso.current = false; }
    })();
  }, [companyId, params, setParams, qc, enabled]);
  return finalizing;
}
