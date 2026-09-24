// Invio allo SDI e aggiornamento dell'esito, uguali in editor, dettaglio e
// cassetto (24/09/2026). Prima ogni pagina aveva la sua copia: nessuna
// rileggeva il documento dopo l'invio, e l'editor continuava a dire «non
// inviata al SDI» con il pulsante ancora lì. Chi ricliccava riceveva «già
// trasmesso».

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { usePaymentGateStore } from "@/store/paymentGateStore";
import { rileggiDocumentoFiscale } from "@/hooks/useDocumentiFiscali";
import { faseSdi, motivoSdi } from "@/lib/fatturazione/sdiCassetto";
import type { DocumentoFiscale } from "@/types/fatturazione";

/** Il motivo vero di una risposta non 2xx: sta nel corpo, non nel messaggio. */
async function motivoDellaRisposta(err: unknown): Promise<{ status?: number; messaggio: string }> {
  const ctx = (err as { context?: Response }).context;
  let messaggio = err instanceof Error ? err.message : "Operazione non riuscita";
  try {
    const corpo = await ctx?.json?.();
    if (typeof corpo?.error === "string") messaggio = corpo.error;
    else messaggio = motivoSdi(corpo?.errors) ?? messaggio;
  } catch { /* resta il messaggio generico */ }
  return { status: ctx?.status, messaggio };
}

class PagamentoRichiesto extends Error {}

interface EsitoInvio {
  manuale: boolean;
  avviso: string | null;
}

/**
 * «Invia allo SDI». Riuscito o no, alla fine rilegge il documento e lo passa
 * a `aggiorna`: la pagina mostra subito la fase nuova («In elaborazione»), o
 * il motivo dell'errore.
 */
export function useInvioSdi(aggiorna?: (doc: DocumentoFiscale) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<EsitoInvio> => {
      const resp = await supabase.functions.invoke("invia-sdi", { body: { documento_id: id } });
      if (resp.error) {
        const e = await motivoDellaRisposta(resp.error);
        // 402: carta obbligatoria per il piano, si apre il dialog apposta.
        if (e.status === 402) {
          usePaymentGateStore.getState().show();
          throw new PagamentoRichiesto(e.messaggio);
        }
        throw new Error(e.messaggio);
      }
      const r = resp.data as { success?: boolean; errors?: unknown; manuale?: boolean; avviso?: string | null };
      if (!r?.success) throw new Error(motivoSdi(r?.errors) ?? "Lo SDI non ha accettato l'invio. Controlla i dati e riprova.");
      return { manuale: !!r.manuale, avviso: r.avviso ?? null };
    },
    onSuccess: (r) => {
      if (r.manuale) {
        toast.success("XML della fattura pronto", { description: r.avviso ?? undefined, duration: 10000 });
      } else {
        toast.success("Fattura inviata allo SDI", {
          description: "Ora è in elaborazione: di solito lo SDI risponde in pochi minuti.",
        });
      }
    },
    onError: (err) => {
      if (err instanceof PagamentoRichiesto) return;
      toast.error("Invio allo SDI non riuscito", { description: err.message });
    },
    onSettled: async (_r, _e, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      try {
        aggiorna?.(await rileggiDocumentoFiscale(id));
      } catch { /* resta la vista di prima: la lista si ricarica comunque */ }
    },
  });
}

/**
 * «Aggiorna stato»: chiede subito allo SDI (tramite openapi) com'è finita,
 * senza aspettare il giro automatico di ogni quarto d'ora.
 */
export function useAggiornaStatoSdi(aggiorna?: (doc: DocumentoFiscale) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<DocumentoFiscale> => {
      const resp = await supabase.functions.invoke("sdi-stato-tick", { body: { documento_id: id } });
      if (resp.error) throw new Error((await motivoDellaRisposta(resp.error)).messaggio);
      return rileggiDocumentoFiscale(id);
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      aggiorna?.(doc);
      const f = faseSdi(doc);
      if (f?.fase === "in_elaborazione") {
        toast.info("Ancora in elaborazione", { description: "Lo SDI non ha ancora risposto. Lo stato si aggiorna anche da solo." });
      } else if (f) {
        toast.success(`Stato SDI: ${f.etichetta}`, { description: f.spiegazione });
      }
    },
    onError: (err) => toast.error("Stato SDI non aggiornato", { description: err.message }),
  });
}
