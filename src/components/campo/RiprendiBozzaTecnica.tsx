import { useEffect, useState } from "react";
import { ModificaAvanzamentoCampo } from "@/components/campo/ModificaAvanzamentoCampo";
import { RegistraVisitaCampo } from "@/components/campo/RegistraVisitaCampo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { destinazioneAvanzamento, type BozzaTecnica, type DestinazioneAvanzamento } from "@/lib/campo/bozzaTecnica";
import { isOnline } from "@/lib/campo/network-status";
import { statoInvioTecnico } from "@/lib/campo/tecnicaInCoda";
import { withAbortableClientTimeout } from "@/lib/query-timeout";

export function RiprendiBozzaTecnica({ bozza, chiudi }: { bozza: BozzaTecnica; chiudi: () => void }) {
  const [iniziale] = useState(bozza);
  const [esito, setEsito] = useState<{ target?: DestinazioneAvanzamento; errore?: string }>();
  const [tentativo, setTentativo] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { payload, operationId } = iniziale;
    const locale = () => ({ target: payload.tipo === "avanzamento" ? payload.target : undefined });
    async function verifica() {
      if (!isOnline()) return locale();
      if (await statoInvioTecnico(payload, operationId, controller.signal)) {
        return { errore: "Questa registrazione è già stata inviata." };
      }
      if (payload.tipo === "rilievo") return {};
      const { data, error } = await withAbortableClientTimeout(signal => supabase.rpc("campo_scheda_cantiere", {
        p_azienda: payload.company_id, p_ordine: payload.order_id, p_sezione: "piano",
      }).abortSignal(signal), "Lettura avanzamento", undefined, controller.signal);
      if (error) throw error;
      const target = data?.permessi?.aggiorna_fasi && destinazioneAvanzamento(data, payload.target.faseId, payload.target.sottofaseId);
      return target ? { target } : { errore: "Il cantiere o il permesso di registrazione non è più disponibile." };
    }
    void verifica().then(result => {
      if (!controller.signal.aborted) setEsito(result);
    }, error => {
      if (controller.signal.aborted) return;
      if (!isOnline()) setEsito(locale());
      else setEsito({ errore: error?.code === "permesso" || error?.code === "42501"
        ? "Il cantiere o il permesso di registrazione non è più disponibile."
        : "Non riesco a verificare l’accesso al cantiere. Riprova." });
    });
    return () => controller.abort();
  }, [iniziale, tentativo]);

  if (!esito) return <p role="status" className="text-sm text-muted-foreground">Apro la bozza…</p>;
  if (esito.errore) return <div role="alert" className="space-y-1 rounded-xl border bg-card p-3 text-sm">
    <p>{esito.errore}</p>
    <div className="flex gap-2">
      <Button type="button" variant="outline" className="min-h-11" onClick={() => { setEsito(undefined); setTentativo(n => n + 1); }}>Riprova</Button>
      <Button type="button" variant="ghost" className="min-h-11" onClick={chiudi}>Chiudi</Button>
    </div>
  </div>;
  const { payload } = iniziale;
  const props = {
    orderId: payload.order_id, companyId: payload.company_id, userId: payload.user_id,
    cantiere: payload.nomeCantiere, onClose: chiudi, onSaved: chiudi,
  };
  return payload.tipo === "rilievo" ? <RegistraVisitaCampo {...props} tipo={payload.visita} />
    : esito.target ? <ModificaAvanzamentoCampo {...props} target={esito.target} /> : null;
}
